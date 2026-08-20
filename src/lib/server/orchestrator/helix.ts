// Helix orchestration implementation. Public RPC exports remain available
// through the stable `src/lib/server/agents.ts` facade.
import { htmlForPrompt } from "@/lib/templates";
import { titleFromPrompt } from "@/lib/utils";
import { LOCALE_NAME } from "@/lib/i18n-core";
import type {
	AgentId,
	AgentStep,
	BuildJob,
} from "@/lib/agent-types";
import { HOUSE_BY_ID, agentByName, craftOf, knowledgeHints, localExperts, orchestrate, stackFor, type HouseId } from "@/lib/house";
import { GEMS } from "@/lib/gems";
import { computeScore } from "@/lib/score";
import { classifyBrief, briefLine } from "@/lib/brief";
import { persistBuildJob } from "@/lib/server/persistence/build-jobs";
import { requestAgentCompletion } from "@/lib/server/ai/gateway";
import { AiProviderError } from "@/lib/server/ai/types";
import {
	extractHtml,
	isValidHtmlArtifact,
} from "@/lib/server/agents/html";
import { selectDesignDirection } from "@/lib/server/agents/design";
import {
	AGENT_CONTRACTS,
	type AgentContractId,
} from "@/lib/server/agents/contracts";
import {
	applyControlledGemPatch,
	sha256Hex,
} from "@/lib/server/agents/patch";
import { HELIX_PIPELINE_VERSION } from "@/lib/server/jobs/pipeline";
import { BuildJobLeaseLostError } from "@/lib/server/jobs/queue";
import { runIrisReview, runSuperiorFix } from "@/lib/server/review/agents";
import { finalizeReleaseCandidate } from "@/lib/server/release/candidate";
import { runAegisStaticScan } from "@/lib/server/quality/aegis";
import { runBrowserQuality } from "@/lib/server/quality/runner";
import type { AegisReport } from "@/lib/server/quality/types";
import {
	atlasSystemPrompt,
	forgeLogicSystemPrompt,
	forgeUiSystemPrompt,
	gemSystemPrompt,
	lumenSystemPrompt,
	novaSystemPrompt,
} from "@/lib/server/prompts/helix";
import {
	AgentOutputError,
	ArchitectureSchema,
	DesignDirectionSchema,
	DesignSelectionSchema,
	ProductPlanSchema,
	ReviewResultSchema,
	type Architecture,
	type AgentBuildInput,
	type AgentGemInput,
	type ChatGrokOptions,
	type DesignDirection,
	type DesignSelection,
	type GemPatch,
	type ProductPlan,
	type ReviewResult,
	type RunCrewResult,
} from "@/lib/server/agents/types";

export type { AgentId, AgentStep, BuildJob };

const CONTRACT_BY_HOUSE_ID: Partial<Record<HouseId, AgentContractId>> = {
	gemini: "helix",
	nova: "nova",
	atlas: "atlas",
	lumen: "lumen",
	forge: "forgeLogic",
	iris: "iris",
	patch: "superior",
};

function stepKind(id: HouseId): AgentStep["kind"] {
	if (CONTRACT_BY_HOUSE_ID[id]) {
		return id === "gemini" ? "orchestrator" : "ai_agent";
	}
	if (["aegis", "veil", "echo"].includes(id)) return "scanner";
	if (["twin", "storm", "harbor", "nimbus", "warden", "orbit", "cedar"].includes(id)) {
		return "service";
	}
	if (["seal"].includes(id)) return "gate";
	if (["swift", "moth", "quill", "senate", "augur", "kiln", "beacon", "ledger", "mend"].includes(id)) {
		return "validator";
	}
	return "rule";
}

function stepFor(
	id: HouseId,
	status: AgentStep["status"] = "queued",
	detail = "",
): AgentStep {
	const a = HOUSE_BY_ID[id];
	const contractId = CONTRACT_BY_HOUSE_ID[id];
	const contract = contractId ? AGENT_CONTRACTS[contractId] : undefined;
	const localContract = id === "aegis"
		? { version: "1.0.0", artifact: "static_security_report" }
		: undefined;
	return {
		id,
		agent: a.name,
		role: a.role,
		desk: a.desk,
		kind: stepKind(id),
		...(contract
			? { version: contract.version, artifact: contract.artifact }
			: localContract ?? {}),
		status,
		detail
	};
}
function setStep(
	job: BuildJob,
	id: HouseId,
	patch: Partial<Omit<AgentStep, "id">>,
): void {
	const i = job.steps.findIndex((s) => s.id === id);
	if (i < 0) job.steps.push({
		...stepFor(id),
		...patch
	});
	else job.steps[i] = {
		...job.steps[i],
		...patch
	};
}
function setBrowserEvidenceStep(
	job: BuildJob,
	id: "twin" | "echo" | "swift",
	label: string,
	report: {
		status: "completed" | "failed" | "not_run";
		evidence: "measured" | "not_run";
		durationMs?: number;
		errorCode?: string;
		reasonCode?: string;
	},
): void {
	const completed = report.status === "completed";
	const failed = report.status === "failed";
	setStep(job, id, {
		status: completed ? "done" : failed ? "error" : "skipped",
		detail: completed
			? `${label} measured · ${report.durationMs ?? 0} ms`
			: failed
				? `${label} failed · ${report.errorCode ?? "unknown error"}`
				: `${label} not run · ${report.reasonCode ?? "runner unavailable"}`,
		validation: report.evidence === "measured" ? "validated" : "not_run",
	});
}
function think(job: BuildJob, agent: string, it: string, en: string): void {
	const a = agentByName(agent);
	const gem = GEMS.find((g) => g.name === agent);
	const craft = a ? (job.locale === "it" ? a.craftIt : a.craft) : gem ? (job.locale === "it" ? gem.craftIt : gem.craft) : "";
	const role = a ? (job.locale === "it" ? a.roleIt : a.role) : gem ? (job.locale === "it" ? gem.craftIt : gem.craft) : "";
	const text = job.locale === "it" ? it : en;
	job.thoughts = [...job.thoughts ?? [], {
		at: Date.now(),
		agent,
		text,
		role,
		craft
	}];
	if (job.thoughts.length > 50) job.thoughts = job.thoughts.slice(-40);
}
function pulse(
	job: BuildJob,
	agent: string,
	doingIt: string,
	doingEn: string,
): () => void {
	const start = Date.now();
	const id = setInterval(() => {
		const s = Math.round((Date.now() - start) / 1e3);
		const it = `${doingIt} ${s}s.`;
		const en = `${doingEn} ${s}s.`;
		const text = job.locale === "it" ? it : en;
		const prev = job.thoughts ?? [];
		const last = prev[prev.length - 1];
		if (last?.agent === agent && /\d+s/.test(last.text)) {
			last.text = text;
			last.at = Date.now();
			if (!last.craft) last.craft = craftOf(agent, job.locale);
			if (!last.role) last.role = agentByName(agent)?.role ?? "";
		} else job.thoughts = [...prev, {
			at: Date.now(),
			agent,
			text,
			craft: craftOf(agent, job.locale),
			role: agentByName(agent)?.role ?? ""
		}];
	}, 4e3);
	return () => clearInterval(id);
}
function remember(job: BuildJob, agent: string, decision: string): void {
	job.memory = [...job.memory ?? [], {
		at: Date.now(),
		agent,
		decision
	}];
}
function loadPipeline(
	job: BuildJob,
	active: HouseId[],
	standby: HouseId[],
	why: string,
): void {
	setStep(job, "gemini", {
		status: "done",
		detail: why
	});
	const rest = active.filter((id) => id !== "gemini");
	job.steps = [
		job.steps.find((s) => s.id === "gemini") ?? stepFor("gemini", "done", why),
		...rest.map((id) => stepFor(id)),
		...standby.map((id) => stepFor(id, "standby", "Standby"))
	];
}

type CheckpointStage = NonNullable<BuildJob["checkpoint"]>["stage"];
type CheckpointArtifacts = NonNullable<
	NonNullable<BuildJob["checkpoint"]>["artifacts"]
>;

function checkpoint(
	job: BuildJob,
	stage: CheckpointStage,
	artifacts: CheckpointArtifacts = {},
	gemIndex = job.checkpoint?.gemIndex,
): void {
	if (!job.requestFingerprint) {
		throw new AgentOutputError("BUILD_JOB_FINGERPRINT_MISSING", false);
	}
	job.checkpoint = {
		pipelineVersion: HELIX_PIPELINE_VERSION,
		requestFingerprint: job.requestFingerprint,
		stage,
		artifacts: {
			...(job.checkpoint?.artifacts ?? {}),
			...artifacts,
		},
		...(gemIndex === undefined ? {} : { gemIndex }),
	};
}

const persist = persistBuildJob;

export { persistBuildJob };
export async function runCrew(job: BuildJob): Promise<RunCrewResult> {
	const validatedInput = AGENT_CONTRACTS.helix.inputSchema.safeParse({
		jobId: job.id,
		prompt: job.prompt,
		locale: job.locale,
		mode: job.mode,
		buildLevel: job.buildLevel,
		currentHtml: job.currentHtml,
		gear: job.gear ?? "auto",
		max: job.max ?? false,
	});
	if (!validatedInput.success) {
		throw new AgentOutputError("HELIX_INPUT_INVALID", false);
	}
	if (job.buildLevel !== "prototype") {
		throw new AgentOutputError("PRODUCTION_PIPELINE_NOT_CONFIGURED", false);
	}
	const lang = LOCALE_NAME[job.locale];
	const mode = job.mode === "host" ? "generate" : job.mode;
	if (!job.requestFingerprint) {
		throw new AgentOutputError("BUILD_JOB_FINGERPRINT_MISSING", false);
	}
	const compatibleCheckpoint =
		job.checkpoint?.pipelineVersion === HELIX_PIPELINE_VERSION &&
		job.checkpoint.requestFingerprint === job.requestFingerprint;
	if (!compatibleCheckpoint) {
		job.checkpoint = {
			pipelineVersion: HELIX_PIPELINE_VERSION,
			requestFingerprint: job.requestFingerprint,
			stage: "queued",
		};
		job.gems = [];
	}
	const resumedStage = job.checkpoint?.stage;
	const savedArtifacts = job.checkpoint?.artifacts;
	if (
		job.checkpoint?.stage === "finalized" &&
		savedArtifacts?.usedAi === true &&
		isValidHtmlArtifact(savedArtifacts.html)
	) {
		const resumedAegis = await runAegisStaticScan(savedArtifacts.html);
		const resumedBrowserQuality = await runBrowserQuality({
			html: savedArtifacts.html,
			jobId: job.id,
			signal: job.runtime?.abortSignal,
		});
		job.quality = {
			...(job.quality ?? {}),
			aegis: resumedAegis,
			twin: resumedBrowserQuality.twin,
			echo: resumedBrowserQuality.echo,
			swift: resumedBrowserQuality.swift,
		};
		const resumedScore = await computeScore(
			savedArtifacts.html,
			job.prompt,
			job.quality,
			job.locale,
		);
		const resumedFlow = orchestrate(
			job.prompt,
			mode,
			job.gear ?? "auto",
			job.max ?? false,
		);
		const resumedPlan = ProductPlanSchema.safeParse(savedArtifacts.plan);
		const resumedArchitecture = ArchitectureSchema.safeParse(
			savedArtifacts.architecture,
		);
		finalizeReleaseCandidate({
			job,
			html: savedArtifacts.html,
			plan: resumedPlan.success ? resumedPlan.data : null,
			architecture: resumedArchitecture.success
				? resumedArchitecture.data
				: null,
			stack: stackFor(resumedFlow.needs),
			score: resumedScore,
		});
		setStep(job, "aegis", {
			status: resumedAegis.passed ? "done" : "error",
			detail: `Measured static scan · ${resumedAegis.findings.length} finding(s) · ${resumedAegis.blockerCount} blocker(s)`,
			validation: "validated",
		});
		if (!resumedAegis.passed) {
			throw new AgentOutputError("AEGIS_RELEASE_BLOCKED", false);
		}
		setBrowserEvidenceStep(job, "twin", "Twin browser QA", resumedBrowserQuality.twin);
		if (job.steps.some((step) => step.id === "echo")) {
			setBrowserEvidenceStep(job, "echo", "Echo accessibility", resumedBrowserQuality.echo);
		}
		if (job.steps.some((step) => step.id === "swift")) {
			setBrowserEvidenceStep(job, "swift", "Swift performance", resumedBrowserQuality.swift);
		}
		job.html = savedArtifacts.html;
		job.usedAi = true;
		await persist(job);
		const resumedOutput = AGENT_CONTRACTS.helix.outputSchema.safeParse({
			html: savedArtifacts.html,
			usedAi: true,
			title: job.title,
		});
		if (!resumedOutput.success) {
			throw new AgentOutputError("HELIX_CHECKPOINT_OUTPUT_INVALID");
		}
		return resumedOutput.data;
	}
	const flow = orchestrate(job.prompt, mode, job.gear ?? "auto", job.max ?? false);
	if (!job.checkpoint || job.checkpoint.stage === "queued") {
		loadPipeline(job, flow.active, flow.standby, flow.why);
	} else {
		job.steps = job.steps.map((step) =>
			step.status === "running"
				? { ...step, status: "queued", detail: "Resuming from checkpoint" }
				: step,
		);
		setStep(job, "gemini", {
			status: "done",
			detail: `Resume · ${job.checkpoint.stage}`,
		});
	}
	const brief = classifyBrief(job.prompt);
	think(job, "Helix", briefLine(brief, "it"), briefLine(brief, "en"));
	await persist(job, [{
		role: "assistant",
		content: flow.why,
		kind: "build",
		agent: "Helix"
	}]);
	const on = (id: HouseId) => flow.active.includes(id);
	const savedPlan = ProductPlanSchema.safeParse(savedArtifacts?.plan);
	const savedArchitecture = ArchitectureSchema.safeParse(savedArtifacts?.architecture);
	const savedDesignSelection = DesignSelectionSchema.safeParse(
		savedArtifacts?.designSelection,
	);
	const savedDesign = DesignDirectionSchema.safeParse(savedArtifacts?.design);
	let plan: ProductPlan | null = savedPlan.success ? savedPlan.data : null;
	let architecture: Architecture | null = savedArchitecture.success
		? savedArchitecture.data
		: null;
	let designSelection: DesignSelection | null = savedDesignSelection.success
		? savedDesignSelection.data
		: null;
	let design: DesignDirection | null = designSelection
		? designSelection.directions.find(
			(direction) => direction.id === designSelection?.selectedId,
		) ?? null
		: savedDesign.success
			? savedDesign.data
			: null;
	let html: string | null =
		isValidHtmlArtifact(savedArtifacts?.html)
			? savedArtifacts.html
			: mode === "generate"
				? null
				: job.currentHtml;
	let usedAi = savedArtifacts?.usedAi === true && isValidHtmlArtifact(html);
	let structureHtml = isValidHtmlArtifact(savedArtifacts?.structureHtml)
		? savedArtifacts.structureHtml
		: mode !== "generate" && isValidHtmlArtifact(job.currentHtml)
			? job.currentHtml
			: null;
	job.html = html;
	job.usedAi = usedAi;
	const extraNotes = [brief.lock];
	if (on("archive")) {
		const hints = knowledgeHints(job.prompt);
		setStep(job, "archive", {
			status: "done",
			detail: `${hints.length} local rules · no project-memory retrieval`,
			validation: "estimated",
		});
		extraNotes.push(...hints);
		think(job, "Archive", `Ripesco ${hints.length} pattern per QUESTO brief. Non copio un altro prodotto.`, `Reusing ${hints.length} patterns for THIS brief. Not another product.`);
	}
	if (mode === "generate" && !plan && on("nova")) {
		setStep(job, "nova", {
			status: "running",
			detail: "Structured PRD"
		});
		think(job, "Nova", "Trasformo la frase in un PRD: chi è l'utente, qual è l'azione principale, cosa è MVP.", "Turning the sentence into a PRD: who it's for, the main action, what ships first.");
		await persist(job);
		plan = await agentPlan(job.prompt, lang, brief.lock, job);
		if (plan?.title) job.title = plan.title;
		setStep(job, "nova", {
			status: "done",
			detail: plan.scope.p0.slice(0, 2).join(" · "),
			validation: "validated",
		});
		if (plan) {
			const blob = `${plan.title} ${plan.screens.map((s) => s.name).join(" ")}`.toLowerCase();
			if (brief.domain !== "booking" && brief.domain !== "crm" && /appunt|vetra|prenotaz/.test(blob)) {
				think(job, "Helix", "Il piano stava diventando un’agenda. Lo fermo. Resto sul tuo brief.", "The plan drifted into appointments. Stopped. Staying on your brief.");
				plan = {
					...plan,
					title: titleFromPrompt(job.prompt, job.locale),
					type: brief.form,
					screens: brief.domain === "marketplace" ? [
						{
							name: "Annunci",
							purpose: "Listings with photo and price"
						},
						{
							name: "Dettaglio",
							purpose: "One listing"
						},
						{
							name: "Cerca",
							purpose: "Filter"
						}
					] : plan.screens
				};
			}
			remember(job, "Nova", `PRD: ${plan.title}. ${plan.pitch}`);
			think(job, "Nova", `Prodotto: ${plan.title}. ${plan.pitch} Schermate: ${plan.screens.map((s) => s.name).join(", ")}.`, `Product: ${plan.title}. ${plan.pitch} Screens: ${plan.screens.map((s) => s.name).join(", ")}.`);
			checkpoint(job, "planned", { plan });
			await persist(job, [{
				role: "assistant",
				content: `${plan.title}. ${plan.pitch}`,
				kind: "build",
				agent: "Nova"
			}]);
		}
	}
	if (mode === "generate" && !architecture && on("atlas")) {
		setStep(job, "atlas", {
			status: "running",
			detail: "Architecture artifact",
		});
		think(job, "Atlas", "Prima del codice disegno route, flussi dati, contratti e failure mode.", "Before code: routes, data flows, contracts, and failure modes.");
		await persist(job);
		architecture = await agentArchitecture(
			job.prompt,
			plan,
			lang,
			brief.lock,
			job,
		);
		setStep(job, "atlas", {
			status: "done",
			detail: `${architecture.routeMap.length} routes · ${architecture.failureModes.length} failure modes`,
			validation: "validated",
		});
		remember(job, "Atlas", `Routes: ${architecture.routeMap.join(", ")}`);
		checkpoint(job, "architected", { plan, architecture });
		await persist(job, [{
			role: "assistant",
			content: `${architecture.productType}. ${architecture.deploymentTarget}`,
			kind: "build",
			agent: "Atlas",
		}]);
	}
	const stack = stackFor(flow.needs);
	if (on("sol")) {
		setStep(job, "sol", {
			status: "done",
			detail: `Heuristic stack note · ${stack.back}`,
			validation: "estimated",
		});
		think(job, "Sol", `Stack: ${stack.front} ${stack.back}`, `Stack: ${stack.front} ${stack.back}`);
	}
	if (on("reed")) {
		setStep(job, "reed", {
			status: "skipped",
			detail: "UX research not run · generic journey assumption only",
			validation: "not_run",
		});
	}
	if (on("vault") || on("prism") || on("nexus") || on("basalt") || on("quartz") || on("apex") || on("key")) {
		extraNotes.push(flow.needs.includes("payments") ? "DEMO MOCK checkout only. Label it as mock; no payment or credits." : "", flow.needs.includes("auth") ? "DEMO MOCK session only. Label it as mock; no production auth." : "", flow.needs.includes("data") ? "Prototype in-memory collections only. Label persistence as unavailable." : "");
		if (on("vault")) setStep(job, "vault", {
			status: "standby",
			detail: "Prototype only · no API routes, jobs or business rules generated",
			validation: "not_run",
		});
		if (on("prism")) setStep(job, "prism", {
			status: "standby",
			detail: "No schema, migrations, constraints or indexes generated",
			validation: "not_run",
		});
		if (on("nexus")) setStep(job, "nexus", {
			status: "standby",
			detail: "No adapter, credentials, connection test or webhook configured",
			validation: "not_run",
		});
		if (on("basalt")) setStep(job, "basalt", {
			status: "standby",
			detail: "No backend or server artifact generated",
			validation: "not_run",
		});
		if (on("quartz")) setStep(job, "quartz", {
			status: "skipped",
			detail: "No database artifact available for query/index/backup review",
			validation: "not_run",
		});
		if (on("apex")) setStep(job, "apex", {
			status: "skipped",
			detail: "Prototype UI only · architecture contract is not an implemented API",
			validation: "not_run",
		});
		if (on("key")) setStep(job, "key", {
			status: "standby",
			detail: "Mock preview session only · production auth not implemented",
			validation: "not_run",
		});
	}
	if (mode === "generate" && !design && on("lumen")) {
		setStep(job, "lumen", {
			status: "running",
			detail: "Experience"
		});
		think(job, "Lumen", "Scelgo umore, colori e foto. Niente viola da template, niente Inter.", "Picking mood, color and photos. No purple template, no Inter.");
		await persist(job);
		designSelection = await agentDesign(
			job.prompt,
			plan,
			architecture,
			lang,
			job,
		);
		design = designSelection.directions.find(
			(direction) => direction.id === designSelection?.selectedId,
		) ?? null;
		setStep(job, "lumen", {
			status: design ? "done" : "error",
			detail: design ? `3 directions scored · ${design.name}` : "Design failed",
			validation: design ? "validated" : "not_run",
		});
		if (design) {
			remember(job, "Lumen", `${design.mood} · ${design.palette.accent}`);
			job.designMood = design.mood;
			job.look = job.look ?? "ember";
			think(job, "Lumen", `Io faccio la grafica. Direzione: ${design.mood}. Accent ${design.palette.accent}. Atelier: Helix, Ink, Paper, Noir.`, `I own the graphics. Direction: ${design.mood}. Accent ${design.palette.accent}. Atelier: Helix, Ink, Paper, Noir.`);
			checkpoint(job, "designed", {
				plan,
				architecture,
				design,
				designSelection,
			});
			await persist(job, [{
				role: "assistant",
				content: `${design.mood}. ${design.layout}`,
				kind: "build",
				agent: "Lumen"
			}]);
		}
		if (on("glyph")) setStep(job, "glyph", {
			status: "skipped",
			detail: "No independent design-system artifact produced",
			validation: "not_run",
		});
		if (on("flint")) setStep(job, "flint", {
			status: "skipped",
			detail: "Retired role · Forge owns frontend",
			validation: "not_run",
		});
	}
	if (on("forge") && !usedAi) {
		if (!structureHtml) {
			setStep(job, "forge", {
				status: "running",
				detail: "Structure / UI",
			});
			think(job, "Forge", "Fase UI: costruisco viste, componenti e design system senza fingere backend o logica.", "UI phase: building views, components, and the design system without pretending backend or logic.");
			await persist(job);
			const stopUiPulse = pulse(job, "Forge", "Compongo struttura e UI.", "Composing structure and UI.");
			try {
				structureHtml = await agentBuild({
					prompt: job.prompt,
					locale: job.locale,
					lang,
					mode: "generate",
					currentHtml: null,
					plan,
					architecture,
					design,
					extra: [...extraNotes.filter(Boolean), job.max ? "MAX" : ""].filter(Boolean),
					job,
				}, "ui");
			} finally {
				stopUiPulse();
			}
			if (!structureHtml) {
				setStep(job, "forge", {
					status: "error",
					detail: "No validated UI artifact",
				});
				throw new AgentOutputError("FORGE_UI_HTML_INVALID");
			}
		}
		job.html = structureHtml;
		job.usedAi = false;
		checkpoint(job, "forge_ui", {
			plan,
			architecture,
			design,
			designSelection,
			structureHtml,
			usedAi: false,
		});
		setStep(job, "forge", {
			status: "running",
			detail: "Logic / interactions",
		});
		await persist(job);
		const stopPulse = pulse(job, "Forge", "Aggiungo stato, eventi e validazione.", "Adding state, events, and validation.");
		let built: string | null = null;
		try {
			built = await agentBuild({
				prompt: job.prompt,
				locale: job.locale,
				lang,
				mode: job.mode,
				currentHtml: structureHtml,
				plan,
				architecture,
				design,
				extra: [...extraNotes.filter(Boolean), job.max ? "MAX" : ""].filter(Boolean),
				job
			}, "logic");
			if (!built) {
				job.interventions = [...job.interventions ?? [], "Forge empty — Helix retries once"];
				setStep(job, "gemini", {
					status: "done",
					detail: "Intervene: retry Forge"
				});
				built = await agentBuild({
					prompt: job.prompt,
					locale: job.locale,
					lang,
					mode: "generate",
					currentHtml: structureHtml,
					plan,
					architecture,
					design,
					extra: [...extraNotes.filter(Boolean), job.max ? "MAX" : ""].filter(Boolean),
					job
				}, "logic", 1);
			}
		} finally {
			stopPulse();
		}
			if (built) {
			html = built;
			usedAi = true;
			job.html = built;
				job.score = await computeScore(built, job.prompt, null, job.locale);
					checkpoint(job, "forged", {
						plan,
						architecture,
						design,
						designSelection,
						structureHtml,
					html: built,
					usedAi: true,
				});
			setStep(job, "forge", {
				status: "done",
				detail: `UI + Logic · ${Math.round(built.length / 1024)} KB`,
				validation: "validated",
			});
				think(job, "Forge", `Consegnati UI e logica validate. ${Math.round(built.length / 1024)} KB.`, `Validated UI and logic delivered. ${Math.round(built.length / 1024)} KB.`);
				await persist(job);
			} else {
				setStep(job, "forge", {
					status: "error",
					detail: "No validated HTML artifact"
				});
				throw new AgentOutputError("FORGE_HTML_INVALID");
			}
	}
	let page: string = html ?? htmlForPrompt(job.prompt, job.locale);
	html = page;
	job.html = page;
	await persist(job);
	think(job, "Helix", job.max || job.gear === "house" ? "Le Gemme applicano solo patch controllate e verificate." : "App in anteprima. Gemme solo se accendi Max o House.", job.max || job.gear === "house" ? "Gems apply only controlled, verified patches." : "Preview is up. Gems only on Max or House.");
	job.gems ??= [];
	const completedGemCount = job.checkpoint?.gemIndex ?? 0;
	if (job.max || job.gear === "house") for (const [gemIndex, gem] of GEMS.entries()) {
		if (gemIndex < completedGemCount) continue;
		think(job, gem.name, job.locale === "it" ? gem.briefIt : gem.brief, gem.brief);
		await persist(job);
		const stopGem = pulse(job, gem.name, gem.briefIt, gem.brief);
		let change: GemPatch | null = null;
		try {
			change = usedAi ? await agentGem({
				prompt: job.prompt,
				lang,
				locale: job.locale,
				html: page,
				gem: gem.name,
				brief: gem.brief,
				job
			}) : null;
		} finally {
			stopGem();
		}
		if (change) {
			const rewritten = await applyControlledGemPatch(page, change);
			page = rewritten;
			html = rewritten;
			job.html = rewritten;
			usedAi = true;
			job.gems.push({
				id: gem.id,
				name: gem.name,
				did: `${change.operation} · ${change.target}`
			});
			think(job, gem.name, `Patch verificata su ${change.target}.`, `Verified patch on ${change.target}.`);
		} else job.gems.push({
			id: gem.id,
			name: gem.name,
			did: "held"
		});
		checkpoint(job, "gems", {
			plan,
			architecture,
			design,
			html: page,
			usedAi,
		}, gemIndex + 1);
		await persist(job);
	}
	if (!(job.max || job.gear === "house")) {
		checkpoint(job, "gems", { plan, design, html: page, usedAi }, 0);
		await persist(job);
	}
	if (on("orbit")) setStep(job, "orbit", {
		status: "standby",
		detail: "Responsive web preview only · no Expo/native project or package",
		validation: "not_run",
	});
	if (on("cedar")) setStep(job, "cedar", {
		status: "standby",
		detail: "Wide web layout only · no Tauri/Electron build",
		validation: "not_run",
	});
	let browserRun = await runBrowserQuality({
		html: page,
		jobId: job.id,
		signal: job.runtime?.abortSignal,
	});
	let twin = browserRun.twin;
	let browserQuality = { echo: browserRun.echo, swift: browserRun.swift };
	let browserScreenshot = browserRun.screenshotBase64;
	job.quality = { ...(job.quality ?? {}), twin, ...browserQuality };
	if (on("twin")) {
		setBrowserEvidenceStep(job, "twin", "Twin browser QA", twin);
	}
	if (on("echo")) setBrowserEvidenceStep(job, "echo", "Echo accessibility", browserQuality.echo);
	if (on("swift")) setBrowserEvidenceStep(job, "swift", "Swift performance", browserQuality.swift);
	if (on("storm")) setStep(job, "storm", {
		status: "skipped",
		detail: "Load test not executed · no RPS, latency or concurrency metrics",
		validation: "not_run",
	});
	let aegisReport: AegisReport = await runAegisStaticScan(page);
	job.quality = { ...(job.quality ?? {}), aegis: aegisReport };
	setStep(job, "aegis", {
		status: aegisReport.passed ? "done" : "error",
		detail: `Measured static scan · ${aegisReport.findings.length} finding(s) · ${aegisReport.blockerCount} blocker(s)`,
		validation: "validated",
	});
	const findings = localExperts(page, job.prompt);
	const markNotRun = (id: HouseId, fallback: string) => {
		if (!on(id)) return;
		const localFinding = findings.find((finding) => finding.agent === id)?.note;
		setStep(job, id, {
			status: "skipped",
			detail: localFinding
				? `${fallback} · local heuristic: ${localFinding}`
				: fallback,
			validation: "not_run",
		});
	};
	markNotRun("veil", "Privacy compliance review not executed");
	markNotRun("moth", "App was not opened · runtime bug hunt not executed");
	markNotRun("quill", "Code review not executed");
	markNotRun("augur", "Capacity forecast not run · no benchmark or infrastructure data");
	if (on("beacon")) setStep(job, "beacon", {
		status: "done",
		detail: findings.find((finding) => finding.agent === "beacon")?.note ?? "Static title validator only",
		validation: "estimated",
	});
	const reviewArtifactSha256 = await sha256Hex(page);
	const savedReview = ReviewResultSchema.safeParse(savedArtifacts?.review);
	let review: ReviewResult | null =
		savedReview.success &&
		savedReview.data.artifactSha256 === reviewArtifactSha256
			? savedReview.data
			: null;
	if (on("iris") && !review) {
		setStep(job, "iris", {
			status: "running",
			detail: "Board review"
		});
		await persist(job);
		review = await runIrisReview({
			prompt: job.prompt,
			lang,
			html: page,
			plan,
			acceptanceCriteria: plan?.acceptanceCriteria ?? [],
			artifactSha256: reviewArtifactSha256,
			twin,
			echo: browserQuality.echo,
			swift: browserQuality.swift,
			consoleErrors:
				twin.status === "completed"
					? [...twin.consoleErrors, ...twin.runtimeErrors]
					: [],
			staticFindings: [
				...findings.map((finding) => `${finding.agent}: ${finding.note}`),
				...aegisReport.findings.map(
					(finding) => `Aegis ${finding.severity}: ${finding.message} (${finding.evidence})`,
				),
			],
			shot: browserScreenshot,
			job,
		});
		setStep(job, "iris", {
			status: review ? "done" : "error",
			detail: review ? `AI evidence review · ${review.status} · ${review.evidence} · ${review.score}/10${review.mustFix?.length ? ` · ${review.mustFix.length} fixes` : ""}` : "Review failed",
			validation: review ? "estimated" : "not_run",
		});
		if (review) think(
			job,
			"Iris",
			`Review ${review.score}/10 · ${review.status}. ${review.status === "inconclusive" ? "Twin browser non eseguito." : review.mustFix.slice(0, 2).join(" ")}`,
			`Review ${review.score}/10 · ${review.status}. ${review.status === "inconclusive" ? "Twin browser was not executed." : review.mustFix.slice(0, 2).join(" ")}`,
		);
	}
	checkpoint(job, "reviewed", {
					plan,
					architecture,
					design,
		html: page,
		usedAi,
		...(review ? { review } : {}),
	});
	await persist(job);
	const localMust = [
		...findings.filter((f) => f.must).map((f) => f.note),
		...aegisReport.findings
			.filter((finding) => finding.severity === "blocker")
			.map((finding) => `Aegis: ${finding.message}`),
	];
	const mustFix = [...review?.mustFix ?? [], ...localMust];
	if (twin.status === "completed") {
		const deadClicks = twin.actions.filter(
			(action) =>
				(action.type === "click" || action.type === "submit") &&
				(action.status === "no_change" || action.status === "failed"),
		).length;
		if (deadClicks) {
			mustFix.push("Make every primary button change the UI (confirm, open, add).");
		}
		const runtimeError = [...twin.consoleErrors, ...twin.runtimeErrors][0];
		if (runtimeError) mustFix.push(`Fix browser runtime error: ${runtimeError}`);
	}
	let score = await computeScore(page, job.prompt, job.quality, job.locale);
	const needsFix = Boolean(on("patch") && (mustFix.length || score.critical.length || score.readiness < 80 || review && !review.pass || !usedAi));
	const patchAlreadyApplied =
		resumedStage === "patched" || resumedStage === "finalized";
	if (needsFix && on("patch") && !patchAlreadyApplied) {
		setStep(job, "gemini", {
			status: "done",
			detail: `Intervene: readiness ${score.readiness} — Superior`
		});
		job.interventions = [...job.interventions ?? [], `Readiness ${score.readiness} — Helix sent Superior`];
		think(job, "Helix", `Score ${score.readiness} è basso. Fermo il lancio. Entra Superior.`, `Score ${score.readiness} is low. Holding ship. Superior closes.`);
		setStep(job, "patch", {
			status: "running",
			detail: "Superior on the interior"
		});
		await persist(job);
		const fixed = usedAi ? await runSuperiorFix({
			prompt: job.prompt,
			lang,
			locale: job.locale,
			html: page,
			review: {
				artifactSha256: review?.artifactSha256 ?? reviewArtifactSha256,
				status: "failed",
				evidence: review?.evidence ?? "static_only",
				confidence: review?.confidence ?? 0.3,
				score: review?.score ?? 5,
				pass: false,
				issues: review?.issues ?? [],
				mustFix
			},
			job,
		}) : await agentBuild({
			prompt: job.prompt,
			locale: job.locale,
			lang,
			mode: "generate",
			currentHtml: page,
			plan,
			architecture,
			design,
			extra: [...extraNotes.filter(Boolean), job.max ? "MAX" : ""].filter(Boolean),
			job
		}, "logic");
		if (fixed) {
			html = fixed;
			page = fixed;
			usedAi = true;
			job.html = fixed;
			setStep(job, "patch", {
				status: "done",
				detail: `${Math.round(fixed.length / 1024)} KB`,
				validation: "validated",
			});
			score = await computeScore(page, job.prompt, null, job.locale);
		} else {
			setStep(job, "patch", {
				status: "error",
				detail: "No validated patch artifact"
			});
			throw new AgentOutputError("PATCH_HTML_INVALID");
		}
	} else if (on("patch") && !patchAlreadyApplied) setStep(job, "patch", {
		status: "skipped",
		detail: score.readiness >= 80 ? "Ready enough" : "No must-fix"
	});
	aegisReport = await runAegisStaticScan(page);
	browserRun = await runBrowserQuality({
		html: page,
		jobId: job.id,
		signal: job.runtime?.abortSignal,
	});
	twin = browserRun.twin;
	browserQuality = { echo: browserRun.echo, swift: browserRun.swift };
	browserScreenshot = browserRun.screenshotBase64;
	job.quality = {
		...(job.quality ?? {}),
		aegis: aegisReport,
		twin,
		...browserQuality,
	};
	score = await computeScore(page, job.prompt, job.quality, job.locale);
	if (on("senate")) {
		setStep(job, "senate", {
			status: "done",
			detail: `Automated Council Score · ${score.council.pick}`,
			validation: "estimated",
		});
		think(
			job,
			"Senate",
			`Punteggio Council automatizzato: ${score.council.pick}. ${score.council.why}`,
			`Automated Council Score: ${score.council.pick}. ${score.council.why}`,
		);
		await persist(job, [
			{
				role: "assistant",
				content: `Automated Council Score: ${score.council.pick}. ${score.council.why}`,
				kind: "build",
				agent: "Senate",
			},
		]);
	}
	setStep(job, "aegis", {
		status: aegisReport.passed ? "done" : "error",
		detail: `Measured final static scan · ${aegisReport.findings.length} finding(s) · ${aegisReport.blockerCount} blocker(s)`,
		validation: "validated",
	});
	const finalReviewArtifactSha256 = await sha256Hex(page);
	if (
		on("iris") &&
		(!review || review.artifactSha256 !== finalReviewArtifactSha256)
	) {
		setStep(job, "iris", {
			status: "running",
			detail: "Re-reviewing the final artifact",
			validation: "not_run",
		});
		await persist(job);
		const finalFindings = localExperts(page, job.prompt);
		review = await runIrisReview({
			prompt: job.prompt,
			lang,
			html: page,
			plan,
			acceptanceCriteria: plan?.acceptanceCriteria ?? [],
			artifactSha256: finalReviewArtifactSha256,
			twin,
			echo: browserQuality.echo,
			swift: browserQuality.swift,
			consoleErrors:
				twin.status === "completed"
					? [...twin.consoleErrors, ...twin.runtimeErrors]
					: [],
			staticFindings: [
				...finalFindings.map(
					(finding) => `${finding.agent}: ${finding.note}`,
				),
				...aegisReport.findings.map(
					(finding) =>
						`Aegis ${finding.severity}: ${finding.message} (${finding.evidence})`,
				),
			],
			shot: browserScreenshot,
			job,
		});
		setStep(job, "iris", {
			status: "done",
			detail: `AI evidence re-review · ${review.status} · ${review.evidence} · ${review.score}/10`,
			validation: "estimated",
		});
	}
	checkpoint(job, "patched", {
		plan,
		architecture,
		design,
		html: page,
		usedAi,
		...(review ? { review } : {}),
	});
	await persist(job);
	if (!aegisReport.passed) {
		setStep(job, "seal", {
			status: "error",
			detail: `Release blocked by Aegis · ${aegisReport.blockerCount} blocker(s)`,
			validation: "validated",
		});
		await persist(job);
		throw new AgentOutputError("AEGIS_RELEASE_BLOCKED", false);
	}
	if (on("kiln")) setStep(job, "kiln", {
		status: "skipped",
		detail: "No unit, API, E2E or browser tests executed",
		validation: "not_run",
	});
	if (on("sage")) setStep(job, "sage", {
		status: "skipped",
		detail: "Market and pricing validation not executed",
		validation: "not_run",
	});
	if (on("pulsar")) setStep(job, "pulsar", {
		status: "skipped",
		detail: "Growth analysis not executed",
		validation: "not_run",
	});
	if (on("folio")) setStep(job, "folio", {
		status: "done",
		detail: "PRD, architecture, decisions and score files generated",
		validation: "validated",
	});
	if (on("ledger")) setStep(job, "ledger", {
		status: "done",
		detail: "Static cost scenarios · no measured usage or provider invoice",
		validation: "estimated",
	});
	if (on("nimbus")) setStep(job, "nimbus", {
		status: "standby",
		detail: "No provider selected and no infrastructure config generated",
		validation: "not_run",
	});
	if (on("harbor")) setStep(job, "harbor", {
		status: "standby",
		detail: "Awaiting explicit server-side human approval",
		validation: "not_run",
	});
	if (on("seal")) setStep(job, "seal", {
		status: score.critical.length ? "error" : "standby",
		detail: `Release checks incomplete · heuristic blockers ${score.critical.length}`,
		validation: "not_run",
	});
	if (on("mend")) {
		const n = score.improvements.length;
		setStep(job, "mend", {
			status: "done",
			detail: n ? `${n} heuristic suggestions generated · none applied` : "No heuristic suggestions",
			validation: "estimated",
		});
	}
	if (on("warden")) setStep(job, "warden", {
		status: "standby",
		detail: job.aiUsage
			? `Runtime monitoring not configured · AI provider telemetry ${job.aiUsage.callCount} call(s)`
			: "Runtime monitoring not configured · AI provider telemetry unavailable",
		validation: "not_run",
	});
	if (on("senate")) remember(job, "Senate", `Automated Council Score: ${score.council.pick}. ${score.council.why}`);
	remember(job, "Helix", `Ready for human gate. Heuristic readiness ${score.readiness}.`);
	think(job, "Helix", `Candidato pronto. Readiness euristica ${score.readiness}/100. Harbor resta fermo fino alla tua approvazione.`, `Candidate ready. Heuristic readiness ${score.readiness}/100. Harbor is paused until your approval.`);
	const htmlOut = page;
	finalizeReleaseCandidate({ job, html: htmlOut, plan, architecture, stack, score });
	checkpoint(job, "finalized", {
		plan,
		architecture,
		design,
		html: htmlOut,
		usedAi,
		...(review ? { review } : {}),
	});
	await persist(job);
	const output = AGENT_CONTRACTS.helix.outputSchema.safeParse({
		html: htmlOut,
		usedAi,
		title: job.title
	});
	if (!output.success) throw new AgentOutputError("HELIX_OUTPUT_INVALID");
	return output.data;
}
async function agentPlan(
	prompt: string,
	lang: string,
	lock: string,
	job: BuildJob,
): Promise<ProductPlan> {
	const contract = AGENT_CONTRACTS.nova;
	const contractInput = contract.inputSchema.safeParse({
		prompt,
		language: lang,
		briefLock: lock,
	});
	if (!contractInput.success) throw new AgentOutputError("NOVA_INPUT_INVALID", false);
	const parsed = contract.outputSchema.safeParse(parseJson<unknown>(await chatGrok({
		system: novaSystemPrompt(lang, lock),
		user: prompt,
		maxTokens: contract.maxTokens,
		timeoutMs: contract.timeoutMs,
		temperature: .4,
		effort: "low",
		model: contract.model ?? undefined,
		job,
		agent: "Nova",
		contractId: "nova",
		logicalCallKey: "nova:plan",
	})));
	if (parsed.success) return parsed.data;
	throw new AgentOutputError("NOVA_PRD_INVALID");
}
async function agentArchitecture(
	prompt: string,
	plan: ProductPlan | null,
	lang: string,
	lock: string,
	job: BuildJob,
): Promise<Architecture> {
	const contract = AGENT_CONTRACTS.atlas;
	const contractInput = contract.inputSchema.safeParse({
		prompt,
		language: lang,
		briefLock: lock,
		plan,
	});
	if (!contractInput.success) throw new AgentOutputError("ATLAS_INPUT_INVALID", false);
	const parsed = contract.outputSchema.safeParse(parseJson<unknown>(await chatGrok({
		system: atlasSystemPrompt(lang, lock),
		user: `${prompt}\n\nPRD:\n${JSON.stringify(plan)}`,
		maxTokens: contract.maxTokens,
		timeoutMs: contract.timeoutMs,
		temperature: .3,
		effort: "low",
		model: contract.model ?? undefined,
		job,
		agent: "Atlas",
		contractId: "atlas",
		logicalCallKey: "atlas:architecture",
	})));
	if (parsed.success) return parsed.data;
	throw new AgentOutputError("ATLAS_ARCHITECTURE_INVALID");
}
async function agentDesign(
	prompt: string,
	plan: ProductPlan | null,
	architecture: Architecture | null,
	lang: string,
	job: BuildJob,
): Promise<DesignSelection> {
	const contract = AGENT_CONTRACTS.lumen;
	const contractInput = contract.inputSchema.safeParse({
		prompt,
		language: lang,
		plan,
		architecture,
	});
	if (!contractInput.success) throw new AgentOutputError("LUMEN_INPUT_INVALID", false);
	const parsed = contract.outputSchema.safeParse(parseJson<unknown>(await chatGrok({
			system: lumenSystemPrompt(lang),
		user: `${prompt}\n\nPLAN:\n${JSON.stringify(plan)}\n\nARCHITECTURE:\n${JSON.stringify(architecture)}`,
		maxTokens: contract.maxTokens,
		timeoutMs: contract.timeoutMs,
		temperature: .7,
		effort: "low",
		model: contract.model ?? undefined,
		job,
		agent: "Lumen",
		contractId: "lumen",
		logicalCallKey: "lumen:directions",
	})));
	if (parsed.success) return selectDesignDirection(parsed.data);
	throw new AgentOutputError("LUMEN_DESIGN_INVALID");
}
async function agentBuild(
	input: AgentBuildInput,
	phase: "ui" | "logic",
	retryIndex = 0,
	logicalCallKey = phase === "ui" ? "forge:ui" : "forge:logic",
): Promise<string | null> {
	const contract = phase === "ui"
		? AGENT_CONTRACTS.forgeUi
		: AGENT_CONTRACTS.forgeLogic;
	const contractInput = contract.inputSchema.safeParse({
		prompt: input.prompt,
		locale: input.locale,
		language: input.lang,
		mode: input.mode,
		currentHtml: input.currentHtml,
		plan: input.plan,
		architecture: input.architecture,
		design: input.design,
		notes: input.extra,
	});
	if (!contractInput.success) {
		throw new AgentOutputError(
			phase === "ui" ? "FORGE_UI_INPUT_INVALID" : "FORGE_LOGIC_INPUT_INVALID",
			false,
		);
	}
	const userParts = [input.prompt];
	if (input.plan) userParts.push("\nPLAN:\n", JSON.stringify(input.plan));
	if (input.architecture) userParts.push("\nARCHITECTURE:\n", JSON.stringify(input.architecture));
	if (input.design) userParts.push("\nDESIGN:\n", JSON.stringify(input.design));
	if (input.extra?.length) userParts.push("\nHOUSE NOTES:\n", input.extra.join("\n"));
	if (input.currentHtml && phase === "logic") {
		userParts.push("\nSTRUCTURE HTML:\n", input.currentHtml.slice(0, 7e4));
	}
	const html = extractHtml(await chatGrok({
		system: phase === "ui"
			? forgeUiSystemPrompt({ language: input.lang, locale: input.locale })
			: forgeLogicSystemPrompt({ mode: input.mode, language: input.lang, locale: input.locale }),
		user: userParts.join(""),
		maxTokens: contract.maxTokens,
		timeoutMs: contract.timeoutMs,
		temperature: .5,
		model: contract.model ?? undefined,
		effort: input.extra?.includes("MAX") ? "high" : "low",
		job: input.job,
		agent: phase === "ui" ? "Forge UI" : "Forge Logic",
		contractId: phase === "ui" ? "forgeUi" : "forgeLogic",
		logicalCallKey,
		retryIndex,
	}));
	const parsed = contract.outputSchema.safeParse(html);
	return parsed.success ? parsed.data : null;
}
async function agentGem(input: AgentGemInput): Promise<GemPatch> {
	const contract = AGENT_CONTRACTS.gemPatch;
	const contractInput = contract.inputSchema.safeParse({
		prompt: input.prompt,
		locale: input.locale,
		language: input.lang,
		html: input.html,
		gemName: input.gem,
		brief: input.brief,
	});
	if (!contractInput.success) throw new AgentOutputError("GEM_INPUT_INVALID", false);
	const beforeHash = await sha256Hex(input.html);
	const parsed = contract.outputSchema.safeParse(parseJson<unknown>(await chatGrok({
		system: gemSystemPrompt({ name: input.gem, brief: input.brief, language: input.lang }),
		user: `BRIEF:\n${input.prompt}\n\nCURRENT_HTML_SHA256:\n${beforeHash}\n\nCURRENT HTML:\n${input.html.slice(0, 65e3)}`,
		maxTokens: contract.maxTokens,
		timeoutMs: contract.timeoutMs,
		temperature: .4,
		model: contract.model ?? undefined,
		effort: "low",
		job: input.job,
		agent: input.gem,
		contractId: "gemPatch",
		logicalCallKey: `gem:${input.gem.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 80)}`,
	})));
	if (parsed.success) return parsed.data;
	throw new AgentOutputError("GEM_PATCH_INVALID");
}
type TrackedChatOptions = ChatGrokOptions & {
	job: BuildJob;
	agent: string;
	contractId: Exclude<AgentContractId, "helix">;
	logicalCallKey: string;
	retryIndex?: number;
};

async function chatGrok(opts: TrackedChatOptions): Promise<string> {
	const job = opts.job;
	const agent = opts.agent;
	const model = opts.model ?? "grok-4.5";
	const t0 = Date.now();
	let ticker: ReturnType<typeof setInterval> | undefined;
	if (job && agent) {
		const craft = craftOf(agent, job.locale);
		job.beat = t0;
		job.wire = job.locale === "it"
			? `${agent} · ${craft} · al lavoro · 0s · segnale vivo`
			: `${agent} · ${craft} · working · 0s · live signal`;
		await persist(job);
		ticker = setInterval(() => {
			const s = Math.round((Date.now() - t0) / 1e3);
			job.beat = Date.now();
			job.wire = job.locale === "it"
				? `${agent} · ${craft} · al lavoro · ${s}s · segnale vivo`
				: `${agent} · ${craft} · working · ${s}s · live signal`;
		}, 2500);
	}
	try {
			const response = await requestAgentCompletion({
				job,
				contractId: opts.contractId,
				agentId: agent,
				logicalCallKey: opts.logicalCallKey,
				retryIndex: opts.retryIndex,
				system: opts.system,
				user: opts.user,
				temperature: opts.temperature,
				effort: opts.effort,
			});
			if (job && agent) {
				job.beat = Date.now();
				const craft = craftOf(agent, job.locale);
				job.wire = job.locale === "it"
					? `${agent} · ${craft} · ha consegnato · ${response.latencyMs}ms`
					: `${agent} · ${craft} · delivered · ${response.latencyMs}ms`;
				await persist(job);
			}
			return response.content;
		} catch (error) {
			if (error instanceof BuildJobLeaseLostError) throw error;
			const normalized = error instanceof AiProviderError
				? error
				: typeof error === "object" && error !== null && "code" in error
					? error as { code: string; retryable: boolean }
				: new AiProviderError(
					job?.runtime?.abortSignal.aborted
						? "BUILD_JOB_ABORTED"
						: error instanceof DOMException && error.name === "TimeoutError"
							? "XAI_TIMEOUT"
							: "XAI_NETWORK_ERROR",
					{ retryable: true, cause: error },
				);
			if (job && agent) {
			job.beat = Date.now();
			const craft = craftOf(agent, job.locale);
				job.wire = `${agent} · ${craft} · ${normalized.code}`;
				think(
					job,
					agent,
					`Errore modello: ${normalized.code}. Il job non viene dichiarato completato.`,
					`Model error: ${normalized.code}. The job will not be marked complete.`,
				);
					if (!job.runtime?.abortSignal.aborted) await persist(job);
			}
			console.error(JSON.stringify({
				level: "error",
				event: "xai_request_failed",
				jobId: job?.id,
				agent,
				model,
				code: normalized.code,
				retryable: normalized.retryable,
			}));
			throw normalized;
	} finally {
		if (ticker) clearInterval(ticker);
	}
}
function parseJson<T>(text: string): T | null {
	if (!text) return null;
	const raw = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? text;
	const start = raw.indexOf("{");
	const end = raw.lastIndexOf("}");
	if (start < 0 || end <= start) return null;
	try {
		return JSON.parse(raw.slice(start, end + 1)) as T;
	} catch {
		return null;
	}
}

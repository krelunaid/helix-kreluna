// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { htmlForPrompt } from "@/lib/templates";
import { titleFromPrompt } from "@/lib/utils";
import { LOCALE_NAME, normalizeLocale, t, type Locale } from "@/lib/i18n-core";
import type { ActionId } from "@/lib/plans";
import type { AgentId, AgentStep, BuildJob } from "@/lib/agent-types";
import { HOUSE_BY_ID, aftercare, agentByName, craftOf, knowledgeHints, localExperts, orchestrate, stackFor, type HouseId, type Gear } from "@/lib/house";
import { GEMS } from "@/lib/gems";
import { computeScore, type TwinReport } from "@/lib/score";
import { runTwin } from "@/lib/server/twin";
import { shipLive, queueStores } from "@/lib/server/deploy";
import { classifyBrief, briefLine } from "@/lib/brief";

export type { AgentId, AgentStep, BuildJob };

type CrewMsg = {
  role: "user" | "assistant";
  content: string;
  kind?: "build" | "iterate" | "debug" | "host";
  agent?: string;
};

function stepFor(id, status = "queued", detail = "") {
	const a = HOUSE_BY_ID[id];
	return {
		id,
		agent: a.name,
		role: a.role,
		desk: a.desk,
		status,
		detail
	};
}
function seedSteps() {
	return [stepFor("gemini")];
}
const jobs = new Map();
export function getJob(id) {
	return jobs.get(id) ?? null;
}
export function findJobByProject(projectId) {
	let latest = null;
	for (const job of jobs.values()) if (job.projectId === projectId && (!latest || job.createdAt > latest.createdAt)) latest = job;
	return latest;
}
async function loadJobFromDb({ jobId, projectId }) {
	try {
		const sql = await getSql();
		const rows = jobId
			? await sql`select payload from build_jobs where id = ${jobId}`
			: await sql`select payload from build_jobs where project_id = ${projectId} order by updated_at desc limit 1`;
		if (!rows[0]?.payload) return null;
		return JSON.parse(rows[0].payload);
	} catch {
		return null;
	}
}
export function enqueueBuild(input) {
	const seed = input.currentHtml && input.currentHtml.length > 40 ? input.currentHtml : htmlForPrompt(input.prompt, input.locale);
	const id = crypto.randomUUID();
	const job = {
		id,
		prompt: input.prompt,
		locale: input.locale,
		mode: input.mode,
		gear: input.gear ?? "auto",
		max: Boolean(input.max),
		currentHtml: input.currentHtml ?? seed,
		status: "running",
		steps: seedSteps(),
		html: seed,
		usedAi: false,
		title: titleFromPrompt(input.prompt, input.locale),
		projectId: input.projectId,
		userId: input.userId,
		createdAt: Date.now()
	};
	think(job, "Helix", `Preso. «${input.prompt.slice(0, 90)}». ${input.gear === "fast" ? "Veloce: pochi desk." : input.gear === "house" ? "House intera." : "Auto: scelgo io chi entra."}${input.max ? " Max acceso." : ""}`, `Taken. “${input.prompt.slice(0, 90)}”. ${input.gear === "fast" ? "Fast: few desks." : input.gear === "house" ? "Full house." : "Auto: I pick who works."}${input.max ? " Max on." : ""}`);
	jobs.set(id, job);
	if (jobs.size > 80) {
		const oldest = [...jobs.values()].sort((a, b) => a.createdAt - b.createdAt)[0];
		if (oldest && oldest.status !== "running") jobs.delete(oldest.id);
	}
	executeJob(id);
	return id;
}
function setStep(job, id, patch) {
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
function think(job, agent, it, en) {
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
	void persist(job);
}
function pulse(job, agent, doingIt, doingEn) {
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
		persist(job);
	}, 4e3);
	return () => clearInterval(id);
}
function remember(job, agent, decision) {
	job.memory = [...job.memory ?? [], {
		at: Date.now(),
		agent,
		decision
	}];
}
function loadPipeline(job, active, standby, why) {
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
async function persist(job, extra = []) {
	try {
		const sql = await getSql();
		await sql.query(`
      create table if not exists build_jobs (
        id text primary key,
        project_id text,
        payload text not null,
        updated_at timestamptz not null default now()
      )
    `);
		const payload = JSON.stringify({
			id: job.id,
			prompt: job.prompt,
			locale: job.locale,
			mode: job.mode,
			gear: job.gear,
			max: job.max,
			status: job.status,
			steps: job.steps,
			thoughts: job.thoughts ?? [],
			wire: job.wire ?? null,
			beat: job.beat ?? null,
			gems: job.gems ?? [],
			score: job.score ?? null,
			look: job.look ?? null,
			designMood: job.designMood ?? null,
			usedAi: job.usedAi,
			title: job.title,
			projectId: job.projectId ?? null,
			createdAt: job.createdAt,
			html: job.html,
			interventions: job.interventions ?? [],
		});
		await sql`
      insert into build_jobs (id, project_id, payload)
      values (${job.id}, ${job.projectId ?? null}, ${payload})
      on conflict (id) do update set payload = excluded.payload, project_id = excluded.project_id, updated_at = now()
    `;
	} catch {}
	if (!job.projectId || !job.userId) return;
	try {
		const sql = await getSql();
		const prev = parseMsgs((await sql`
      select messages from projects where id = ${job.projectId} and user_id = ${job.userId}
    `)[0]?.messages);
		const next = extra.length ? [...prev, ...extra] : prev;
		const status = job.status === "running" ? "building" : job.status === "ready" ? "ready" : "error";
		if (job.html && job.html.length > 40) await sql`
        update projects
        set html = ${job.html},
            status = ${status},
            title = ${job.title},
            messages = ${JSON.stringify(next)},
            updated_at = now()
        where id = ${job.projectId} and user_id = ${job.userId}
      `;
		else await sql`
        update projects
        set status = ${status},
            title = ${job.title},
            messages = ${JSON.stringify(next)},
            updated_at = now()
        where id = ${job.projectId} and user_id = ${job.userId}
      `;
	} catch {}
}
function parseMsgs(raw) {
	if (!raw) return [];
	try {
		const v = JSON.parse(raw);
		return Array.isArray(v) ? v : [];
	} catch {
		return [];
	}
}
async function executeJob(id) {
	const job = jobs.get(id);
	if (!job) return;
	try {
		const result = await runCrew(job);
		job.html = result.html;
		job.usedAi = result.usedAi;
		job.title = result.title || job.title;
		job.status = "ready";
		job.wire = result.usedAi ? `Modello ha scritto. ${Math.round((result.html?.length ?? 0) / 1024)} KB.` : "Modello muto. Telaio, non una generazione vera.";
		if (!result.usedAi) think(job, "Helix", "Il modello non ha consegnato HTML. Quello che vedi è un telaio. Non è una generazione vera.", "The model did not return HTML. What you see is a shell. Not a real generation.");
		await persist(job, [{
			role: "assistant",
			content: result.usedAi ? t(job.locale, "agent.ready") : t(job.locale, "msg.fallback"),
			kind: job.mode === "debug" ? "debug" : job.mode === "iterate" ? "iterate" : "build",
			agent: "Helix"
		}]);
	} catch (err) {
		job.status = "error";
		job.error = err instanceof Error ? err.message : "Crew failed";
		job.html = job.html ?? htmlForPrompt(job.prompt, job.locale);
		await persist(job, [{
			role: "assistant",
			content: t(job.locale, "msg.fallback"),
			kind: "build",
			agent: "Helix"
		}]);
	}
}
async function runCrew(job) {
	const lang = LOCALE_NAME[job.locale];
	const mode = job.mode === "host" ? "generate" : job.mode;
	const flow = orchestrate(job.prompt, mode, job.gear ?? "auto", job.max ?? false);
	loadPipeline(job, flow.active, flow.standby, flow.why);
	const brief = classifyBrief(job.prompt);
	think(job, "Helix", briefLine(brief, "it"), briefLine(brief, "en"));
	await persist(job, [{
		role: "assistant",
		content: flow.why,
		kind: "build",
		agent: "Helix"
	}]);
	const on = (id) => flow.active.includes(id);
	let plan = null;
	let design = null;
	let html = mode === "generate" ? null : job.currentHtml;
	let usedAi = false;
	const extraNotes = [brief.lock];
	if (on("archive")) {
		const hints = knowledgeHints(job.prompt);
		setStep(job, "archive", {
			status: "done",
			detail: `${hints.length} patterns`
		});
		extraNotes.push(...hints);
		think(job, "Archive", `Ripesco ${hints.length} pattern per QUESTO brief. Non copio un altro prodotto.`, `Reusing ${hints.length} patterns for THIS brief. Not another product.`);
	}
	if (mode === "generate" && (on("nova") || on("atlas"))) {
		if (on("nova")) setStep(job, "nova", {
			status: "running",
			detail: "Priorities"
		});
		if (on("atlas")) setStep(job, "atlas", {
			status: "running",
			detail: "Architecture"
		});
		think(job, "Nova", "Trasformo la frase in un PRD: chi è l'utente, qual è l'azione principale, cosa è MVP.", "Turning the sentence into a PRD: who it's for, the main action, what ships first.");
		think(job, "Atlas", "Prima del codice disegno schermate e dati. Meno errori strutturali dopo.", "Screens and data first. Code comes after the map.");
		await persist(job);
		plan = await agentPlan(job.prompt, job.locale, lang, brief.lock);
		if (plan?.title) job.title = plan.title;
		if (on("nova")) setStep(job, "nova", {
			status: "done",
			detail: plan?.priorities?.slice(0, 2).join(" · ") || plan?.pitch || "PRD"
		});
		if (on("atlas")) setStep(job, "atlas", {
			status: plan ? "done" : "error",
			detail: plan ? `${plan.title} · ${plan.screens.length} screens` : "Plan failed"
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
			remember(job, "Atlas", `Screens: ${plan.screens.map((s) => s.name).join(", ")}`);
			think(job, "Nova", `Prodotto: ${plan.title}. ${plan.pitch} Schermate: ${plan.screens.map((s) => s.name).join(", ")}.`, `Product: ${plan.title}. ${plan.pitch} Screens: ${plan.screens.map((s) => s.name).join(", ")}.`);
			await persist(job, [{
				role: "assistant",
				content: `${plan.title}. ${plan.pitch}`,
				kind: "build",
				agent: "Nova"
			}]);
		}
	}
	const stack = stackFor(flow.needs);
	if (on("sol")) {
		setStep(job, "sol", {
			status: "done",
			detail: stack.back
		});
		think(job, "Sol", `Stack: ${stack.front} ${stack.back}`, `Stack: ${stack.front} ${stack.back}`);
	}
	if (on("reed")) {
		setStep(job, "reed", {
			status: "done",
			detail: "Journey: land → primary action → confirm"
		});
		remember(job, "Reed", "Primary journey must complete in 10 seconds.");
		think(job, "Reed", "Il viaggio è: arrivo → azione principale → conferma. Deve chiudersi in 10 secondi.", "Journey: land → main action → confirm. Done in 10 seconds.");
	}
	if (on("vault") || on("prism") || on("nexus") || on("basalt") || on("quartz") || on("apex") || on("key")) {
		extraNotes.push(flow.needs.includes("payments") ? "Checkout UI (no live keys). Confirm + receipt." : "", flow.needs.includes("auth") ? "Session in memory. Sign-in screen, signed-in home." : "", flow.needs.includes("data") ? "In-memory collections. Add/edit/delete." : "");
		if (on("vault")) setStep(job, "vault", {
			status: "done",
			detail: stack.back
		});
		if (on("prism")) setStep(job, "prism", {
			status: "done",
			detail: stack.db
		});
		if (on("nexus")) setStep(job, "nexus", {
			status: "done",
			detail: "Integration stubs"
		});
		if (on("basalt")) setStep(job, "basalt", {
			status: "done",
			detail: "Backend contract owned"
		});
		if (on("quartz")) setStep(job, "quartz", {
			status: "done",
			detail: "In-memory now, indexes later"
		});
		if (on("apex")) setStep(job, "apex", {
			status: "done",
			detail: "Frontend talks to memory API"
		});
		if (on("key")) setStep(job, "key", {
			status: "done",
			detail: stack.auth
		});
	}
	if (mode === "generate" && on("lumen")) {
		setStep(job, "lumen", {
			status: "running",
			detail: "Experience"
		});
		think(job, "Lumen", "Scelgo umore, colori e foto. Niente viola da template, niente Inter.", "Picking mood, color and photos. No purple template, no Inter.");
		await persist(job);
		design = await agentDesign(job.prompt, plan, lang);
		setStep(job, "lumen", {
			status: design ? "done" : "error",
			detail: design ? `${design.mood} · ${design.palette.accent}` : "Design failed"
		});
		if (design) {
			remember(job, "Lumen", `${design.mood} · ${design.palette.accent}`);
			job.designMood = design.mood;
			job.look = job.look ?? "ember";
			think(job, "Lumen", `Io faccio la grafica. Direzione: ${design.mood}. Accent ${design.palette.accent}. Atelier: Helix, Ink, Paper, Noir.`, `I own the graphics. Direction: ${design.mood}. Accent ${design.palette.accent}. Atelier: Helix, Ink, Paper, Noir.`);
			await persist(job, [{
				role: "assistant",
				content: `${design.mood}. ${design.layout}`,
				kind: "build",
				agent: "Lumen"
			}]);
		}
		if (on("glyph")) setStep(job, "glyph", {
			status: "done",
			detail: "Buttons, type, space — one system"
		});
		if (on("flint")) setStep(job, "flint", {
			status: "done",
			detail: "Frontend assigned to Forge"
		});
	}
	if (on("forge")) {
		setStep(job, "forge", {
			status: "running",
			detail: "Frontend"
		});
		think(job, "Forge", "Scrivo l'app. HTML unico, azioni vere, foto vere. L'anteprima si aggiorna appena ho finito.", "Writing the app. One HTML file, real actions, real photos. Preview updates when I'm done.");
		await persist(job);
		const stopPulse = pulse(job, "Forge", "Sto scrivendo HTML, tap e foto. Chiamata al modello in corso.", "Writing HTML, taps and photos. Model call still open.");
		let built = await agentBuild({
			prompt: job.prompt,
			locale: job.locale,
			lang,
			mode: job.mode,
			currentHtml: job.currentHtml,
			plan,
			design,
			extra: [...extraNotes.filter(Boolean), job.max ? "MAX" : ""].filter(Boolean),
			job
		});
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
				currentHtml: job.currentHtml,
				plan,
				design,
				extra: [...extraNotes.filter(Boolean), job.max ? "MAX" : ""].filter(Boolean),
				job
			});
		}
		stopPulse();
		if (built) {
			html = built;
			usedAi = true;
			job.html = built;
			job.score = computeScore(html, job.prompt, null, job.locale);
			setStep(job, "forge", {
				status: "done",
				detail: `${Math.round(html.length / 1024)} KB`
			});
			think(job, "Forge", `Consegnato. ${Math.round(html.length / 1024)} KB. Guarda a sinistra: l'app c'è già. Score ${job.score.readiness}/100. Augur: ${job.score.horizon.verdict}`, `Delivered. ${Math.round(html.length / 1024)} KB. Look left. Score ${job.score.readiness}/100. Augur: ${job.score.horizon.verdict}`);
			await persist(job);
		} else {
			html = job.currentHtml ?? htmlForPrompt(job.prompt, job.locale);
			job.html = html;
			setStep(job, "forge", {
				status: "error",
				detail: "Fallback template"
			});
		}
	}
	html = html ?? htmlForPrompt(job.prompt, job.locale);
	let page = html;
	job.html = page;
	await persist(job);
	think(job, "Helix", job.max || job.gear === "house" ? "Lascio entrare le Gemme. Restano sull'app e la ritoccano da sole, strada facendo. L'anteprima si muove." : "App in anteprima. Gemme solo se accendi Max o House.", job.max || job.gear === "house" ? "Gems come in. They live on the app and keep rewriting it. Watch the preview move." : "Preview is up. Gems only on Max or House.");
	job.gems = [];
	if (job.max || job.gear === "house") for (const gem of GEMS) {
		think(job, gem.name, job.locale === "it" ? gem.briefIt : gem.brief, gem.brief);
		await persist(job);
		const stopGem = pulse(job, gem.name, gem.briefIt, gem.brief);
		const rewritten = usedAi ? await agentGem({
			prompt: job.prompt,
			lang,
			locale: job.locale,
			html: page,
			gem: gem.name,
			brief: gem.brief,
			job
		}) : null;
		stopGem();
		if (rewritten && rewritten.length > 400) {
			page = rewritten;
			html = rewritten;
			job.html = rewritten;
			usedAi = true;
			job.gems.push({
				id: gem.id,
				name: gem.name,
				did: `${Math.round(rewritten.length / 1024)} KB`
			});
			think(job, gem.name, `Fatto. L'app è cambiata. ${Math.round(rewritten.length / 1024)} KB.`, `Done. The app moved. ${Math.round(rewritten.length / 1024)} KB.`);
		} else job.gems.push({
			id: gem.id,
			name: gem.name,
			did: "held"
		});
		await persist(job);
	}
	if (on("orbit")) setStep(job, "orbit", {
		status: "done",
		detail: "390px first · tap 44px"
	});
	if (on("cedar")) setStep(job, "cedar", {
		status: "done",
		detail: "Wide layout + keyboard"
	});
	let twin = {
		errors: [],
		clicks: [],
		forms: 0,
		deadClicks: 0
	};
	if (on("twin")) {
		setStep(job, "twin", {
			status: "running",
			detail: "Playing + stress"
		});
		think(job, "Twin", "Apro l'app, riempio i form, clicco i pulsanti. Segnalo cosa non si muove.", "Opening the app, filling forms, clicking. I'll report what doesn't move.");
		await persist(job);
		twin = await runTwin(html);
		setStep(job, "twin", {
			status: "done",
			detail: twin.deadClicks ? `${twin.deadClicks} dead clicks · ${twin.clicks.length} tried` : `${twin.clicks.length} actions · ${twin.errors.length} errors`
		});
		if (on("storm")) setStep(job, "storm", {
			status: "done",
			detail: twin.deadClicks ? `${twin.deadClicks} inert controls` : "Clicks landed"
		});
		if (twin.errors.length || twin.deadClicks) {
			job.interventions = [...job.interventions ?? [], `Twin: ${twin.errors.length} errors, ${twin.deadClicks} dead clicks — sent to Superior`];
			think(job, "Twin", `Trovato: ${twin.errors.length} errori console, ${twin.deadClicks} click morti. Helix manda Superior.`, `Found: ${twin.errors.length} console errors, ${twin.deadClicks} dead clicks. Helix sends Superior.`);
		} else think(job, "Twin", `Pulita. ${twin.clicks.length} azioni hanno mosso l'interfaccia.`, `Clean. ${twin.clicks.length} actions moved the UI.`);
	}
	const findings = localExperts(html, job.prompt);
	const mark = (id, fallback) => {
		if (!on(id)) return;
		setStep(job, id, {
			status: "done",
			detail: findings.filter((f) => f.agent === id)[0]?.note ?? fallback
		});
	};
	mark("aegis", "No critical sinks");
	mark("veil", "No sensitive store");
	mark("echo", "Labels and lang");
	mark("swift", `${Math.round(html.length / 1024)} KB`);
	mark("moth", twin.errors[0] || "No crash on open");
	mark("quill", "No placeholder copy");
	if (!on("storm")) mark("storm", "Primary actions present");
	mark("augur", "Watch persistence after launch");
	mark("beacon", "Title set");
	let review = null;
	if (on("iris")) {
		setStep(job, "iris", {
			status: "running",
			detail: "Board review"
		});
		await persist(job);
		review = await agentReview({
			prompt: job.prompt,
			lang,
			html,
			plan,
			consoleErrors: [...twin.errors, ...findings.map((f) => `${f.agent}: ${f.note}`)],
			shot: twin.shot
		});
		setStep(job, "iris", {
			status: review ? "done" : "error",
			detail: review ? `Score ${review.score}/10${review.mustFix?.length ? ` · ${review.mustFix.length} fixes` : ""}` : "Review skipped"
		});
		if (review) think(job, "Iris", `Voto QA ${review.score}/10. ${review.pass ? "Può andare avanti." : review.mustFix.slice(0, 2).join(" ")}`, `QA ${review.score}/10. ${review.pass ? "Can move on." : review.mustFix.slice(0, 2).join(" ")}`);
	}
	const localMust = findings.filter((f) => f.must).map((f) => f.note);
	const mustFix = [...review?.mustFix ?? [], ...localMust];
	if (twin.deadClicks) mustFix.push("Make every primary button change the UI (confirm, open, add).");
	if (twin.errors.length) mustFix.push(`Fix console: ${twin.errors[0]}`);
	let score = computeScore(html, job.prompt, twin, job.locale);
	const needsFix = Boolean(on("patch") && (mustFix.length || score.critical.length || score.readiness < 80 || review && !review.pass || !usedAi));
	if (on("senate")) {
		setStep(job, "senate", {
			status: "done",
			detail: `${score.council.pick} · not ${score.council.rejected}`
		});
		think(job, "Senate", `Council: ${score.council.pick}. Non ${score.council.rejected}. ${score.council.why}`, `Council: ${score.council.pick}. Not ${score.council.rejected}. ${score.council.why}`);
		await persist(job, [{
			role: "assistant",
			content: `Council: ${score.council.pick}. ${score.council.why}`,
			kind: "build",
			agent: "Senate"
		}]);
	}
	if (needsFix && on("patch")) {
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
		const fixed = usedAi ? await agentFix({
			prompt: job.prompt,
			lang,
			locale: job.locale,
			html,
			review: {
				score: review?.score ?? 5,
				pass: false,
				issues: review?.issues ?? [],
				mustFix
			}
		}) : await agentBuild({
			prompt: job.prompt,
			locale: job.locale,
			lang,
			mode: "generate",
			currentHtml: null,
			plan,
			design,
			extra: [...extraNotes.filter(Boolean), job.max ? "MAX" : ""].filter(Boolean),
			job
		});
		if (fixed) {
			html = fixed;
			usedAi = true;
			job.html = fixed;
			setStep(job, "patch", {
				status: "done",
				detail: `${Math.round(fixed.length / 1024)} KB`
			});
			if (on("twin")) twin = await runTwin(html);
			score = computeScore(html, job.prompt, twin, job.locale);
		} else setStep(job, "patch", {
			status: "error",
			detail: "Kept previous build"
		});
	} else if (on("patch")) setStep(job, "patch", {
		status: "skipped",
		detail: score.readiness >= 80 ? "Ready enough" : "No must-fix"
	});
	const care = aftercare(job.title, job.prompt, flow.needs);
	if (on("kiln")) setStep(job, "kiln", {
		status: "done",
		detail: `Twin ${twin.clicks.length} actions · coverage ${score.coverage}`
	});
	if (on("sage")) setStep(job, "sage", {
		status: "done",
		detail: care.sage
	});
	if (on("pulsar")) setStep(job, "pulsar", {
		status: "done",
		detail: care.pulsar
	});
	if (on("folio")) setStep(job, "folio", {
		status: "done",
		detail: care.folio
	});
	if (on("ledger")) setStep(job, "ledger", {
		status: "done",
		detail: care.ledger
	});
	if (on("nimbus")) setStep(job, "nimbus", {
		status: "done",
		detail: care.nimbus
	});
	if (on("harbor")) setStep(job, "harbor", {
		status: "done",
		detail: care.harbor
	});
	if (on("seal")) setStep(job, "seal", {
		status: score.critical.length && score.security < 70 ? "error" : "done",
		detail: `Score ${score.readiness} · ${score.critical.length} blockers`
	});
	if (on("mend")) {
		const n = score.improvements.length;
		setStep(job, "mend", {
			status: "done",
			detail: n ? `${n} lifts ready for your approve` : "Nothing cheap to lift"
		});
	}
	if (on("warden")) setStep(job, "warden", {
		status: "done",
		detail: score.watch[0] ?? "Watch testers after launch"
	});
	job.score = score;
	job.gate = "approve";
	job.briefing = `Kreluna Score ${score.readiness}/100 · €${score.costEur}/mo · ${score.council.pick}`;
	remember(job, "Senate", `${score.council.pick}. ${score.council.why}`);
	remember(job, "Helix", `Ready for human gate. Score ${score.readiness}.`);
	think(job, "Helix", `Fatto. Score ${score.readiness}/100. Harbor pubblica da solo sul web.`, `Done. Score ${score.readiness}/100. Harbor ships the web by itself.`);
	const htmlOut = html ?? htmlForPrompt(job.prompt, job.locale);
	try {
		const live = await shipLive(job.title, htmlOut, job.projectId);
		job.liveUrl = live.url;
		const stores = await queueStores({
			title: job.title,
			html: htmlOut,
			projectId: job.projectId,
			userId: job.userId,
			slug: live.slug,
			testersCode: live.testersCode
		});
		job.stores = stores;
		think(job, "Harbor", `Online sul web. Pratica aperta su App Store e Google Play. Tester: ${stores.testersUrl}`, `Live on the web. App Store and Google Play queued. Testers: ${stores.testersUrl}`);
	} catch {
		think(job, "Harbor", "Web non partito. Riprovo dal tasto store.", "Web didn't ship. Use the store button.");
	}
	job.files = {
		"README.md": `# ${job.title}\n\n${plan?.pitch ?? job.prompt}\n\nScore ${score.readiness}/100.\n`,
		"docs/prd.md": plan ? `# PRD — ${plan.title}\n\n${plan.pitch}\n\n## Priorities\n${(plan.priorities ?? []).map((x) => `- ${x}`).join("\n")}\n\n## Screens\n${plan.screens.map((s) => `- ${s.name}: ${s.purpose}`).join("\n")}\n` : `# PRD\n\n${job.prompt}\n`,
		"docs/architecture.md": `# Architecture\n\n${stack.front}\n\n${stack.back}\n\n${stack.db}\n\n${stack.auth}\n`,
		"docs/decisions.md": (job.memory ?? []).map((m) => `- ${m.agent}: ${m.decision}`).join("\n"),
		"docs/score.md": `# Kreluna Score ${score.readiness}\n\nSecurity ${score.security}\nPerformance ${score.performance}\nScalability ${score.scalability}\nReliability ${score.reliability}\n`,
		"index.html": htmlOut
	};
	return {
		html: htmlOut,
		usedAi,
		title: job.title
	};
}
async function agentPlan(prompt, locale, lang, lock) {
	const parsed = parseJson(await chatGrok({
		system: `You are Atlas, product architect at Kreluna. Return ONLY JSON. Language of user-facing strings: ${lang}.
Schema: {"title":"short product name from the USER brief","type":"site|app|game|dashboard","pitch":"one sentence of what THEY asked","priorities":["p0","p1","p2"],"screens":[{"name":"","purpose":""}],"features":["3-6 concrete features that WORK"],"data":["what is stored in memory"],"success":"what must work in the first 10 seconds","backend":"in-memory API shape","integrations":["only if needed"]}
No markdown.
${lock}
Do NOT invent a different product. If they asked an app, type=app. If they asked sales/marketplace, screens are listings not appointments. If they said not e-commerce, no cart. Title describes THEIR product.`,
		user: prompt,
		maxTokens: 1200,
		timeoutMs: 4e4,
		temperature: .4,
		effort: "low"
	}));
	if (parsed?.title && parsed.screens?.length) return parsed;
	return {
		title: titleFromPrompt(prompt, locale),
		type: "app",
		pitch: prompt,
		screens: [{
			name: "Home",
			purpose: "Primary use"
		}],
		features: [prompt],
		data: ["user input"],
		success: "The main action works"
	};
}
async function agentDesign(prompt, plan, lang) {
	return parseJson(await chatGrok({
		system: `You are Lumen, art director at Kreluna. Return ONLY JSON. Notes in ${lang}.
Schema: {"mood":"3 words","palette":{"bg":"#","fg":"#","accent":"#","muted":"#","elevated":"#"},"fonts":{"display":"Google font","body":"Google font"},"layout":"how the page is structured","imagery":"unsplash subjects, 3 concrete photo ideas","avoid":["generic AI tells to avoid"]}
Rules: 4-5 colors max. Default Helix palette if unsure: bg #070914, accent #7C3AED, fg #F8FAFC. Never copper, orange, terracotta, #e4572e, #ff5a2e. No Inter/Roboto, no rainbow gradients. High contrast.`,
		user: `${prompt}\n\nPLAN:\n${JSON.stringify(plan)}`,
		maxTokens: 900,
		timeoutMs: 4e4,
		temperature: .7,
		effort: "low"
	}));
}
async function agentBuild(input) {
	const spec = [
		input.mode === "debug" ? "Fix bugs so every interaction works. Keep the look." : input.mode === "iterate" ? "Apply the requested change. Keep everything else. Return the FULL document." : "Build the complete product from the USER prompt and the plan. Not a wireframe. Obey HOUSE NOTES: do not switch product type.",
		`ALL visible UI text in ${input.lang}. <html lang="${input.locale}">`,
		"ONE complete HTML document. CSS in <style>, JS in <script>. No markdown.",
		"Allowed network: fonts.googleapis.com, fonts.gstatic.com, images.unsplash.com.",
		"Use real Unsplash photos via https://images.unsplash.com/photo-... ?auto=format&fit=crop&w=1600&q=80 — at least 3 large photos if it is a site/brand.",
		"No localStorage, no sessionStorage, no cookies (iframe sandbox). Keep state in JS memory.",
		"Fully usable at 390px and desktop. Tap targets 44px. No horizontal scroll.",
		"FIRST SCREEN LAW (every product): the first viewport is the thing they asked for — filled. Never header + empty field + tab bar. Seed real items (cards, rows, posts, slots, KPIs, levels). Tabs/nav swap interiors. Primary tap must change the UI. Empty body = fail, whatever the brief.",
		"Forms: validate, confirm, success. Lists: add/remove. Booking: pick, confirm. Shops: bag. Games: playable.",
		"Anti-slop: no emoji icons, no lorem, no gray placeholder boxes, no Inter, no purple blobs, no 'Welcome to our app'.",
		"Distinctive type pairing from Google Fonts. CSS variables for the palette.",
		"Keep under 90KB of source. No comments."
	].join("\n");
	const userParts = [input.prompt];
	if (input.plan) userParts.push("\nPLAN:\n", JSON.stringify(input.plan));
	if (input.design) userParts.push("\nDESIGN:\n", JSON.stringify(input.design));
	if (input.extra?.length) userParts.push("\nHOUSE NOTES:\n", input.extra.join("\n"));
	if (input.currentHtml && input.mode !== "generate") userParts.push("\nCURRENT HTML:\n", input.currentHtml.slice(0, 7e4));
	return extractHtml(await chatGrok({
		system: `You are Forge, principal engineer at Kreluna. ${spec}`,
		user: userParts.join(""),
		maxTokens: 8192,
		timeoutMs: 12e4,
		temperature: .5,
		model: "grok-4.6",
		effort: input.extra?.includes("MAX") ? "high" : "low",
		job: input.job,
		agent: "Forge"
	}));
}
async function agentReview(input) {
	const content = [{
		type: "text",
		text: [
			`User asked: ${input.prompt}`,
			input.plan ? `Plan: ${JSON.stringify(input.plan)}` : "",
			input.consoleErrors.length ? `CONSOLE ERRORS:\n${input.consoleErrors.join("\n")}` : "No console errors captured.",
			"HTML (truncated):\n",
			input.html.slice(0, 18e3),
			`\nReturn ONLY JSON: {"score":1-10,"pass":true/false,"issues":[],"mustFix":[]} in ${input.lang} for the issue strings.`,
			"pass=true only if the main action works and it does not look like a generic template. Score 8+ to pass."
		].filter(Boolean).join("\n")
	}];
	if (input.shot) content.push({
		type: "image_url",
		image_url: { url: `data:image/jpeg;base64,${input.shot}` }
	});
	return parseJson(await chatGrok({
		system: "You are Iris, QA at Helix. Play the app as a stranger. Fail empty first screens on every kind of product, not only shops. Harsh on chrome-without-content, dead taps, generic look, missing photos when visual. Return ONLY JSON.",
		user: content,
		maxTokens: 800,
		timeoutMs: 45e3,
		temperature: .2,
		effort: "low"
	}));
}
async function agentGem(input) {
	return extractHtml(await chatGrok({
		system: `You are ${input.gem}, a living gem inside a Helix product. You rewrite the app IN PLACE as it runs. ${input.brief} Keep the look. Keep language ${input.lang}. Return ONLY a complete HTML document. No localStorage. Unsplash ok. No markdown. Never strip working UI.`,
		user: `BRIEF:\n${input.prompt}\n\nCURRENT HTML:\n${input.html.slice(0, 65e3)}`,
		maxTokens: 8192,
		timeoutMs: 25e3,
		temperature: .4,
		model: "grok-4.6",
		effort: "low",
		job: input.job,
		agent: input.gem
	}));
}
async function agentFix(input) {
	return extractHtml(await chatGrok({
		system: `You are Superior, principal closer at Helix. You close ANY brief — shop, game, dashboard, estate, café, CRM, chat. Empty first screens are not shipped. Apply MUST-FIX. Fill the primary view for THIS prompt with real items and working taps. Return ONLY a complete HTML document. Keep language ${input.lang}. No localStorage. Unsplash when visual. No markdown.`,
		user: `PROMPT:\n${input.prompt}\n\nMUST FIX:\n${input.review.mustFix.join("\n")}\n\nISSUES:\n${input.review.issues.join("\n")}\n\nHTML:\n${input.html.slice(0, 7e4)}`,
		maxTokens: 8192,
		timeoutMs: 12e4,
		temperature: .35,
		model: "grok-4.6",
		effort: "low"
	}));
}
async function chatGrok(opts) {
	const apiKey = process.env.XAI_API_KEY;
	if (!apiKey) {
		if (opts.job && opts.agent) {
			const craft = craftOf(opts.agent, opts.job.locale);
			opts.job.wire = opts.job.locale === "it"
				? `${opts.agent} · ${craft} · niente chiave API. Non sto chiamando il modello.`
				: `${opts.agent} · ${craft} · no API key. Not calling the model.`;
			opts.job.beat = Date.now();
			think(opts.job, opts.agent, "Niente chiave API. Non sto lavorando sul modello.", "No API key. Not calling the model.");
		}
		return "";
	}
	const model = opts.model ?? "grok-4.5";
	const t0 = Date.now();
	let ticker;
	if (opts.job && opts.agent) {
		const craft = craftOf(opts.agent, opts.job.locale);
		opts.job.beat = t0;
		opts.job.wire = opts.job.locale === "it"
			? `${opts.agent} · ${craft} · al lavoro · 0s · segnale vivo`
			: `${opts.agent} · ${craft} · working · 0s · live signal`;
		await persist(opts.job);
		ticker = setInterval(() => {
			const s = Math.round((Date.now() - t0) / 1e3);
			opts.job.beat = Date.now();
			opts.job.wire = opts.job.locale === "it"
				? `${opts.agent} · ${craft} · al lavoro · ${s}s · segnale vivo`
				: `${opts.agent} · ${craft} · working · ${s}s · live signal`;
			void persist(opts.job);
		}, 2500);
	}
	const userMsg = typeof opts.user === "string" ? { role: "user", content: opts.user } : { role: "user", content: opts.user };
	try {
		const res = await fetch("https://api.x.ai/v1/chat/completions", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`
			},
			signal: AbortSignal.timeout(opts.timeoutMs),
			body: JSON.stringify({
				model,
				temperature: opts.temperature,
				max_tokens: opts.maxTokens,
				reasoning_effort: opts.effort ?? "low",
				messages: [{ role: "system", content: opts.system }, userMsg]
			})
		});
		if (!res.ok) {
			if (opts.job && opts.agent) {
				opts.job.beat = Date.now();
				const craft = craftOf(opts.agent, opts.job.locale);
				opts.job.wire = opts.job.locale === "it"
					? `${opts.agent} · ${craft} · errore di rete`
					: `${opts.agent} · ${craft} · network error`;
				await persist(opts.job);
			}
			return "";
		}
		const msg = (await res.json()).choices?.[0]?.message;
		const content = msg?.content ?? "";
		if (opts.job && opts.agent) {
			opts.job.beat = Date.now();
			const craft = craftOf(opts.agent, opts.job.locale);
			opts.job.wire = content.trim()
				? (opts.job.locale === "it"
					? `${opts.agent} · ${craft} · ha consegnato`
					: `${opts.agent} · ${craft} · delivered`)
				: (opts.job.locale === "it"
					? `${opts.agent} · ${craft} · risposta vuota`
					: `${opts.agent} · ${craft} · empty reply`);
			await persist(opts.job);
		}
		if (content.trim()) return content;
		const reason = msg?.reasoning_content ?? "";
		if (reason.includes("<html") || reason.includes("<!DOCTYPE")) return reason;
		return content;
	} catch {
		if (opts.job && opts.agent) {
			opts.job.beat = Date.now();
			const craft = craftOf(opts.agent, opts.job.locale);
			opts.job.wire = opts.job.locale === "it"
				? `${opts.agent} · ${craft} · timeout. Passo oltre.`
				: `${opts.agent} · ${craft} · timed out. Moving on.`;
			think(opts.job, opts.agent, "Timeout. Non resto appeso.", "Timed out. Moving on.");
			await persist(opts.job);
		}
		return "";
	} finally {
		if (ticker) clearInterval(ticker);
	}
}
function parseJson(text) {
	if (!text) return null;
	const raw = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? text;
	const start = raw.indexOf("{");
	const end = raw.lastIndexOf("}");
	if (start < 0 || end <= start) return null;
	try {
		return JSON.parse(raw.slice(start, end + 1));
	} catch {
		return null;
	}
}
function extractHtml(text) {
	if (!text) return null;
	const fence = text.match(/```html\s*([\s\S]*?)```/i);
	if (fence?.[1] && /<html/i.test(fence[1])) return closeHtml(fence[1].trim());
	const doc = text.match(/<!DOCTYPE html[\s\S]*/i);
	if (doc) return closeHtml(doc[0].trim());
	const html = text.match(/<html[\s\S]*/i);
	if (html) return closeHtml(html[0].trim());
	return null;
}
function closeHtml(html) {
	let out = html;
	if (!/<\/body>/i.test(out)) out += "\n</body>";
	if (!/<\/html>/i.test(out)) out += "\n</html>";
	return out;
}

export const startBuild = createServerFn({ method: "POST" })
  .validator((input: {
    prompt: string;
    locale?: string;
    mode?: ActionId;
    currentHtml?: string | null;
    projectId?: string;
    gear?: Gear;
    max?: boolean;
  }) => ({
    prompt: input.prompt.trim().slice(0, 2000),
    locale: normalizeLocale(input.locale),
    mode:
      input.mode === "debug" || input.mode === "iterate" || input.mode === "generate"
        ? input.mode
        : ("generate" as const),
    currentHtml: input.currentHtml ?? null,
    projectId: input.projectId,
    gear: (input.gear === "house" || input.gear === "fast" ? input.gear : "auto") as Gear,
    max: Boolean(input.max),
  }))
  .handler(({ data }) => {
    if (!data.prompt) throw new Error(t(data.locale, "err.describe"));
    const jobId = enqueueBuild({
      prompt: data.prompt,
      locale: data.locale,
      mode: data.mode,
      currentHtml: data.currentHtml,
      projectId: data.projectId,
      gear: data.gear,
      max: data.max,
    });
    return { jobId };
  });

export const getBuildJob = createServerFn({ method: "GET" })
  .validator((input: { jobId?: string; projectId?: string }) => ({
    jobId: input.jobId,
    projectId: input.projectId,
  }))
  .handler(async ({ data }) => {
    if (data.jobId) {
      const mem = getJob(data.jobId);
      if (mem) return mem;
      const fromDb = await loadJobFromDb({ jobId: data.jobId });
      if (fromDb) return fromDb;
    }
    if (data.projectId) {
      const mem = findJobByProject(data.projectId);
      if (mem) return mem;
      return await loadJobFromDb({ projectId: data.projectId });
    }
    return null;
  });

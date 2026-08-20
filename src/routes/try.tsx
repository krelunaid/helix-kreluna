import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Bug, Rocket, Send } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { PreviewFrame } from "@/components/preview-frame";
import { ScoreCard } from "@/components/score-card";
import { ControlCenter } from "@/components/control-center";
import { HumanGate } from "@/components/human-gate";
import { ThoughtStream, WorkingBanner } from "@/components/thought-stream";
import { GemRail } from "@/components/gem-rail";
import type { LookId } from "@/lib/atelier";
import { LumenBoard } from "@/components/lumen-board";
import { Button } from "@/components/ui/button";
import { ACTIONS } from "@/lib/plans";
import { getGuestBuildJob, startGuestBuild } from "@/lib/server/agents";
import type { PublicBuildJob } from "@/lib/agent-types";
import { type ChatMessage } from "@/lib/server/vetra";
import { loadGuest, saveGuest, type GuestProject } from "@/lib/guest";
import {
  loadGuestBuildAccess,
  saveGuestBuildAccess,
} from "@/lib/guest-build-access";
import { publishGuest } from "@/lib/server/deploy";
import { decideGuestBuildJob } from "@/lib/server/review/human-gate";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

type Search = { job?: string };

export const Route = createFileRoute("/try")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    job: typeof s.job === "string" ? s.job : undefined,
  }),
  component: GuestStudio,
});

function GuestStudio() {
  const { job: jobId } = Route.useSearch();
  const navigate = useNavigate();
  const { locale, t } = useI18n();
  const [project, setProject] = useState<GuestProject | null>(null);
  const [job, setJob] = useState<PublicBuildJob | null>(null);
  const [jobAccessError, setJobAccessError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<
    "iterate" | "debug" | "pub" | "reject" | null
  >(null);
  const [published, setPublished] = useState<{ url: string; testersUrl: string; testersCode: string } | null>(null);
  const [mobile, setMobile] = useState<"preview" | "chat">(jobId ? "chat" : "preview");

  useEffect(() => {
    const stored = loadGuest();
    if (stored) setProject(stored);
    if (!jobId && !stored) {
      void navigate({ to: "/studio" });
    }
  }, [jobId, navigate]);

  useEffect(() => {
    if (!jobId) return;
		const activeJobId = jobId;
    let stop = false;
    let misses = 0;
    async function tick() {
			const guestAccessToken = loadGuestBuildAccess(activeJobId);
			if (!guestAccessToken) {
				if (!stop) {
					setJobAccessError(
						locale === "it"
							? "L'accesso guest è scaduto. Avvia una nuova generazione."
							: "Guest access expired. Start a new generation.",
					);
				}
				return;
			}
			let next: PublicBuildJob | null;
			try {
				next = await getGuestBuildJob({
					data: { jobId: activeJobId, guestAccessToken },
				});
			} catch {
				if (!stop) {
					setJobAccessError(
						locale === "it"
							? "Accesso guest non valido o scaduto."
							: "Guest access is invalid or expired.",
					);
				}
				return;
			}
      if (stop) return;
      if (next) {
				setJobAccessError(null);
        misses = 0;
        setJob(next);
        if (next.html) {
          const guest: GuestProject = {
            title: next.title,
            prompt: next.prompt,
            html: next.html,
            usedAi: next.usedAi,
            locale: next.locale,
            messages: [
              { role: "user", content: next.prompt, kind: "build" },
              ...next.steps
                .filter((s: { status: string }) => s.status === "done" || s.status === "running")
                .map(
                  (s: { detail: string; role: string; agent: string }): ChatMessage => ({
                    role: "assistant",
                    content: s.detail || s.role,
                    kind: "build",
                    agent: s.agent,
                  }),
                ),
            ],
          };
          saveGuest(guest);
          setProject(guest);
        }
        if (next.status === "running") {
          window.setTimeout(() => void tick(), 500);
        }
      } else if (misses < 25) {
        misses += 1;
        window.setTimeout(() => void tick(), 400);
      }
    }
    void tick();
    return () => {
      stop = true;
    };
	}, [jobId, locale]);

  async function iterate(
    mode: "iterate" | "debug",
    sourceJobId?: string,
    promptOverride?: string,
  ) {
    if (!project) return;
    const prompt =
      promptOverride?.trim() ||
      (mode === "debug" ? note.trim() || t("studio.debugDefault") : note.trim());
    if (mode === "iterate" && !prompt) return;
    setBusy(mode);
    try {
			const sourceGuestAccessToken = sourceJobId
				? (loadGuestBuildAccess(sourceJobId) ?? undefined)
				: undefined;
			if (sourceJobId && !sourceGuestAccessToken) {
				throw new Error(t("gate.guestExpired"));
			}
			const requestId = crypto.randomUUID();
				const {
				jobId: nextId,
				guestAccessToken,
				expiresAt,
			} = await startGuestBuild({
        data: {
          prompt,
          locale,
          currentHtml: project.html,
          mode,
				buildLevel: job?.buildLevel ?? "prototype",
				sourceJobId,
				sourceGuestAccessToken,
				requestId: sourceJobId ? requestId : undefined,
        },
      });
			saveGuestBuildAccess(nextId, guestAccessToken, expiresAt);
      setNote("");
      void navigate({ to: "/try", search: { job: nextId } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("studio.errIterate"));
    } finally {
      setBusy(null);
    }
  }

  const html = job?.html || project?.html || null;
  const title = job?.title ?? project?.title ?? t("studio.title");
  const hasApp = Boolean(html && html.length > 1500 && !/Helix sta costruendo/i.test(html));
  const running = (job?.status === "running" && !hasApp) || !!busy;

  async function publish() {
    if (!html || !jobId || !job) return;
    const guestAccessToken = loadGuestBuildAccess(jobId);
    if (!guestAccessToken) {
      toast.error(t("gate.guestExpired"));
      return;
    }
    setBusy("pub");
    try {
      if (job.queue?.status === "awaiting_human_approval") {
        await decideGuestBuildJob({
          data: {
            jobId,
            guestAccessToken,
            decision: "approve",
            requestId: crypto.randomUUID(),
          },
        });
      }
      const r = await publishGuest({
        data: {
          jobId,
          guestAccessToken,
          requestId: crypto.randomUUID(),
        },
      });
      setPublished(r);
      toast.success(t("launch.webOk"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("launch.err"));
    } finally {
      setBusy(null);
    }
  }

  async function reject() {
    if (!jobId || job?.queue?.status !== "awaiting_human_approval") return;
    const guestAccessToken = loadGuestBuildAccess(jobId);
    if (!guestAccessToken) {
      toast.error(t("gate.guestExpired"));
      return;
    }
    setBusy("reject");
    try {
      await decideGuestBuildJob({
        data: {
          jobId,
          guestAccessToken,
          decision: "reject",
          requestId: crypto.randomUUID(),
          reason: note.trim() || undefined,
        },
      });
      const next = await getGuestBuildJob({
        data: { jobId, guestAccessToken },
      });
      if (next) setJob(next);
      toast.message(t("gate.held"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("launch.err"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden pt-0">
      <SiteHeader dense />
      <div className="border-b border-accent/40 bg-accent/10 px-4 py-2 text-sm text-fg">
        {t("guest.banner")} {t("desk.prototypeHint")}{" "}
        <Link to="/login" search={{ next: "/try" }} className="underline underline-offset-2">
          {t("guest.cta")}
        </Link>
      </div>
      <WorkingBanner
        running={running || (!!jobId && !job)}
        beat={job?.beat}
        line={
					jobAccessError ||
					job?.wire ||
          (job?.thoughts?.length
            ? `${job.thoughts[job.thoughts.length - 1].agent}: ${job.thoughts[job.thoughts.length - 1].text}`
            : undefined)
        }
      />
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-medium">{title}</p>
            <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] tracking-wide text-muted uppercase">
              {t("desk.prototype")}
            </span>
          </div>
          <p className="text-xs text-subtle">
            {job?.liveUrl ? (
              <a href={job.liveUrl} className="text-accent underline-offset-2 hover:underline" target="_blank" rel="noreferrer">
                {job.liveUrl}
              </a>
            ) : running ? (
              t("agent.working")
            ) : job?.usedAi || project?.usedAi ? (
              t("agent.crew")
            ) : (
              t("studio.preview")
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {published ? (
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={published.url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-accent underline-offset-2 hover:underline"
              >
                {t("try.published")}
              </a>
              <Link
                to="/login"
                search={{ next: "/studio" }}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-3 text-xs font-medium text-accent-fg"
              >
                <Rocket className="size-4" />
                {t("launch.studioCta")}
              </Link>
            </div>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              disabled={
                !hasApp ||
                !jobId ||
                busy === "pub" ||
                (job?.queue?.status !== "awaiting_human_approval" &&
                  job?.queue?.status !== "approved" &&
                  job?.queue?.status !== "deployed")
              }
              onClick={() => void publish()}
            >
              <Rocket className="size-3.5" />
              {busy === "pub" ? t("launch.shipping") : t("try.publish")}
            </Button>
          )}
        </div>
      </div>

      <div className="flex border-b border-border md:hidden">
        <button
          type="button"
          className={cn("flex-1 py-2.5 text-sm", mobile === "preview" ? "text-fg" : "text-muted")}
          onClick={() => setMobile("preview")}
        >
          {t("studio.previewTab")}
        </button>
        <button
          type="button"
          className={cn("flex-1 py-2.5 text-sm", mobile === "chat" ? "text-fg" : "text-muted")}
          onClick={() => setMobile("chat")}
        >
          {t("studio.chatTab")}
        </button>
      </div>

      <div className="grid min-h-0 flex-1 md:grid-cols-2">
        <div className={cn("min-h-0 p-3", mobile === "preview" ? "block" : "hidden md:block")}>
          <PreviewFrame
            html={html}
            className="h-full min-h-[360px]"
            label={
              running && html && html.length > 1500 && !/Helix sta costruendo/i.test(html)
                ? t("preview.refining")
                : running
                  ? t("studio.building")
                  : job?.queue?.status === "deployed"
                    ? t("preview.live")
                    : t("gate.candidateReady")
            }
          />
        </div>
        <aside
          className={cn(
            "flex min-h-0 flex-col border-t border-border bg-bg md:border-t-0 md:border-l",
            mobile === "chat" ? "flex" : "hidden md:flex",
          )}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-5">
            <ThoughtStream
              thoughts={job?.thoughts}
              running={running || job?.status === "running" || (!!jobId && !job)}
              agent={job?.steps.find((s) => s.status === "running")?.agent}
            />
            {job ? <ControlCenter steps={job.steps} status={job.status} /> : null}
            <GemRail runs={job?.gems} />
            {running && !job ? null : (
              <>
                <LumenBoard
                  look={job?.look}
                  mood={job?.designMood}
                  onPick={(id: LookId) => {
                    if (!job || job.queue?.status !== "awaiting_human_approval") return;
                    void iterate(
                      "iterate",
                      job.id,
                      locale === "it"
                        ? `Applica la direzione visiva ${id} al candidato, preservando funzioni e contenuti.`
                        : `Apply visual direction ${id} to the candidate while preserving behavior and content.`,
                    );
                  }}
                />
                {job?.score && job.queue?.status === "awaiting_human_approval" ? (
                  <HumanGate
                    quality={job.quality}
                    onApprove={() => void publish()}
                    onModify={() => {
                      if (!note.trim()) {
                        toast.message(t("gate.modifyHint"));
                        return;
                      }
                      void iterate("iterate", job.id);
                    }}
                    onReject={() => void reject()}
                    onCouncil={() => toast.message(job.score?.council.why ?? "")}
                    busy={busy !== null}
                  />
                ) : null}
                {job?.score ? (
                  <ScoreCard
                    score={job.score}
                    compact
                    onImprove={(improveId) => {
                      if (job.queue?.status !== "awaiting_human_approval") return;
                      void iterate(
                        "iterate",
                        job.id,
                        locale === "it"
                          ? `Migliora il candidato sul criterio ${improveId}; conserva tutte le funzioni esistenti e verifica il risultato.`
                          : `Improve the candidate on criterion ${improveId}; preserve every existing behavior and validate the result.`,
                      );
                    }}
                  />
                ) : null}
                {(project?.messages ?? []).map((m, i) => (
                  <div key={`${i}-${m.role}`} className={m.role === "user" ? "text-fg" : "text-muted"}>
                    <p className="text-[11px] tracking-wide text-subtle uppercase">
                      {m.role === "user" ? t("studio.you") : m.agent || t("studio.assistant")}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed">{m.content}</p>
                  </div>
                ))}
              </>
            )}
          </div>
          <form
            className="border-t border-border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void iterate(
                "iterate",
                job?.queue?.status === "awaiting_human_approval" ? job.id : undefined,
              );
            }}
          >
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder={t("studio.changePh")}
              className="w-full resize-none rounded-md bg-elevated px-3 py-2 text-sm outline-none shadow-[0_0_0_1px_rgb(255_255_255/0.08)]"
            />
            <div className="mt-2 flex gap-2">
              <Button type="submit" size="sm" className="flex-1" disabled={running || !note.trim()}>
                <Send className="size-3.5" />
                {t("studio.edit", { n: ACTIONS.iterate.credits })}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={running}
                onClick={() => void iterate("debug")}
              >
                <Bug className="size-3.5" />
                {ACTIONS.debug.credits}
              </Button>
            </div>
          </form>
        </aside>
      </div>
    </div>
  );
}

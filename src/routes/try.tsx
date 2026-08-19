import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Bug, Rocket, Send } from "lucide-react";
import { AppStoreMark, PlayStoreMark } from "@/components/store-marks";
import { SiteHeader } from "@/components/site-header";
import { PreviewFrame } from "@/components/preview-frame";
import { ScoreCard } from "@/components/score-card";
import { ControlCenter } from "@/components/control-center";
import { HumanGate } from "@/components/human-gate";
import { ThoughtStream, WorkingBanner } from "@/components/thought-stream";
import { GemRail } from "@/components/gem-rail";
import { liftScore } from "@/lib/server/score-fn";
import { applyLook, lookById, type LookId } from "@/lib/atelier";
import { LumenBoard } from "@/components/lumen-board";
import { Button } from "@/components/ui/button";
import { ACTIONS } from "@/lib/plans";
import { startBuild, getBuildJob } from "@/lib/server/agents";
import type { BuildJob } from "@/lib/agent-types";
import { type ChatMessage } from "@/lib/server/vetra";
import { loadGuest, saveGuest, type GuestProject } from "@/lib/guest";
import { publishGuest } from "@/lib/server/deploy";
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
  const [job, setJob] = useState<BuildJob | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"iterate" | "debug" | "pub" | null>(null);
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
    let stop = false;
    let misses = 0;
    async function tick() {
      const next = await getBuildJob({ data: { jobId } });
      if (stop) return;
      if (next) {
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
  }, [jobId]);

  async function iterate(mode: "iterate" | "debug") {
    if (!project) return;
    const prompt =
      mode === "debug" ? note.trim() || t("studio.debugDefault") : note.trim();
    if (mode === "iterate" && !prompt) return;
    setBusy(mode);
    try {
      const { jobId: nextId } = await startBuild({
        data: {
          prompt,
          locale,
          currentHtml: project.html,
          mode,
        },
      });
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
    if (!html) return;
    setBusy("pub");
    try {
      const r = await publishGuest({ data: { title, html } });
      setPublished(r);
      toast.success(t("launch.webOk"));
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
        {t("guest.banner")}{" "}
        <Link to="/login" search={{ next: "/try" }} className="underline underline-offset-2">
          {t("guest.cta")}
        </Link>
      </div>
      <WorkingBanner
        running={running || (!!jobId && !job)}
        beat={job?.beat}
        line={
          job?.wire ||
          (job?.thoughts?.length
            ? `${job.thoughts[job.thoughts.length - 1].agent}: ${job.thoughts[job.thoughts.length - 1].text}`
            : undefined)
        }
      />
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{title}</p>
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
                <AppStoreMark className="size-5" />
                <PlayStoreMark className="size-5" />
                {t("launch.studioCta")}
              </Link>
            </div>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              disabled={!hasApp || busy === "pub"}
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
                  : t("preview.live")
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
                    const src = job?.html ?? project?.html;
                    if (!src || !job) return;
                    const html = applyLook(src, lookById(id));
                    setJob({ ...job, html, look: id });
                    if (project) {
                      const next = { ...project, html };
                      saveGuest(next);
                      setProject(next);
                    }
                  }}
                />
                {job?.score ? (
                  <HumanGate
                    onApprove={() => void publish()}
                    onModify={() => undefined}
                    onReject={() => toast.message(t("gate.held"))}
                    onCouncil={() => toast.message(job.score?.council.why ?? "")}
                  />
                ) : null}
                {job?.score ? (
                  <ScoreCard
                    score={job.score}
                    compact
                    onImprove={(improveId) => {
                      if (!job.html) return;
                      void liftScore({ data: { html: job.html, prompt: job.prompt, id: improveId } }).then((r) => {
                        setJob({ ...job, html: r.html, score: r.score });
                      });
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
              void iterate("iterate");
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

import { useEffect, useState } from "react";
import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { Bug, Send } from "lucide-react";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
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
import {
  getProject,
  iterateProject,
  type Profile,
  type Project,
} from "@/lib/server/vetra";
import { getBuildJob } from "@/lib/server/agents";
import {
  approveBuildJob,
  rejectBuildJob,
} from "@/lib/server/review/human-gate";
import type { PublicBuildJob } from "@/lib/agent-types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/studio/$id")({ component: Studio });

function Studio() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const onLaunch = useRouterState({
    select: (s) => s.location.pathname.endsWith("/launch"),
  });
  const { user, isPending } = useCurrentUserState();
  const { locale, t } = useI18n();
  const [project, setProject] = useState<Project | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<
    "iterate" | "debug" | "host" | "approve" | "reject" | null
  >(null);
  const [mobile, setMobile] = useState<"preview" | "chat">("chat");
  const [job, setJob] = useState<PublicBuildJob | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let stop = false;
    async function tick() {
      try {
        const r = await getProject({ data: id });
        if (stop) return;
        setProject(r.project);
        setProfile(r.profile);
        const next = await getBuildJob({ data: { projectId: id } });
        if (stop) return;
        if (next) setJob(next);
        if (r.project.status === "building" || next?.status === "running") {
          window.setTimeout(() => void tick(), 500);
        }
      } catch (e: unknown) {
        if (!stop) setError(e instanceof Error ? e.message : "Errore");
      }
    }
    void tick();
    return () => {
      stop = true;
    };
  }, [user?.id, id, busy]);

  if (onLaunch) return <Outlet />;

  if (isPending) {
    return (
      <div className="min-h-screen pt-0">
        <SiteHeader dense />
        <p className="px-5 py-16 text-sm text-muted">{t("studio.openStudio")}</p>
      </div>
    );
  }
  if (!user) return <RedirectToSignIn />;

  const expired =
    project &&
    profile?.plan === "free" &&
    !project.hosted &&
    Date.now() - new Date(project.created_at).getTime() > 6 * 60 * 60 * 1000;

  async function iterate(
    mode: "iterate" | "debug",
    sourceJobId?: string,
    promptOverride?: string,
  ) {
    if (!project) return;
    const prompt =
      promptOverride?.trim() || (mode === "debug"
        ? note.trim() || t("studio.debugDefault")
        : note.trim());
    if (mode === "iterate" && !prompt) return;
    setBusy(mode);
    try {
			const r = await iterateProject({
				data: {
					id: project.id,
					prompt,
					mode,
						locale,
						requestId: crypto.randomUUID(),
						sourceJobId,
				},
			});
      setProject(r.project);
      setProfile(r.profile);
      setNote("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("studio.errIterate"));
    } finally {
      setBusy(null);
    }
  }

  async function approve() {
    if (!job || job.queue?.status !== "awaiting_human_approval") return;
    setBusy("approve");
    try {
      await approveBuildJob({
        data: { jobId: job.id, requestId: crypto.randomUUID() },
      });
      const next = await getBuildJob({ data: { jobId: job.id } });
      if (next) setJob(next);
      await navigate({ to: "/studio/$id/launch", params: { id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("launch.err"));
    } finally {
      setBusy(null);
    }
  }

  async function reject() {
    if (!job || job.queue?.status !== "awaiting_human_approval") return;
    setBusy("reject");
    try {
      await rejectBuildJob({
        data: {
          jobId: job.id,
          requestId: crypto.randomUUID(),
          reason: note.trim() || undefined,
        },
      });
      const next = await getBuildJob({ data: { jobId: job.id } });
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
      <SiteHeader credits={profile?.credits_balance} dense />
      {error ? (
        <div className="px-5 py-16 text-sm text-danger">{error}</div>
      ) : !project ? (
        <p className="px-5 py-16 text-sm text-muted">{t("studio.loadProject")}</p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium">{project.title}</p>
                <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] tracking-wide text-muted uppercase">
                  {project.buildLevel === "production"
                    ? t("desk.production")
                    : t("desk.prototype")}
                </span>
              </div>
              <p className="text-xs tabular-nums text-subtle">
                {t("studio.used", { n: project.credits_spent })}
                {project.hosted
                  ? t("studio.online30")
                  : profile?.plan === "free"
                    ? t("studio.expires")
                    : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                size="sm"
                type="button"
                disabled={
                  job?.queue?.status !== "approved" &&
                  job?.queue?.status !== "deployed"
                }
                onClick={() => void navigate({ to: "/studio/$id/launch", params: { id: project.id } })}
              >
                <Send className="size-4" />
                {t("launch.studioCta")}
              </Button>
            </div>
          </div>

          <WorkingBanner
            running={project.status === "building" || job?.status === "running"}
            beat={job?.beat}
            line={
              job?.wire ||
              (job?.thoughts?.length
                ? `${job.thoughts[job.thoughts.length - 1].agent}: ${job.thoughts[job.thoughts.length - 1].text}`
                : undefined)
            }
          />

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

          {expired ? (
            <div className="border-b border-border bg-elevated px-4 py-2 text-sm text-muted">
              {t("studio.expired")}{" "}
              <Link to="/pricing" className="text-fg underline underline-offset-2">
                {t("studio.upgrade")}
              </Link>{" "}
              {t("studio.orHost", { n: ACTIONS.host.credits })}
            </div>
          ) : null}

          <div className="grid min-h-0 flex-1 md:grid-cols-2">
            <div className={cn("min-h-0 p-3", mobile === "preview" ? "block" : "hidden md:block")}>
              <PreviewFrame
                html={expired ? null : (job?.html ?? project.html)}
                className="h-full min-h-[360px]"
                label={(() => {
                  const page = job?.html ?? project.html ?? "";
                  const busy = project.status === "building" || job?.status === "running";
                  if (busy && page.length > 1500 && !/Helix sta costruendo/i.test(page)) {
                    return t("preview.refining");
                  }
                  if (busy) return t("studio.building");
                  if (project.status === "ready") return t("gate.candidateReady");
                  return project.status;
                })()}
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
                  running={project.status === "building" || job?.status === "running"}
                  agent={job?.steps.find((s) => s.status === "running")?.agent}
                />
                {job ? <ControlCenter steps={job.steps} status={job.status} /> : null}
                <GemRail runs={job?.gems} />
                {project.status === "building" && !job ? (
                  <p className="shimmer text-sm">{t("studio.working")}</p>
                ) : null}
                <LumenBoard
                  look={job?.look}
                  mood={job?.designMood}
                  onPick={(id: LookId) => {
                    if (job?.queue?.status !== "awaiting_human_approval") return;
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
                    onApprove={() => void approve()}
                    onModify={() => {
                      if (!note.trim()) {
                        toast.message(t("gate.modifyHint"));
                        return;
                      }
                      void iterate("iterate", job.id);
                    }}
                    onReject={() => void reject()}
                    onCouncil={() => toast.message(job.score?.council.why ?? "")}
                    busy={busy === "approve" || busy === "reject" || busy === "iterate"}
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
                {project.messages.map((m, i) => (
                  <div key={`${i}-${m.role}`} className={m.role === "user" ? "text-fg" : "text-muted"}>
                    <p className="text-[11px] tracking-wide text-subtle uppercase">
                      {m.role === "user" ? t("studio.you") : m.agent || t("studio.assistant")}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed">{m.content}</p>
                  </div>
                ))}
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
                  <Button
                    type="submit"
                    size="sm"
                    className="flex-1"
                    disabled={!!busy || !note.trim()}
                  >
                    <Send className="size-3.5" />
                    {t("studio.edit", { n: ACTIONS.iterate.credits })}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={!!busy}
                    onClick={() => void iterate("debug")}
                  >
                    <Bug className="size-3.5" />
                    {ACTIONS.debug.credits}
                  </Button>
                </div>
              </form>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

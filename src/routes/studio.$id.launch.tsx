import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, Github, Globe, Monitor, Wifi } from "lucide-react";
import { AppStoreMark, PlayStoreMark } from "@/components/store-marks";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { getProject, type Profile, type Project } from "@/lib/server/vetra";
import {
  DEPLOY_COST,
  downloadNativePack,
  listDeploys,
  publishWeb,
  shipStore,
  type Deploy,
} from "@/lib/server/deploy";
import type { KrelunaScore } from "@/lib/score";
import { ScoreCard } from "@/components/score-card";
import { bundleIdFromTitle } from "@/lib/expo-pack";
import { toast } from "sonner";
import { wantsDesktop } from "@/lib/brief";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { githubStatus, pushProjectGithub } from "@/lib/server/github";
import { getBuildJob } from "@/lib/server/agents";
import type { PublicBuildJob } from "@/lib/agent-types";
import { downloadApprovedWorkspace } from "@/lib/server/workspace-export";

export const Route = createFileRoute("/studio/$id/launch")({ component: Launch });

function Launch() {
  const { id } = Route.useParams();
  const { user, isPending } = useCurrentUserState();
  const { t } = useI18n();
  const [project, setProject] = useState<Project | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [deploys, setDeploys] = useState<Deploy[]>([]);
  const [appleTeam, setAppleTeam] = useState("");
  const [bundleId, setBundleId] = useState("");
  const [busy, setBusy] = useState<"web" | "ios" | "android" | "windows" | "zip-ios" | "zip-android" | "zip-windows" | "workspace" | "gh" | null>(null);
  const [ghUrl, setGhUrl] = useState<string | null>(null);
  const [web, setWeb] = useState<{ url: string; testersUrl: string; testersCode: string } | null>(null);
  const [score, setScore] = useState<KrelunaScore | null>(null);
  const [job, setJob] = useState<PublicBuildJob | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    void getProject({ data: id })
      .then((r) => {
        setProject(r.project);
        setProfile(r.profile);
        setBundleId((b) => b || bundleIdFromTitle(r.project.title));
      })
      .catch((error) => setLoadError(error instanceof Error ? error.message : t("launch.err")));
    void getBuildJob({ data: { projectId: id } })
      .then((next) => {
        setJob(next);
        setScore(next?.score ?? null);
      })
      .catch((error) => setLoadError(error instanceof Error ? error.message : t("launch.err")));
    void listDeploys({ data: id })
      .then(setDeploys)
      .catch((error) => setLoadError(error instanceof Error ? error.message : t("launch.err")));
  }, [user?.id, id, t]);

  if (isPending) {
    return (
      <div className="min-h-screen">
        <SiteHeader dense />
      </div>
    );
  }
  if (!user) return <RedirectToSignIn />;

  async function goWeb() {
    if (!job) return;
    setBusy("web");
    try {
      const r = await publishWeb({
        data: { projectId: id, jobId: job.id, requestId: crypto.randomUUID() },
      });
      setWeb(r);
      setDeploys(await listDeploys({ data: id }));
      const next = await getProject({ data: id });
      setProject(next.project);
      setProfile(next.profile);
      toast.success(t("launch.webOk"));
      if (score && score.readiness < 80) toast.message(t("score.shipWarn"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("launch.err"));
    } finally {
      setBusy(null);
    }
  }

  async function goStore(target: "ios" | "android") {
    if (!job) return;
    setBusy(target);
    try {
      const r = await shipStore({
        data: {
          projectId: id,
          jobId: job.id,
          target,
          appleTeam,
          bundleId,
          requestId: crypto.randomUUID(),
        },
      });
      setDeploys(await listDeploys({ data: id }));
      const next = await getProject({ data: id });
      setProfile(next.profile);
      if (r.pack?.base64) {
        const bin = atob(r.pack.base64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const blob = new Blob([bytes], { type: "application/zip" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = r.pack.filename;
        a.click();
        URL.revokeObjectURL(a.href);
      }
      toast.success(target === "ios" ? t("launch.iosOk") : t("launch.andOk"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("launch.err"));
    } finally {
      setBusy(null);
    }
  }

  async function zip(target: "ios" | "android" | "windows") {
    if (!project?.html || !job) return;
    setBusy(target === "ios" ? "zip-ios" : target === "windows" ? "zip-windows" : "zip-android");
    try {
      const pack = await downloadNativePack({
        data: {
          projectId: id,
          jobId: job.id,
          target,
          appleTeam,
          bundleId,
        },
      });
      const bin = atob(pack.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/zip" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = pack.filename;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success(target === "windows" ? t("launch.winOk") : target === "ios" ? t("launch.iosOk") : t("launch.andOk"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("launch.err"));
    } finally {
      setBusy(null);
    }
  }

  async function downloadWorkspace() {
    if (!job?.workspace) return;
    setBusy("workspace");
    try {
      const pack = await downloadApprovedWorkspace({
        data: { projectId: id, jobId: job.id },
      });
      const bin = atob(pack.base64);
      const bytes = new Uint8Array(bin.length);
      for (let index = 0; index < bin.length; index += 1) {
        bytes[index] = bin.charCodeAt(index);
      }
      const blob = new Blob([bytes], { type: "application/zip" });
      const anchor = document.createElement("a");
      anchor.href = URL.createObjectURL(blob);
      anchor.download = pack.filename;
      anchor.click();
      URL.revokeObjectURL(anchor.href);
      toast.success(t("workspace.downloaded"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("launch.err"));
    } finally {
      setBusy(null);
    }
  }

  const showWindows = wantsDesktop(project?.prompt ?? "");
  const gateReady =
    job?.queue?.status === "approved" || job?.queue?.status === "deployed";

  return (
    <div className="min-h-screen">
      <SiteHeader credits={profile?.credits_balance} dense />
      <div className="mx-auto max-w-5xl px-4 py-8">
        <p className="text-xs tracking-[0.16em] text-muted uppercase">{t("launch.kicker")}</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-4xl tracking-tight">
                {project?.title ?? t("launch.title")}
              </h1>
              {project ? (
                <span className="rounded-full border border-border px-2 py-1 text-[10px] tracking-wide text-muted uppercase">
                  {project.buildLevel === "production"
                    ? t("desk.production")
                    : t("desk.prototype")}
                </span>
              ) : null}
            </div>
            <p className="mt-2 max-w-xl text-sm text-muted">{t("launch.lead")}</p>
          </div>
          <Link to="/studio/$id" params={{ id }} className="text-sm text-muted underline-offset-4 hover:text-fg hover:underline">
            {t("launch.back")}
          </Link>
        </div>
        <div className="mt-4">
          {loadError ? (
            <p className="mb-3 text-sm text-danger">{loadError}</p>
          ) : null}
          {!gateReady ? (
            <div className="mb-4 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm">
              <p className="font-medium">{t("gate.releaseBlocked")}</p>
              <p className="mt-1 text-muted">{t("gate.releaseBlockedBody")}</p>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
          {ghUrl ? (
            <a href={ghUrl} target="_blank" rel="noreferrer" className="text-sm text-accent underline-offset-2 hover:underline">
              {ghUrl}
            </a>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              disabled={!project?.html || !job || !gateReady || busy === "gh"}
              onClick={() => {
                if (!job) return;
                setBusy("gh");
                void githubStatus()
                  .then((s) => {
                    if (!s.login) {
                      toast.message(t("acc.ghWho"));
                      throw new Error("no-gh");
                    }
                    return pushProjectGithub({
                      data: { projectId: id, jobId: job.id },
                    });
                  })
                  .then((r) => {
                    if (!r) return;
                    setGhUrl(r.url);
                    toast.success(t("acc.ghPushed"));
                  })
                  .catch((err) => {
                    if (err instanceof Error && err.message === "no-gh") return;
                    toast.error(err instanceof Error ? err.message : t("acc.ghErr"));
                  })
                  .finally(() => setBusy(null));
              }}
            >
              <Github className="size-4" />
              {t("acc.ghPush")}
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            disabled={!job?.workspace || !gateReady || busy === "workspace"}
            onClick={() => void downloadWorkspace()}
          >
            <Download className="size-4" />
            {busy === "workspace"
              ? t("launch.shipping")
              : t("workspace.download")}
          </Button>
          {job?.workspace ? (
            <span className="text-xs text-subtle">
              {job.workspace.fileCount} {t("workspace.files")} · {job.workspace.buildLevel}
            </span>
          ) : null}
          </div>
        </div>

        {score ? (
          <div className="mt-8">
            <ScoreCard score={score} />
          </div>
        ) : project?.html ? (
          <p className="mt-8 text-sm text-muted">
            {job ? t("score.unavailable") : t("score.scanning")}
          </p>
        ) : null}

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <article className="rounded-2xl bg-surface p-5 shadow-[0_0_0_1px_rgb(255_255_255/0.06)]">
            <AppStoreMark className="h-10 w-[135px]" />
            <h2 className="mt-3 text-lg">{t("launch.ios")}</h2>
            <p className="mt-1 text-sm text-muted">{t("launch.iosBody")}</p>
            <label className="mt-4 block text-xs text-subtle">
              Apple Team ID
              <input
                value={appleTeam}
                onChange={(e) => setAppleTeam(e.target.value)}
                placeholder="AB12C3D4E5"
                className="mt-1 w-full rounded-md bg-elevated px-3 py-2 text-sm text-fg outline-none shadow-[0_0_0_1px_rgb(255_255_255/0.08)]"
              />
            </label>
            <label className="mt-3 block text-xs text-subtle">
              Bundle ID
              <input
                value={bundleId}
                onChange={(e) => setBundleId(e.target.value)}
                className="mt-1 w-full rounded-md bg-elevated px-3 py-2 text-sm text-fg outline-none shadow-[0_0_0_1px_rgb(255_255_255/0.08)]"
              />
            </label>
            <p className="mt-3 text-xs text-subtle">{DEPLOY_COST.ios} cr</p>
            <Button className="mt-3 w-full" disabled={!!busy || !project?.html || !gateReady} onClick={() => void goStore("ios")}>
              {busy === "ios" ? t("launch.shipping") : t("launch.iosCta")}
            </Button>
          </article>

          <article className="rounded-2xl bg-surface p-5 shadow-[0_0_0_1px_rgb(255_255_255/0.06)]">
            <PlayStoreMark className="h-10 w-[135px]" />
            <h2 className="mt-3 text-lg">{t("launch.and")}</h2>
            <p className="mt-1 text-sm text-muted">{t("launch.andBody")}</p>
            <p className="mt-4 text-xs text-subtle">{DEPLOY_COST.android} cr</p>
            <Button className="mt-4 w-full" disabled={!!busy || !project?.html || !gateReady} onClick={() => void goStore("android")}>
              {busy === "android" ? t("launch.shipping") : t("launch.andCta")}
            </Button>
          </article>

          <article className="rounded-2xl bg-surface p-5 shadow-[0_0_0_1px_rgb(255_255_255/0.06)]">
            <Globe className="size-5 text-accent" />
            <h2 className="mt-3 text-lg">{t("launch.web")}</h2>
            <p className="mt-1 text-sm text-muted">{t("launch.webBody")}</p>
            <p className="mt-4 text-xs text-subtle">{DEPLOY_COST.web} cr</p>
            <Button className="mt-4 w-full" disabled={!!busy || !project?.html || !gateReady} onClick={() => void goWeb()}>
              <Wifi className="size-4" />
              {busy === "web" ? t("launch.shipping") : t("launch.webCta")}
            </Button>
            {web ? (
              <a href={web.url} className="mt-3 block truncate text-sm text-accent underline-offset-2 hover:underline">
                {web.url}
              </a>
            ) : null}
          </article>

          {showWindows ? (
          <article className="rounded-2xl bg-surface p-5 shadow-[0_0_0_1px_rgb(255_255_255/0.06)]">
            <Monitor className="size-5 text-accent" />
            <h2 className="mt-3 text-lg">{t("launch.win")}</h2>
            <p className="mt-1 text-sm text-muted">{t("launch.winBody")}</p>
            <p className="mt-4 text-xs text-subtle">{DEPLOY_COST.windows} cr</p>
            <Button className="mt-4 w-full" disabled={!!busy || !project?.html || !gateReady} onClick={() => void zip("windows")}>
              <Download className="size-4" />
              {busy === "zip-windows" ? t("launch.shipping") : t("launch.winCta")}
            </Button>
          </article>
          ) : null}
        </div>

        {web?.testersUrl ? (
          <div className="mt-6 rounded-2xl bg-accent/10 px-5 py-4 text-sm">
            <p className="font-medium">{t("launch.track")}</p>
            <p className="mt-1 text-muted">{t("launch.trackBody", { code: web.testersCode })}</p>
            <a href={web.testersUrl} className="mt-2 inline-block text-accent underline-offset-2 hover:underline">
              {web.testersUrl}
            </a>
          </div>
        ) : null}

        {deploys.length ? (
          <div className="mt-10">
            <p className="text-xs tracking-[0.16em] text-subtle uppercase">{t("launch.harbor")}</p>
            <ul className="mt-3 space-y-3">
              {deploys.map((d) => (
                <li key={d.id} className="rounded-xl bg-surface px-4 py-3 shadow-[0_0_0_1px_rgb(255_255_255/0.06)]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm">
                      {d.target === "web"
                        ? "Web"
                        : d.target === "ios"
                          ? t("launch.iosPackage")
                          : d.target === "windows"
                            ? "Windows"
                            : t("launch.androidPackage")} · {d.status}
                    </p>
                    {d.url ? (
                      <a href={d.url} className="text-xs text-accent underline-offset-2 hover:underline">
                        {d.url}
                      </a>
                    ) : null}
                  </div>
                  <ol className="mt-2 space-y-1">
                    {d.log.map((s) => (
                      <li key={s.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-muted">{s.label}</span>
                        <span
                          className={cn(
                            "uppercase",
                            s.status === "done" && "text-fg",
                            s.status === "blocked" && "text-accent",
                            s.status === "skipped" && "text-subtle",
                            s.status === "error" && "text-danger",
                          )}
                        >
                          {s.status}
                        </span>
                      </li>
                    ))}
                  </ol>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

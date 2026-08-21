import { useEffect, useRef, useState } from "react";
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
  getHarborProductionReadiness,
  getStoreReadiness,
  listDeploys,
  publishProductionWeb,
  publishWeb,
  refreshProductionWebRelease,
  resumeProductionWebRelease,
  refreshStoreSubmission,
  shipStore,
  type Deploy,
  type HarborProductionReadiness,
  type StoreReadiness,
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

function notifyStoreReleaseState(status: string, message: string) {
  if (status === "distributed") {
    toast.success(message);
  } else if (status === "failed") {
    toast.error(message);
  } else if (status === "action_required") {
    toast.warning(message);
  } else {
    toast.info(message);
  }
}

function Launch() {
  const { id } = Route.useParams();
  const { user, isPending } = useCurrentUserState();
  const { t } = useI18n();
  const [project, setProject] = useState<Project | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [deploys, setDeploys] = useState<Deploy[]>([]);
  const [appleTeam, setAppleTeam] = useState("");
  const [bundleId, setBundleId] = useState("");
  const [easProjectId, setEasProjectId] = useState("");
  const [storeConfirmed, setStoreConfirmed] = useState({ ios: false, android: false });
  const storeRequestIds = useRef({ ios: crypto.randomUUID(), android: crypto.randomUUID() });
  const harborResumeRequestIds = useRef<Record<string, string>>({});
  const [storeReadinessState, setStoreReadinessState] = useState<{
    ios: StoreReadiness | null;
    android: StoreReadiness | null;
  }>({ ios: null, android: null });
  const [harborProductionState, setHarborProductionState] =
    useState<HarborProductionReadiness | null>(null);
  const [refreshingStore, setRefreshingStore] = useState<string | null>(null);
  const [refreshingHarbor, setRefreshingHarbor] = useState<string | null>(null);
  const [busy, setBusy] = useState<
    | "web"
    | "ios"
    | "android"
    | "windows"
    | "zip-ios"
    | "zip-android"
    | "zip-windows"
    | "workspace"
    | "gh"
    | null
  >(null);
  const [ghUrl, setGhUrl] = useState<string | null>(null);
  const [web, setWeb] = useState<{ url: string; testersUrl: string; testersCode: string } | null>(
    null,
  );
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
    void Promise.all([getStoreReadiness({ data: "ios" }), getStoreReadiness({ data: "android" })])
      .then(([ios, android]) => setStoreReadinessState({ ios, android }))
      .catch((error) => setLoadError(error instanceof Error ? error.message : t("launch.err")));
    void getHarborProductionReadiness()
      .then(setHarborProductionState)
      .catch((error) => setLoadError(error instanceof Error ? error.message : t("launch.err")));
  }, [user?.id, id, t]);

  useEffect(() => {
    // An uncertain transport failure must reuse the same logical request. A
    // changed release identity intentionally starts a new request instead.
    storeRequestIds.current = { ios: crypto.randomUUID(), android: crypto.randomUUID() };
  }, [job?.id, appleTeam, bundleId, easProjectId]);

  if (isPending) {
    return (
      <div className="min-h-screen">
        <SiteHeader dense />
      </div>
    );
  }
  if (!user) return <RedirectToSignIn />;

  function notifyHarborState(state: string) {
    if (state === "active") {
      toast.success(t("launch.harborActive"));
    } else if (["failed", "action_required", "retry_exhausted"].includes(state)) {
      toast.error(t("launch.harborFailure", { status: state }));
    } else {
      toast.message(t("launch.harborPending", { status: state }));
    }
  }

  async function goWeb() {
    if (!job) return;
    setBusy("web");
    try {
      if (project?.buildLevel === "production") {
        const production = await publishProductionWeb({
          data: { projectId: id, jobId: job.id, requestId: crypto.randomUUID() },
        });
        setDeploys(await listDeploys({ data: id }));
        const next = await getProject({ data: id });
        setProject(next.project);
        setProfile(next.profile);
        notifyHarborState(production.state);
        return;
      }
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

  async function refreshHarbor(releaseId: string) {
    setRefreshingHarbor(releaseId);
    try {
      const result = await refreshProductionWebRelease({
        data: { projectId: id, releaseId },
      });
      setDeploys(await listDeploys({ data: id }));
      notifyHarborState(result.state);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("launch.err"));
    } finally {
      setRefreshingHarbor(null);
    }
  }

  async function resumeHarbor(releaseId: string) {
    setRefreshingHarbor(releaseId);
    const requestId =
      harborResumeRequestIds.current[releaseId] ??
      (harborResumeRequestIds.current[releaseId] = crypto.randomUUID());
    try {
      const result = await resumeProductionWebRelease({
        data: { projectId: id, releaseId, requestId },
      });
      delete harborResumeRequestIds.current[releaseId];
      setDeploys(await listDeploys({ data: id }));
      notifyHarborState(result.state);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("launch.err"));
    } finally {
      setRefreshingHarbor(null);
    }
  }

  async function goStore(target: "ios" | "android") {
    if (!job || !productionStoreCompatible) return;
    setBusy(target);
    try {
      const r = await shipStore({
        data: {
          projectId: id,
          jobId: job.id,
          target,
          appleTeam,
          bundleId,
          easProjectId,
          requestId: storeRequestIds.current[target],
          confirmSubmission: storeConfirmed[target],
        },
      });
      setDeploys(await listDeploys({ data: id }));
      const next = await getProject({ data: id });
      setProfile(next.profile);
      setStoreConfirmed((current) => ({ ...current, [target]: false }));
      storeRequestIds.current[target] = crypto.randomUUID();
      notifyStoreReleaseState(r.status, t("launch.storeAccepted", { status: r.status }));
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
          easProjectId,
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
      toast.success(
        target === "windows"
          ? t("launch.winOk")
          : target === "ios"
            ? t("launch.iosOk")
            : t("launch.andOk"),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("launch.err"));
    } finally {
      setBusy(null);
    }
  }

  async function refreshStore(releaseId: string) {
    setRefreshingStore(releaseId);
    try {
      const result = await refreshStoreSubmission({
        data: { projectId: id, releaseId },
      });
      setDeploys(await listDeploys({ data: id }));
      notifyStoreReleaseState(
        result.status,
        t("launch.storeRefreshed", { status: result.status }),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("launch.err"));
    } finally {
      setRefreshingStore(null);
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
  const gateReady = job?.queue?.status === "approved" || job?.queue?.status === "deployed";
  const productionWebUnavailable =
    project?.buildLevel === "production" && harborProductionState?.runnerConfigured !== true;
  const productionStoreRuntimeProfile = job?.production?.graph.requirements.runtimeProfile ?? null;
  const productionStoreCompatible =
    project?.buildLevel !== "production" || productionStoreRuntimeProfile === "static_site";
  const productionStoreBlocked =
    project?.buildLevel === "production" && productionStoreRuntimeProfile !== "static_site";
  const productionIosIdentityIncomplete =
    project?.buildLevel === "production" && (!appleTeam || !bundleId || !easProjectId);
  const productionAndroidIdentityIncomplete =
    project?.buildLevel === "production" && (!bundleId || !easProjectId);

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
                  {project.buildLevel === "production" ? t("desk.production") : t("desk.prototype")}
                </span>
              ) : null}
            </div>
            <p className="mt-2 max-w-xl text-sm text-muted">{t("launch.lead")}</p>
          </div>
          <Link
            to="/studio/$id"
            params={{ id }}
            className="text-sm text-muted underline-offset-4 hover:text-fg hover:underline"
          >
            {t("launch.back")}
          </Link>
        </div>
        <div className="mt-4">
          {loadError ? <p className="mb-3 text-sm text-danger">{loadError}</p> : null}
          {!gateReady ? (
            <div className="mb-4 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm">
              <p className="font-medium">{t("gate.releaseBlocked")}</p>
              <p className="mt-1 text-muted">{t("gate.releaseBlockedBody")}</p>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {ghUrl ? (
              <a
                href={ghUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-accent underline-offset-2 hover:underline"
              >
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
              {busy === "workspace" ? t("launch.shipping") : t("workspace.download")}
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
            <label className="mt-3 block text-xs text-subtle">
              {t("launch.easProjectId")}
              <input
                value={easProjectId}
                onChange={(e) => setEasProjectId(e.target.value)}
                placeholder="00000000-0000-4000-8000-000000000000"
                className="mt-1 w-full rounded-md bg-elevated px-3 py-2 text-sm text-fg outline-none shadow-[0_0_0_1px_rgb(255_255_255/0.08)]"
              />
            </label>
            <Button
              className="mt-3 w-full"
              variant="secondary"
              disabled={
                !!busy ||
                !project?.html ||
                !gateReady ||
                productionStoreBlocked ||
                productionIosIdentityIncomplete
              }
              onClick={() => void zip("ios")}
            >
              <Download className="size-4" />
              {busy === "zip-ios" ? t("launch.shipping") : t("launch.iosCta")}
            </Button>
            <p className="mt-3 text-xs text-subtle">
              {productionStoreBlocked
                ? t("launch.productionStoreUnsupported", {
                    runtimeProfile: productionStoreRuntimeProfile ?? "unknown",
                  })
                : storeReadinessState.ios?.runnerConfigured
                  ? t("launch.storeRunnerReady")
                  : t("launch.storeRunnerUnavailable")}
            </p>
            {project?.buildLevel === "production" && productionStoreCompatible ? (
              <p className="mt-2 text-xs text-subtle">{t("launch.productionStoreWrapper")}</p>
            ) : null}
            <label className="mt-3 flex items-start gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={storeConfirmed.ios}
                disabled={productionStoreBlocked}
                onChange={(event) =>
                  setStoreConfirmed((current) => ({ ...current, ios: event.target.checked }))
                }
                className="mt-0.5"
              />
              <span>{t("launch.storeConfirm", { credits: DEPLOY_COST.ios })}</span>
            </label>
            <Button
              className="mt-3 w-full"
              disabled={
                !!busy ||
                !project?.html ||
                !gateReady ||
                productionStoreBlocked ||
                !storeReadinessState.ios?.runnerConfigured ||
                !appleTeam ||
                !bundleId ||
                !easProjectId ||
                !storeConfirmed.ios
              }
              onClick={() => void goStore("ios")}
            >
              {busy === "ios" ? t("launch.shipping") : t("launch.iosSubmitCta")}
            </Button>
          </article>

          <article className="rounded-2xl bg-surface p-5 shadow-[0_0_0_1px_rgb(255_255_255/0.06)]">
            <PlayStoreMark className="h-10 w-[135px]" />
            <h2 className="mt-3 text-lg">{t("launch.and")}</h2>
            <p className="mt-1 text-sm text-muted">{t("launch.andBody")}</p>
            <label className="mt-4 block text-xs text-subtle">
              Package name
              <input
                value={bundleId}
                onChange={(e) => setBundleId(e.target.value)}
                className="mt-1 w-full rounded-md bg-elevated px-3 py-2 text-sm text-fg outline-none shadow-[0_0_0_1px_rgb(255_255_255/0.08)]"
              />
            </label>
            <label className="mt-3 block text-xs text-subtle">
              {t("launch.easProjectId")}
              <input
                value={easProjectId}
                onChange={(e) => setEasProjectId(e.target.value)}
                placeholder="00000000-0000-4000-8000-000000000000"
                className="mt-1 w-full rounded-md bg-elevated px-3 py-2 text-sm text-fg outline-none shadow-[0_0_0_1px_rgb(255_255_255/0.08)]"
              />
            </label>
            <Button
              className="mt-3 w-full"
              variant="secondary"
              disabled={
                !!busy ||
                !project?.html ||
                !gateReady ||
                productionStoreBlocked ||
                productionAndroidIdentityIncomplete
              }
              onClick={() => void zip("android")}
            >
              <Download className="size-4" />
              {busy === "zip-android" ? t("launch.shipping") : t("launch.andCta")}
            </Button>
            <p className="mt-3 text-xs text-subtle">
              {productionStoreBlocked
                ? t("launch.productionStoreUnsupported", {
                    runtimeProfile: productionStoreRuntimeProfile ?? "unknown",
                  })
                : storeReadinessState.android?.runnerConfigured
                  ? t("launch.storeRunnerReady")
                  : t("launch.storeRunnerUnavailable")}
            </p>
            {project?.buildLevel === "production" && productionStoreCompatible ? (
              <p className="mt-2 text-xs text-subtle">{t("launch.productionStoreWrapper")}</p>
            ) : null}
            <p className="mt-2 text-xs text-subtle">{t("launch.androidPlayReleaseEvidence")}</p>
            <label className="mt-3 flex items-start gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={storeConfirmed.android}
                disabled={productionStoreBlocked}
                onChange={(event) =>
                  setStoreConfirmed((current) => ({ ...current, android: event.target.checked }))
                }
                className="mt-0.5"
              />
              <span>{t("launch.storeConfirm", { credits: DEPLOY_COST.android })}</span>
            </label>
            <Button
              className="mt-3 w-full"
              disabled={
                !!busy ||
                !project?.html ||
                !gateReady ||
                productionStoreBlocked ||
                !storeReadinessState.android?.runnerConfigured ||
                !bundleId ||
                !easProjectId ||
                !storeConfirmed.android
              }
              onClick={() => void goStore("android")}
            >
              {busy === "android" ? t("launch.shipping") : t("launch.andSubmitCta")}
            </Button>
          </article>

          <article className="rounded-2xl bg-surface p-5 shadow-[0_0_0_1px_rgb(255_255_255/0.06)]">
            <Globe className="size-5 text-accent" />
            <h2 className="mt-3 text-lg">{t("launch.web")}</h2>
            <p className="mt-1 text-sm text-muted">
              {project?.buildLevel === "production"
                ? productionWebUnavailable
                  ? t("launch.harborRunnerUnavailable")
                  : t("launch.harborProductionReady")
                : t("launch.webBody")}
            </p>
            <p className="mt-4 text-xs text-subtle">{DEPLOY_COST.web} cr</p>
            <Button
              className="mt-4 w-full"
              disabled={!!busy || !project?.html || !gateReady || productionWebUnavailable}
              onClick={() => void goWeb()}
            >
              <Wifi className="size-4" />
              {busy === "web" ? t("launch.shipping") : t("launch.webCta")}
            </Button>
            {web ? (
              <a
                href={web.url}
                className="mt-3 block truncate text-sm text-accent underline-offset-2 hover:underline"
              >
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
              <Button
                className="mt-4 w-full"
                disabled={!!busy || !project?.html || !gateReady}
                onClick={() => void zip("windows")}
              >
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
            <a
              href={web.testersUrl}
              className="mt-2 inline-block text-accent underline-offset-2 hover:underline"
            >
              {web.testersUrl}
            </a>
          </div>
        ) : null}

        {deploys.length ? (
          <div className="mt-10">
            <p className="text-xs tracking-[0.16em] text-subtle uppercase">{t("launch.harbor")}</p>
            <ul className="mt-3 space-y-3">
              {deploys.map((d) => (
                <li
                  key={d.id}
                  className="rounded-xl bg-surface px-4 py-3 shadow-[0_0_0_1px_rgb(255_255_255/0.06)]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm">
                      {d.target === "web"
                        ? "Web"
                        : d.target === "ios"
                          ? t("launch.iosRelease")
                          : d.target === "windows"
                            ? "Windows"
                            : t("launch.androidRelease")}{" "}
                      · {d.status}
                    </p>
                    {d.url ? (
                      <a
                        href={d.url}
                        className="text-xs text-accent underline-offset-2 hover:underline"
                      >
                        {d.url}
                      </a>
                    ) : null}
                    {d.store_release_id &&
                    !["distributed", "failed", "action_required"].includes(d.status) ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={refreshingStore === d.store_release_id}
                        onClick={() => void refreshStore(d.store_release_id as string)}
                      >
                        {refreshingStore === d.store_release_id
                          ? t("launch.shipping")
                          : t("launch.storeRefresh")}
                      </Button>
                    ) : null}
                    {d.harbor_release_id &&
                    !["active", "failed", "action_required", "retry_exhausted"].includes(
                      d.harbor_release_state ?? "",
                    ) ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={refreshingHarbor === d.harbor_release_id}
                        onClick={() => void refreshHarbor(d.harbor_release_id as string)}
                      >
                        {refreshingHarbor === d.harbor_release_id
                          ? t("launch.shipping")
                          : t("launch.harborRefresh")}
                      </Button>
                    ) : null}
                    {d.harbor_release_id &&
                    ["failed", "action_required"].includes(d.harbor_release_state ?? "") ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={refreshingHarbor === d.harbor_release_id}
                        onClick={() => void resumeHarbor(d.harbor_release_id as string)}
                      >
                        {refreshingHarbor === d.harbor_release_id
                          ? t("launch.shipping")
                          : t("launch.harborResume")}
                      </Button>
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

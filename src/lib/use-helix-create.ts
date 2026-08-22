import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { authClient, authEnabled, previewPasswordSignInEnabled } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  buildLoginSearch,
  decideBuildEntry,
  preservePendingBuildPrompt,
  takePendingBuildPrompt,
} from "@/lib/build-entry";
import { createProject } from "@/lib/server/vetra";
import { startGuestBuild } from "@/lib/server/agents";
import { saveGuestBuildAccess } from "@/lib/guest-build-access";
import { useI18n } from "@/lib/i18n";
import { toast } from "sonner";
import { track } from "@/lib/analytics";
import type { BuildLevel } from "@/lib/build-level";

export function useHelixCreate(routePrompt?: string) {
  const { user, isPending } = useCurrentUserState();
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState(routePrompt ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isPending || typeof window === "undefined") return;
    try {
      const resumedPrompt = takePendingBuildPrompt(window.sessionStorage, routePrompt);
      if (resumedPrompt) setPrompt(resumedPrompt);
    } catch {
      if (routePrompt) setPrompt(routePrompt);
    }
  }, [isPending, routePrompt]);

  async function build(
    text = prompt,
    gear: "auto" | "house" | "fast" = "auto",
    max = false,
    buildLevel: BuildLevel = "prototype",
  ) {
    const value = text.trim();
    if (!value) return;
    let entry = decideBuildEntry({
      authEnabled,
      previewPasswordSignInEnabled,
      isPending,
      userPresent: Boolean(user),
    });
    if (entry === "wait_for_session") {
      setBusy(true);
      setPrompt(value);
      const resolved = await authClient.getSession().catch(() => null);
      entry = decideBuildEntry({
        authEnabled,
        previewPasswordSignInEnabled,
        isPending: false,
        userPresent: Boolean(resolved?.data?.user),
      });
    }
    if (entry === "login") {
      if (typeof window !== "undefined") {
        try {
          preservePendingBuildPrompt(window.sessionStorage, value);
        } catch {
          // The login URL still carries the prompt when storage is unavailable.
        }
      }
      void navigate({
        to: "/login",
        search: buildLoginSearch(value),
      });
      setBusy(false);
      return;
    }
    setBusy(true);
    track("first_prompt");
    toast.message(t("think.started"));
    try {
      if (entry === "authenticated") {
        const { id } = await createProject({
          data: {
            prompt: value,
            locale,
            gear,
            max,
            buildLevel,
            requestId: crypto.randomUUID(),
          },
        });
        track("project_created");
        void navigate({ to: "/studio/$id", params: { id } });
      } else {
        const { jobId, guestAccessToken, expiresAt } = await startGuestBuild({
          data: { prompt: value, locale, mode: "generate", buildLevel, gear, max },
        });
        saveGuestBuildAccess(jobId, guestAccessToken, expiresAt);
        void navigate({ to: "/try", search: { job: jobId } });
      }
    } catch (err) {
      track("generate_error");
      toast.error(err instanceof Error ? err.message : t("err.build"));
    } finally {
      setBusy(false);
    }
  }

  return { prompt, setPrompt, busy, build, user };
}

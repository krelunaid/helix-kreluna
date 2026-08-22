import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AuthenticatedHome, AuthenticatedHomePending } from "@/components/authenticated-home";
import { HomeSignIn } from "@/components/home-sign-in";
import { getHomeSession } from "@/lib/auth/home-session";
import { HOME_DOCUMENT_HEADERS, resolveHomeUser } from "@/lib/home-surface";
import { useCurrentUserState, type AppUser } from "@/lib/auth/use-current-user";
import { useHelixCreate } from "@/lib/use-helix-create";
import { track } from "@/lib/analytics";

type HomeSearch = { prompt?: string };

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): HomeSearch => ({
    prompt:
      typeof search.prompt === "string"
        ? search.prompt.trim().slice(0, 2_000) || undefined
        : undefined,
  }),
  loader: () => getHomeSession(),
  headers: () => HOME_DOCUMENT_HEADERS,
  pendingMs: 0,
  pendingComponent: AuthenticatedHomePending,
  component: Home,
});

function Home() {
  const { user } = useCurrentUserState();
  const loaderUser = Route.useLoaderData();
  const homeUser = resolveHomeUser(user, loaderUser);
  const { prompt: routePrompt } = Route.useSearch();

  useEffect(() => {
    track("home_view");
  }, []);

  if (homeUser) {
    return <SignedInHome key={homeUser.id} user={homeUser} routePrompt={routePrompt} />;
  }

  return <HomeSignIn prompt={routePrompt} />;
}

function SignedInHome({ user, routePrompt }: { user: AppUser; routePrompt?: string }) {
  const { prompt, setPrompt, busy, build } = useHelixCreate(routePrompt);
  return (
    <AuthenticatedHome
      user={user}
      prompt={prompt}
      onPromptChange={setPrompt}
      busy={busy}
      onSubmit={({ prompt: nextPrompt, gear, max, buildLevel }) =>
        void build(nextPrompt, gear, max, buildLevel)
      }
    />
  );
}

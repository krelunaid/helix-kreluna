import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { SiteHeader } from "@/components/site-header";
import { SignInPanel } from "@/components/sign-in-panel";
import { authClient } from "@/lib/auth/client";
import { buildPromptDestination } from "@/lib/build-entry";

/** /login is sign-in only. Email uses authClient.signIn.email — no HTTP sign-up. */
type _LoginEmailSignIn = typeof authClient.signIn.email;

type Search = { next?: string; prompt?: string };

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    next: typeof s.next === "string" ? s.next : "/",
    prompt: typeof s.prompt === "string" ? s.prompt : undefined,
  }),
  component: Login,
});

function Login() {
  const { next, prompt } = Route.useSearch();
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const destPath = buildPromptDestination(next, prompt);

  useEffect(() => {
    if (!isPending && user) {
      void navigate({ to: destPath });
    }
  }, [isPending, user, destPath, navigate]);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto grid min-h-[70vh] w-full max-w-md place-items-center px-5 pb-16">
        <SignInPanel next={next} prompt={prompt} />
      </main>
    </div>
  );
}

import { SiteHeader } from "@/components/site-header";
import { SignInPanel } from "@/components/sign-in-panel";

/** Compact Accedi chrome for signed-out `/` — not the marketing landing. */
export function HomeSignIn({ prompt }: { prompt?: string }) {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto grid min-h-[70vh] w-full max-w-md place-items-center px-5 pb-16">
        <SignInPanel next="/" prompt={prompt} />
      </main>
    </div>
  );
}

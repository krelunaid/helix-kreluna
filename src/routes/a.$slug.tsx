import { createFileRoute, Link } from "@tanstack/react-router";
import { getPublicApp } from "@/lib/server/deploy";

export const Route = createFileRoute("/a/$slug")({
  loader: async ({ params }) => getPublicApp({ data: params.slug }),
  component: PublicApp,
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData?.title ?? "Helix" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "theme-color", content: "#0a0a0b" },
      { name: "robots", content: "index, follow" },
    ],
  }),
});

function PublicApp() {
  const app = Route.useLoaderData();

  if (!app) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#07080c] text-sm text-[#9bb0b8]">
        This app is offline.
      </div>
    );
  }

  return (
    <div className="relative h-[100dvh] bg-[#07080c]">
      <iframe
        title={app.title}
        srcDoc={app.html}
        sandbox="allow-scripts allow-forms allow-modals allow-popups"
        className="h-full w-full border-0"
      />
      <Link
        to="/vetrina"
        className="absolute bottom-3 right-3 z-10 rounded-full bg-black/70 px-3 py-1.5 text-[11px] tracking-[0.14em] text-white/80 uppercase backdrop-blur-sm hover:text-white"
      >
        Helix
      </Link>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { getPublicApp } from "@/lib/server/deploy";

export const Route = createFileRoute("/a/$slug")({
  loader: async ({ params }) => getPublicApp({ data: params.slug }),
  component: PublicApp,
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData?.title ?? "Kreluna" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "theme-color", content: "#10202a" },
    ],
  }),
});

function PublicApp() {
  const app = Route.useLoaderData();

  if (!app) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#071018] text-sm text-[#9bb0b8]">
        This app is offline.
      </div>
    );
  }

  return (
    <iframe
      title={app.title}
      srcDoc={app.html}
      sandbox="allow-scripts allow-forms allow-modals allow-popups"
      className="h-[100dvh] w-full border-0 bg-[#10202a]"
    />
  );
}

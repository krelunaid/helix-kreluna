import { createFileRoute } from "@tanstack/react-router";
import { PublicLanding } from "@/components/public-landing";

export const Route = createFileRoute("/scopri")({
  validateSearch: (search: Record<string, unknown>) => ({
    prompt:
      typeof search.prompt === "string"
        ? search.prompt.trim().slice(0, 2_000) || undefined
        : undefined,
  }),
  component: Scopri,
});

function Scopri() {
  const { prompt } = Route.useSearch();
  return <PublicLanding prompt={prompt} />;
}

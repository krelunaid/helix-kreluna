import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/prezzi")({ component: Prezzi });

function Prezzi() {
  return <Navigate to="/pricing" replace />;
}

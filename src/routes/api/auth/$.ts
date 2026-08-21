import { createFileRoute } from "@tanstack/react-router";
import { handlePreviewPasswordAuthRequest } from "@/lib/auth/preview-origin.server";
import { auth } from "@/lib/auth/server";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => handlePreviewPasswordAuthRequest(request, auth.handler),
      POST: ({ request }) => handlePreviewPasswordAuthRequest(request, auth.handler),
    },
  },
});

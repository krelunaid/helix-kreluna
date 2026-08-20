import { createMiddleware } from "@tanstack/react-start";

type HttpStatusError = Error & {
  status: number;
  retryAfterSeconds?: number;
};

function isHttpStatusError(error: unknown): error is HttpStatusError {
  if (!(error instanceof Error) || !("status" in error)) return false;
  const status = (error as { status?: unknown }).status;
  return Number.isInteger(status) && Number(status) >= 400 && Number(status) <= 599;
}

/**
 * TanStack Start serializes server-function errors as RPC values. Without
 * setting the request response explicitly, even Unauthorized/Forbidden/rate
 * limit errors leave the transport with HTTP 200. Keep the serialized Error
 * contract for existing clients while making the HTTP status truthful.
 */
export const httpErrorStatusMiddleware = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    try {
      return await next();
    } catch (error) {
      if (isHttpStatusError(error)) {
        const { setResponseStatus } = await import("@tanstack/react-start/server");
        setResponseStatus(error.status);
      }
      throw error;
    }
  },
);

import { createHash } from "node:crypto";
import { z } from "zod";

export const OperationalMetricUnitSchema = z.enum([
  "errors_per_minute",
  "ratio",
  "milliseconds_p95",
  "count_high_or_critical",
  "healthy_ratio",
  "usd_month_to_date",
  "usd_monthly_forecast",
]);

export type OperationalMetricUnit = z.infer<typeof OperationalMetricUnitSchema>;

export const OperationalSourceIdSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/ -]{0,159}$/);

export const MeasuredOperationalMetricSchema = z
  .object({
    status: z.literal("measured"),
    source: OperationalSourceIdSchema,
    observedAt: z.string().datetime(),
    value: z.number().finite().nonnegative(),
    unit: OperationalMetricUnitSchema,
    sampleCount: z.number().int().positive(),
  })
  .strict();

export const UnavailableOperationalMetricSchema = z
  .object({
    status: z.literal("unavailable"),
    attemptedAt: z.string().datetime(),
    source: OperationalSourceIdSchema,
    reasonCode: z.string().regex(/^[A-Z][A-Z0-9_]{2,127}$/),
    detailRedacted: z.string().trim().min(1).max(500),
  })
  .strict();

export const OperationalMetricSchema = z.discriminatedUnion("status", [
  MeasuredOperationalMetricSchema,
  UnavailableOperationalMetricSchema,
]);

export type OperationalMetric = z.infer<typeof OperationalMetricSchema>;

export function metricSchemaFor<const TUnit extends OperationalMetricUnit>(unit: TUnit) {
  const value =
    unit === "ratio" || unit === "healthy_ratio"
      ? z.number().finite().min(0).max(1)
      : z.number().finite().nonnegative();
  return z.discriminatedUnion("status", [
    MeasuredOperationalMetricSchema.extend({ unit: z.literal(unit), value }),
    UnavailableOperationalMetricSchema,
  ]);
}

export function redactOperationalDetail(value: unknown): string {
  const detail = value instanceof Error ? value.message : String(value);
  return (
    detail
      .replace(/\bBearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [REDACTED]")
      .replace(/\b(?:gh[oprsu]|github_pat)_[A-Za-z0-9_]{12,}\b/gi, "[REDACTED_TOKEN]")
      .replace(/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9_-]{12,}\b/gi, "[REDACTED_TOKEN]")
      .replace(/\b(password|token|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
      .replace(/https?:\/\/[^\s?#]+\?[^\s#]*/gi, (url) =>
        `${url.split("?", 1)[0]}?[REDACTED_QUERY]`,
      )
      .trim()
      .slice(0, 500) || "Operational source failed without a safe detail."
  );
}

export function sha256Json(value: unknown): string {
  const canonicalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(canonicalize);
    if (!input || typeof input !== "object") return input;
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  };

  // The operations modules run in Node and Netlify's Node runtime. This helper avoids
  // accepting caller-provided identifiers as evidence hashes.
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

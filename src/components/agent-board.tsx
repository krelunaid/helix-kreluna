import { useState } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import type { AgentStep } from "@/lib/agent-types";

const DESK_LABEL: Record<string, string> = {
  ops: "Ops",
  product: "Product",
  eng: "Engineering",
  quality: "Quality",
  growth: "Growth",
};

export function AgentBoard({
  steps,
  status,
}: {
  steps: AgentStep[];
  status?: "running" | "ready" | "error";
}) {
  const { t } = useI18n();
  const [openHouse, setOpenHouse] = useState(false);
  const live = steps.filter((s) => s.status !== "standby");
  const bench = steps.filter((s) => s.status === "standby");

  if (!steps.length) return null;
  return (
    <div className="space-y-3">
      <p className="text-[11px] tracking-[0.16em] text-subtle uppercase">{t("agent.crew")}</p>
      <ol className="space-y-2">
        {live.map((step) => (
          <li
            key={step.id}
            className={cn(
              "rounded-lg px-3 py-2",
              step.status === "running" && "bg-accent/10 shadow-[inset_0_0_0_1px_rgb(124_58_237/0.45)]",
              step.status === "done" && "bg-elevated/60",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm text-fg">
                  {step.agent}
                  <span className="ml-2 text-xs text-muted">{step.role}</span>
                </p>
                {step.detail ? <p className="mt-0.5 truncate text-xs text-subtle">{step.detail}</p> : null}
              </div>
              <span
                className={cn(
                  "shrink-0 text-[10px] tracking-wide uppercase",
                  step.status === "running" && "text-accent shimmer",
                  step.status === "done" && "text-fg",
                  step.status === "queued" && "text-subtle",
                  step.status === "skipped" && "text-subtle",
                  step.status === "error" && "text-danger",
                )}
              >
                {t(
                  step.status === "running"
                    ? "agent.running"
                    : step.status === "done"
                      ? "agent.done"
                      : step.status === "skipped"
                        ? "agent.skipped"
                        : step.status === "error"
                          ? "agent.error"
                          : "agent.queued",
                )}
              </span>
            </div>
          </li>
        ))}
      </ol>
      {status === "running" ? <p className="text-xs text-muted">{t("agent.working")}</p> : null}
      {bench.length ? (
        <div>
          <button
            type="button"
            className="text-[11px] tracking-wide text-subtle uppercase hover:text-fg"
            onClick={() => setOpenHouse((v) => !v)}
          >
            {t("house.bench", { n: bench.length })} {openHouse ? "–" : "+"}
          </button>
          {openHouse ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {bench.map((s) => (
                <span key={s.id} className="rounded-full bg-elevated px-2 py-0.5 text-[11px] text-muted">
                  {s.agent}
                  <span className="ml-1 text-subtle">{DESK_LABEL[s.desk ?? ""] ?? s.role}</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

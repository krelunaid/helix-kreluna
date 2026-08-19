import { DESKS, HOUSE_BY_ID } from "@/lib/house";
import type { AgentStep } from "@/lib/agent-types";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useState } from "react";

const DESK_KEY: Record<string, "house.desk.ops" | "house.desk.product" | "house.desk.eng" | "house.desk.quality" | "house.desk.growth"> = {
  ops: "house.desk.ops",
  product: "house.desk.product",
  eng: "house.desk.eng",
  quality: "house.desk.quality",
  growth: "house.desk.growth",
};

export function ControlCenter({
  steps,
  status,
}: {
  steps: AgentStep[];
  status?: "running" | "ready" | "error";
}) {
  const { t, locale } = useI18n();
  const [openHouse, setOpenHouse] = useState(false);
  const live = steps.filter((s) => s.status !== "standby" && HOUSE_BY_ID[s.id]?.role !== "—");
  const bench = steps.filter((s) => s.status === "standby" && HOUSE_BY_ID[s.id]?.role !== "—");
  const running = live.find((s) => s.status === "running");
  const gemini = steps.find((s) => s.id === "gemini");

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] tracking-[0.16em] text-subtle uppercase">{t("house.floor")}</p>
        <p className="truncate text-xs text-muted">
          {status === "running"
            ? running
              ? `${running.agent} · ${HOUSE_BY_ID[running.id]?.[locale === "it" ? "craftIt" : "craft"] ?? running.role}`
              : gemini?.detail || t("gemini.directs")
            : t("agent.ready")}
        </p>
      </div>
      {running ? (
        <p className="mt-2 text-sm text-fg">
          <span className="text-accent">{t("house.now")}:</span> {running.agent} ·{" "}
          {locale === "it" ? HOUSE_BY_ID[running.id]?.roleIt : HOUSE_BY_ID[running.id]?.role} ·{" "}
          {running.detail || (locale === "it" ? HOUSE_BY_ID[running.id]?.briefIt : HOUSE_BY_ID[running.id]?.brief)}
        </p>
      ) : null}
      <div className="mt-3 space-y-3">
        {DESKS.map((desk) => {
          const group = live.filter((s) => s.desk === desk);
          if (!group.length) return null;
          return (
            <div key={desk}>
              <p className="text-[10px] tracking-[0.16em] text-subtle uppercase">{t(DESK_KEY[desk])}</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {group.map((s) => {
                  const a = HOUSE_BY_ID[s.id];
                  const craft = locale === "it" ? a?.craftIt : a?.craft;
                  return (
                    <span
                      key={s.id}
                      title={`${s.agent} — ${a ? (locale === "it" ? a.briefIt : a.brief) : s.role}`}
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px]",
                        s.status === "running" && "bg-accent/20 text-accent",
                        s.status === "done" && "bg-elevated text-fg",
                        s.status === "queued" && "bg-elevated/50 text-subtle",
                        s.status === "error" && "bg-danger/20 text-danger",
                        s.status === "skipped" && "text-subtle",
                      )}
                    >
                      {s.agent}
                      <span className="ml-1 opacity-70">{craft || s.role}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {status === "running" ? <p className="mt-2 text-xs text-muted">{t("agent.working")}</p> : null}
      {bench.length ? (
        <div className="mt-3">
          <button
            type="button"
            className="text-[11px] tracking-wide text-subtle uppercase hover:text-fg"
            onClick={() => setOpenHouse((v) => !v)}
          >
            {t("house.bench", { n: bench.length })} {openHouse ? "–" : "+"}
          </button>
          {openHouse ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {bench.map((s) => {
                const a = HOUSE_BY_ID[s.id];
                return (
                  <span key={s.id} className="rounded-full bg-elevated px-2 py-0.5 text-[11px] text-muted">
                    {s.agent}
                    <span className="ml-1 text-subtle">{locale === "it" ? a?.craftIt : a?.craft}</span>
                  </span>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import type { Thought } from "@/lib/agent-types";
import { craftOf, roleOf } from "@/lib/house";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { WorkOrb } from "@/components/helix-orb";

export function ThoughtStream({
  thoughts,
  running,
  agent,
}: {
  thoughts?: Thought[];
  running?: boolean;
  agent?: string;
}) {
  const { t, locale } = useI18n();
  const end = useRef<HTMLDivElement>(null);
  const list = thoughts ?? [];
  const now = list[list.length - 1];
  const [sec, setSec] = useState(0);
  const who = agent || now?.agent || "Helix";
  const craft = now?.craft || craftOf(who, locale);
  const role = now?.role || roleOf(who, locale);

  useEffect(() => {
    if (!running) {
      setSec(0);
      return;
    }
    const t0 = Date.now();
    const id = setInterval(() => setSec(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [running, now?.at]);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [list.length, now?.text]);

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] tracking-[0.2em] text-subtle uppercase">{t("think.kicker")}</p>
        {running ? (
          <span className="text-[11px] tabular-nums text-accent shimmer">
            {who} · {sec}s
          </span>
        ) : null}
      </div>
      {running ? (
        <div className="mt-4 rounded-xl bg-elevated px-4 py-3 hairline">
          <p className="text-[11px] tracking-[0.16em] text-accent uppercase">{t("think.live")}</p>
          <p className="mt-1 font-display text-lg italic">
            {who}
            <span className="ml-1 animate-pulse">▍</span>
          </p>
          <p className="text-xs text-accent-soft">
            {role}
            {craft ? ` · ${craft}` : ""}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted">{now?.text || t("think.starting")}</p>
        </div>
      ) : null}
      <ol className="mt-4 space-y-5 border-l border-border pl-4">
        {list.length === 0 ? (
          <li className="font-display text-lg italic text-muted">
            {running ? t("think.starting") : t("think.empty")}
          </li>
        ) : (
          list.map((th, i) => (
            <li
              key={`${th.at}-${i}`}
              className={cn("relative", i === list.length - 1 && running ? "text-fg" : "text-muted")}
            >
              <span className="absolute -left-[21px] top-1.5 size-1.5 rounded-full bg-accent" />
              <span className="font-display italic text-accent-soft">{th.agent}</span>
              <span className="ml-2 text-[11px] text-subtle">
                {th.role || roleOf(th.agent, locale)}
                {th.craft || craftOf(th.agent, locale) ? ` · ${th.craft || craftOf(th.agent, locale)}` : ""}
              </span>
              <p className="mt-1 text-sm leading-relaxed">{th.text}</p>
            </li>
          ))
        )}
        <div ref={end} />
      </ol>
    </div>
  );
}

export function WorkingBanner({
  running,
  line,
  beat,
}: {
  running: boolean;
  line?: string;
  beat?: number | null;
}) {
  const { t } = useI18n();
  const [sec, setSec] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) {
      setSec(0);
      return;
    }
    const t0 = Date.now();
    const id = setInterval(() => {
      setSec(Math.round((Date.now() - t0) / 1000));
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, [running, line]);
  if (!running) return null;
  const lag = beat ? now - beat : 0;
  const calling = /al lavoro|segnale vivo|working|live signal|in chiamata/i.test(line || "");
  const answered = /ha consegnato|delivered|ha risposto|Modello ha scritto/i.test(line || "");
  const live = calling && (beat ? lag < 12000 : true);
  const stale = !answered && ((beat && lag > 14000) || (!beat && sec > 40 && !calling));
  return (
    <div className="flex items-center gap-3 border-b border-accent/30 bg-accent/10 px-5 py-2.5">
      <WorkOrb className="size-9 shrink-0" live={!stale} />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] tracking-[0.2em] text-accent uppercase">
          {t("think.banner")} · {sec}s
        </p>
        <p className="mt-0.5 truncate font-display text-base italic text-fg">{line || t("think.starting")}</p>
        {live ? (
          <p className="mt-0.5 text-[11px] font-medium text-ok">{t("think.alive")}</p>
        ) : null}
        {stale ? (
          <p className="mt-0.5 text-[11px] font-medium text-danger">
            {t("think.stale", { n: String(Math.round((lag || sec * 1000) / 1000)) })}
          </p>
        ) : null}
      </div>
    </div>
  );
}

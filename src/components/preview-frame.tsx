import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import {
  GENERATED_APP_SANDBOX,
  protectGeneratedHtml,
} from "@/lib/generated-content-policy";

const EMPTY = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:#070914;color:#aab3c5;font-family:Sora,system-ui,sans-serif}
body{display:grid;place-items:center;padding:24px;text-align:center}
p{font-style:italic}
</style></head><body><p>…</p></body></html>`;

export function PreviewFrame({
  html,
  className,
  label = "live",
  compact = false,
  locked = false,
  deviceLock,
}: {
  html: string | null | undefined;
  className?: string;
  label?: string;
  compact?: boolean;
  locked?: boolean;
  deviceLock?: "phone" | "tablet" | "desk";
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"live" | "code">("live");
  const [device, setDevice] = useState<"phone" | "tablet" | "desk">(deviceLock ?? "desk");
  const [on, setOn] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    setOn(true);
  }, []);

  useEffect(() => {
    const node = frameRef.current;
    if (!node || !on) return;
    let doc = html && html.length > 40 ? html : EMPTY;
    if (typeof window !== "undefined") {
      const origin = window.location.origin;
      doc = doc.replaceAll('src="/templates/', `src="${origin}/templates/`);
      doc = doc.replaceAll('href="/templates/', `href="${origin}/templates/`);
    }
    node.srcdoc = protectGeneratedHtml(doc, { noIndex: true });
  }, [html, on, tab]);

  const pretty = useMemo(() => {
    if (!html) return "";
    return html.length > 16000 ? `${html.slice(0, 16000)}\n…` : html;
  }, [html]);

  return (
    <div
      className={cn(
        "relative flex min-h-0 flex-col overflow-hidden rounded-xl bg-surface",
        compact ? "shadow-[0_0_0_1px_rgb(255_255_255/0.08)]" : "window-shadow",
        className,
      )}
    >
      <div
        className={cn(
          "flex shrink-0 items-center gap-3 border-b border-border bg-elevated/80 px-3",
          compact ? "h-8" : "h-11",
        )}
      >
        <div className="flex gap-1.5" aria-hidden>
          <span className="size-2 rounded-full bg-danger/80" />
          <span className="size-2 rounded-full bg-accent-soft/80" />
          <span className="size-2 rounded-full bg-ok/80" />
        </div>
        <p className="min-w-0 flex-1 truncate font-display text-sm italic text-muted">
          {label === "live" ? t("preview.live") : label}
        </p>
        {compact ? null : (
          <>
            <div className="flex rounded-full bg-bg/60 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setTab("live")}
                className={cn("rounded-full px-2.5 py-1", tab === "live" ? "bg-surface text-fg" : "text-muted")}
              >
                {t("preview.live")}
              </button>
              <button
                type="button"
                onClick={() => setTab("code")}
                className={cn("rounded-full px-2.5 py-1", tab === "code" ? "bg-surface text-fg" : "text-muted")}
              >
                {t("preview.code")}
              </button>
            </div>
            {tab === "live" && !deviceLock ? (
              <div className="hidden rounded-full bg-bg/60 p-0.5 text-[10px] sm:flex">
                {(["phone", "tablet", "desk"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDevice(d)}
                    className={cn("rounded-full px-2 py-1", device === d ? "bg-surface text-fg" : "text-muted")}
                  >
                    {d === "phone" ? "390" : d === "tablet" ? "768" : "Desk"}
                  </button>
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
      {tab === "live" ? (
        <div
          className={cn(
            "relative min-h-[280px] flex-1 bg-bg",
            device !== "desk" && "flex justify-center py-3",
          )}
        >
          {on ? (
            <iframe
              ref={frameRef}
              title="preview"
              sandbox={GENERATED_APP_SANDBOX}
              referrerPolicy="no-referrer"
              allow=""
              className={cn(
                "border-0 bg-surface",
                device === "desk" && "absolute inset-0 h-full w-full",
                device === "phone" && "h-full w-[min(390px,100%)] rounded-lg shadow-[0_0_0_1px_rgb(255_255_255/0.08)]",
                device === "tablet" && "h-full w-[min(768px,100%)] rounded-lg shadow-[0_0_0_1px_rgb(255_255_255/0.08)]",
              )}
            />
          ) : (
            <div className="grid h-full min-h-[280px] place-items-center font-display italic text-muted">
              …
            </div>
          )}
          {locked ? <div className="absolute inset-0" /> : null}
        </div>
      ) : (
        <pre className="min-h-[280px] flex-1 overflow-auto p-4 font-mono text-[11px] leading-relaxed text-muted">
          {pretty || t("preview.nocode")}
        </pre>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import {
  GENERATED_APP_SANDBOX,
  protectGeneratedHtml,
} from "@/lib/generated-content-policy";
import { cn } from "@/lib/utils";

export function ProjectCard({
  title,
  kind,
  meta,
  html,
  cover,
  previewTitle,
  className,
}: {
  title: string;
  kind: string;
  meta?: string;
  html?: string | null;
  cover?: string;
  previewTitle?: string;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "overflow-hidden rounded-xl bg-surface text-left hairline transition-shadow duration-200 hover:window-shadow",
        className,
      )}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-elevated">
        {cover ? (
          <img
            src={cover}
            alt={title}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <MiniShot html={html} title={previewTitle ?? title} />
        )}
        <span className="absolute left-3 top-3 rounded-full bg-bg/80 px-2.5 py-1 text-[11px] tracking-[0.14em] text-fg uppercase backdrop-blur-sm">
          {kind}
        </span>
      </div>
      <div className="p-4">
        <h3 className="font-display text-2xl italic leading-tight">{title}</h3>
        {meta ? <p className="mt-2 line-clamp-2 text-sm leading-snug text-muted">{meta}</p> : null}
      </div>
    </article>
  );
}

function MiniShot({ html, title }: { html?: string | null; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => setOn(true), []);
  useEffect(() => {
    if (!ref.current || !on || !html) return;
    ref.current.srcdoc = protectGeneratedHtml(html, { noIndex: true });
  }, [html, on]);
  if (!html) return <div className="h-full bg-elevated" />;
  return on ? (
    <iframe
      ref={ref}
      title={title}
      tabIndex={-1}
      loading="lazy"
      sandbox={GENERATED_APP_SANDBOX}
      referrerPolicy="no-referrer"
      className="pointer-events-none absolute left-0 top-0 h-[250%] w-[250%] origin-top-left scale-[0.4] border-0"
    />
  ) : (
    <div className="h-full bg-elevated" />
  );
}

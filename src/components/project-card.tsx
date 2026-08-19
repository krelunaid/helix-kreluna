import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function ProjectCard({
  title,
  kind,
  meta,
  html,
  cover,
  className,
}: {
  title: string;
  kind: string;
  meta?: string;
  html?: string | null;
  cover?: string;
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
          <img src={cover} alt="" className="h-full w-full object-cover" />
        ) : (
          <MiniShot html={html} />
        )}
        <span className="absolute left-3 top-3 rounded-full bg-bg/80 px-2.5 py-1 text-[11px] tracking-[0.14em] text-fg uppercase backdrop-blur-sm">
          {kind}
        </span>
      </div>
      <div className="p-4">
        <p className="truncate font-display text-2xl italic leading-none">{title}</p>
        {meta ? <p className="mt-2 line-clamp-2 text-sm leading-snug text-muted">{meta}</p> : null}
      </div>
    </article>
  );
}

function MiniShot({ html }: { html?: string | null }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => setOn(true), []);
  useEffect(() => {
    if (!ref.current || !on || !html) return;
    ref.current.srcdoc = html;
  }, [html, on]);
  if (!html) return <div className="h-full bg-elevated" />;
  return on ? (
    <iframe
      ref={ref}
      title=""
      tabIndex={-1}
      sandbox="allow-scripts"
      className="pointer-events-none absolute left-0 top-0 h-[250%] w-[250%] origin-top-left scale-[0.4] border-0"
    />
  ) : (
    <div className="h-full bg-elevated" />
  );
}

import type { CSSProperties, ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { VELVET_CREATE_PROMPT } from "@/demos/registry";

export function DemoShell({
  brand,
  back,
  reset,
  tour,
  touring,
  made,
  create,
  prompt = VELVET_CREATE_PROMPT,
  className = "vt",
  demoId,
  layout,
  style,
  onReset,
  onTour,
  tourActive,
  children,
}: {
  brand: string;
  back: string;
  reset: string;
  tour: string;
  touring: string;
  made: string;
  create: string;
  prompt?: string;
  className?: string;
  demoId?: string;
  layout?: string;
  style?: CSSProperties;
  onReset: () => void;
  onTour: () => void;
  tourActive: boolean;
  children: ReactNode;
}) {
  return (
    <div className={className} data-demo={demoId} data-layout={layout} style={style}>
      <header className="hx-shell vt-shell">
        <Link to="/vetrina" search={{ app: undefined }} className="hx-text vt-text">
          {back}
        </Link>
        <p className="hx-brand vt-shell-brand">{brand}</p>
        <div className="hx-actions vt-shell-actions">
          <button type="button" className="hx-ghost vt-ghost" onClick={onReset}>
            {reset}
          </button>
          <button
            type="button"
            className="hx-ghost vt-ghost"
            data-active={tourActive}
            onClick={onTour}
            disabled={tourActive}
          >
            {tourActive ? touring : tour}
          </button>
        </div>
      </header>
      <div className="hx-body vt-body">{children}</div>
      <footer className="hx-foot vt-foot">
        <p className="hx-made vt-made">{made}</p>
        <Link to="/" search={{ prompt }} className="hx-create vt-create">
          {create}
        </Link>
      </footer>
    </div>
  );
}

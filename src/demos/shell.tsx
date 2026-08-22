import type { ReactNode } from "react";
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
  onReset: () => void;
  onTour: () => void;
  tourActive: boolean;
  children: ReactNode;
}) {
  return (
    <div className="vt">
      <header className="vt-shell">
        <Link to="/vetrina" search={{ app: undefined }} className="vt-text">
          {back}
        </Link>
        <p className="vt-shell-brand">{brand}</p>
        <div className="vt-shell-actions">
          <button type="button" className="vt-ghost" onClick={onReset}>
            {reset}
          </button>
          <button
            type="button"
            className="vt-ghost"
            data-active={tourActive}
            onClick={onTour}
            disabled={tourActive}
          >
            {tourActive ? touring : tour}
          </button>
        </div>
      </header>
      <div className="vt-body">{children}</div>
      <footer className="vt-foot">
        <p className="vt-made">{made}</p>
        <Link to="/" search={{ prompt: VELVET_CREATE_PROMPT }} className="vt-create">
          {create}
        </Link>
      </footer>
    </div>
  );
}

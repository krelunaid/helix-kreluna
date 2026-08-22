import type { CSSProperties, ReactNode } from "react";
import { Link } from "@tanstack/react-router";

const DEFAULT_PROMPT =
  "Crea un servizio di prenotazione ristoranti e concierge gastronomico come Velvet Table: atmosfera da grand hotel, ricerca per occasione, mappa dei tavoli con vista e privacy, prenotazione in quattro passi e wallet della prenotazione.";

export function DemoShell({
  brand,
  back,
  reset,
  tour,
  touring,
  made,
  create,
  prompt = DEFAULT_PROMPT,
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

export function PhotoStack({
  photos,
  active,
  alt,
}: {
  photos: readonly string[];
  active: number;
  alt: string;
}) {
  return (
    <div className="hx-stack">
      {photos.map((src, index) => (
        <img
          key={src}
          src={src}
          alt={index === active ? alt : ""}
          hidden={index !== active}
        />
      ))}
    </div>
  );
}

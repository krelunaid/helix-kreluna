import { cn } from "@/lib/utils";

/** One sculptural object for the signed-out studio: cream marble, chrome helix, warm light. */
export function AtelierObject({ className }: { className?: string }) {
  return (
    <div className={cn("atelier-object", className)} aria-hidden>
      <svg viewBox="0 0 640 760" className="atelier-object-svg" role="presentation">
        <defs>
          <radialGradient id="atelier-glow" cx="42%" cy="28%" r="58%">
            <stop offset="0%" stopColor="#f4ead4" stopOpacity="0.42" />
            <stop offset="38%" stopColor="#c9b896" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#0a0908" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="atelier-cone" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor="#f6edd8" stopOpacity="0.28" />
            <stop offset="70%" stopColor="#c9b896" stopOpacity="0.04" />
            <stop offset="100%" stopColor="#0a0908" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="atelier-marble" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f7f0df" />
            <stop offset="46%" stopColor="#e7dcc4" />
            <stop offset="100%" stopColor="#cfc3aa" />
          </linearGradient>
          <linearGradient id="atelier-marble-side" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#d8ccb4" />
            <stop offset="100%" stopColor="#9f927c" />
          </linearGradient>
          <linearGradient id="atelier-chrome" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f8f4ea" />
            <stop offset="28%" stopColor="#cfc6b8" />
            <stop offset="54%" stopColor="#8d7f74" />
            <stop offset="78%" stopColor="#e8dfd0" />
            <stop offset="100%" stopColor="#6f655c" />
          </linearGradient>
          <linearGradient id="atelier-chrome-dark" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#d8cfc2" />
            <stop offset="40%" stopColor="#6e645c" />
            <stop offset="100%" stopColor="#b7aa9c" />
          </linearGradient>
          <filter id="atelier-soft" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="8" />
          </filter>
        </defs>

        <rect width="640" height="760" fill="transparent" />
        <ellipse cx="320" cy="668" rx="210" ry="28" fill="#000" opacity="0.45" />
        <path d="M168 40 L472 40 L400 700 L240 700 Z" fill="url(#atelier-cone)" />
        <circle cx="268" cy="168" r="170" fill="url(#atelier-glow)" filter="url(#atelier-soft)" />

        <path d="M214 596 L426 596 L412 668 L228 668 Z" fill="url(#atelier-marble)" />
        <path d="M214 596 L228 668 L228 688 L210 616 Z" fill="url(#atelier-marble-side)" />
        <path d="M426 596 L430 616 L412 688 L412 668 Z" fill="#b7ab94" />
        <path d="M210 616 L430 616 L412 688 L228 688 Z" fill="#c4b69c" />
        <path
          d="M236 610 C280 602 360 618 404 608"
          fill="none"
          stroke="#f6edd8"
          strokeWidth="1.2"
          opacity="0.55"
        />
        <path
          d="M248 632 C300 642 350 620 396 636"
          fill="none"
          stroke="#8d7f6c"
          strokeWidth="0.8"
          opacity="0.35"
        />

        <path
          d="M292 188 C250 230 248 286 292 328 C336 370 338 426 292 468 C246 510 248 566 304 592"
          fill="none"
          stroke="url(#atelier-chrome)"
          strokeWidth="22"
          strokeLinecap="round"
        />
        <path
          d="M348 188 C390 230 392 286 348 328 C304 370 302 426 348 468 C392 510 390 566 336 592"
          fill="none"
          stroke="url(#atelier-chrome-dark)"
          strokeWidth="22"
          strokeLinecap="round"
        />
        <path
          d="M292 188 C250 230 248 286 292 328 C336 370 338 426 292 468 C246 510 248 566 304 592"
          fill="none"
          stroke="#f6edd8"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.45"
        />
        <circle cx="320" cy="188" r="13" fill="url(#atelier-chrome)" />
        <circle cx="320" cy="188" r="5" fill="#f6edd8" />
      </svg>
    </div>
  );
}

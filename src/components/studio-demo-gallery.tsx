import type { CSSProperties } from "react";
import { Link } from "@tanstack/react-router";
import { ANDREA_LIVE_SITES, premiumDemos, premiumKindLabel } from "@/lib/premium-demos";
import { flagshipCopy } from "@/lib/flagships/copy";
import type { Locale } from "@/lib/i18n-core";

export function StudioDemoGallery({
  locale,
  title,
  lead,
  open,
  andrea,
}: {
  locale: Locale;
  title: string;
  lead: string;
  open: string;
  andrea: string;
}) {
  const demos = premiumDemos(locale);
  return (
    <section id="studio-demos" className="atelier-demo-gallery" aria-labelledby="studio-demos-title">
      <div className="atelier-demo-heading">
        <p className="atelier-section-label">18</p>
        <h2 id="studio-demos-title" className="atelier-demo-title">
          {title}
        </h2>
        <p className="atelier-demo-lead">{lead}</p>
      </div>
      <ul className="atelier-demo-grid">
        {demos.map((demo) => (
          <li key={demo.id}>
            <Link
              to="/a/$slug"
              params={{ slug: demo.id }}
              search={{ lang: locale }}
              className="atelier-poster"
              aria-label={`${open}: ${demo.name}`}
              style={
                {
                  "--poster-ink": demo.ink,
                  "--poster-paper": demo.paper,
                  "--poster-metal": demo.metal,
                } as CSSProperties
              }
            >
              <span className="atelier-poster-stage" aria-hidden>
                <span className="atelier-poster-object" data-motif={demo.id} />
              </span>
              <span className="atelier-poster-kind">{premiumKindLabel(locale, demo.kind)}</span>
              <span className="atelier-poster-name">{demo.name}</span>
              <span className="atelier-poster-line">{demo.line}</span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="atelier-andrea-row">
        <p className="atelier-section-label">{andrea}</p>
        <ul className="atelier-andrea-grid">
          {ANDREA_LIVE_SITES.map((id) => {
            const copy = flagshipCopy(locale, id);
            return (
              <li key={id}>
                <Link
                  to="/a/$slug"
                  params={{ slug: id }}
                  search={{ lang: locale }}
                  className="atelier-andrea-card"
                  aria-label={`${open}: ${copy.brand}`}
                >
                  <span className="atelier-poster-kind">{copy.kind}</span>
                  <span className="atelier-poster-name">{copy.brand}</span>
                  <span className="atelier-poster-line">{copy.title}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

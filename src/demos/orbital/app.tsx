import { DemoShell } from "@/demos/shell";
import { demoChrome, pickLine } from "@/demos/chrome";
import { PREMIUM_PROMPTS } from "@/demos/registry";
import { useDemoState } from "@/demos/use-demo";
import { useI18n } from "@/lib/i18n";
import "@/demos/atelier.css";
import "./styles.css";

const CRAFT = [
  { id: "earth", photo: "/vetrina/orbital/earth.jpg", name: "Vega-2", alt: 412 },
  { id: "craft", photo: "/vetrina/orbital/craft.jpg", name: "Astra-7", alt: 508 },
  { id: "pad", photo: "/vetrina/orbital/pad.jpg", name: "Kite-4", alt: 390 },
] as const;

const INITIAL = { craft: 0, burn: 12, screen: "fleet" as "fleet" | "console" | "hold", notice: "", touring: false };

export default function OrbitalApp() {
  const { locale } = useI18n();
  const chrome = demoChrome(locale);
  const { state, setState, patch, reset, later, clearTimers } = useDemoState(INITIAL);
  const craft = CRAFT[state.craft] ?? CRAFT[0];

  function startTour() {
    clearTimers();
    setState({ ...INITIAL, touring: true, notice: pickLine(locale, "Orbita, luce, un veicolo.", "Orbit, light, one vehicle.") });
    later(800, () => setState((c) => ({ ...c, screen: "console", craft: 1 })));
    later(1800, () => setState((c) => ({ ...c, burn: 24 })));
    later(2600, () => setState((c) => ({ ...c, screen: "hold", touring: false, notice: pickLine(locale, "Manovra simulata. Nessun comando inviato.", "Simulated maneuver. No command sent.") })));
  }

  return (
    <DemoShell className="hx ob" demoId="orbital" brand="Orbital" prompt={PREMIUM_PROMPTS.orbital} onReset={() => reset({ notice: pickLine(locale, "Link chiuso.", "Link closed.") })} onTour={startTour} tourActive={state.touring} {...chrome}>
      {state.notice ? <p className="hx-notice">{state.notice}</p> : null}
      {state.screen === "fleet" ? (
        <section className="ob-fleet">
          <p className="ob-kicker">{pickLine(locale, "Console di missione", "Mission console")}</p>
          <h1>{pickLine(locale, "Vuoto, segnale, un burn.", "Void, signal, one burn.")}</h1>
          <div>
            {CRAFT.map((item, index) => (
              <button key={item.id} type="button" onClick={() => patch({ craft: index, screen: "console" })}>
                <img src={item.photo} alt="" />
                <strong>{item.name}</strong>
                <em>{item.alt} km</em>
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {state.screen === "console" ? (
        <section className="ob-console">
          <div className="ob-void">
            <img src={craft.photo} alt="" />
            <svg viewBox="0 0 200 200" aria-hidden="true"><ellipse cx="100" cy="100" rx="78" ry="36" /><circle cx={100 + state.burn} cy="100" r="5" /></svg>
          </div>
          <aside>
            <button type="button" className="hx-text" onClick={() => patch({ screen: "fleet" })}>{pickLine(locale, "Flotta", "Fleet")}</button>
            <h2>{craft.name}</h2>
            <label>{pickLine(locale, "Burn", "Burn")}<input type="range" min={0} max={40} value={state.burn} onChange={(e) => patch({ burn: Number(e.target.value) })} /></label>
            <button type="button" className="ob-go" onClick={() => patch({ screen: "hold" })}>{pickLine(locale, "Conferma simulata", "Confirm simulation")}</button>
          </aside>
        </section>
      ) : null}
      {state.screen === "hold" ? (
        <section className="ob-hold">
          <img src={craft.photo} alt="" />
          <div>
            <p className="ob-kicker">{pickLine(locale, "Hold", "Hold")}</p>
            <h2>{craft.name}</h2>
            <p>Δv {state.burn} m/s</p>
          </div>
        </section>
      ) : null}
    </DemoShell>
  );
}

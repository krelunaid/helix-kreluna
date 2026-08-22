import { DemoShell } from "@/demos/shell";
import { demoChrome, pickLine } from "@/demos/chrome";
import { PREMIUM_PROMPTS } from "@/demos/registry";
import { useDemoState } from "@/demos/use-demo";
import { useI18n } from "@/lib/i18n";
import "@/demos/atelier.css";
import "./styles.css";

const CELLS = [
  { id: "sea", photo: "/vetrina/stormglass/sea.jpg", nameIt: "Costa nord", nameEn: "North coast", wind: 34 },
  { id: "sky", photo: "/vetrina/stormglass/sky.jpg", nameIt: "Cella alta", nameEn: "High cell", wind: 48 },
  { id: "peak", photo: "/vetrina/stormglass/peak.jpg", nameIt: "Cresta", nameEn: "Ridge", wind: 41 },
] as const;

const LAYERS = ["radar", "wind", "glass"] as const;
const INITIAL = { cell: 0, layer: 0, screen: "glass" as "glass" | "cell" | "brief", notice: "", touring: false };

export default function StormGlassApp() {
  const { locale } = useI18n();
  const chrome = demoChrome(locale);
  const { state, setState, patch, reset, later, clearTimers } = useDemoState(INITIAL);
  const cell = CELLS[state.cell] ?? CELLS[0];

  function startTour() {
    clearTimers();
    setState({ ...INITIAL, touring: true, notice: pickLine(locale, "Vetro, temporale, una costa.", "Glass, a storm, one coast.") });
    later(800, () => setState((c) => ({ ...c, cell: 1, screen: "cell" })));
    later(1800, () => setState((c) => ({ ...c, layer: 1 })));
    later(2600, () => setState((c) => ({ ...c, screen: "brief", touring: false, notice: pickLine(locale, "Brief locale. Nessun allarme inviato.", "Local brief. No alert sent.") })));
  }

  return (
    <DemoShell className="hx sg" demoId="stormglass" brand="StormGlass" prompt={PREMIUM_PROMPTS.stormglass} onReset={() => reset({ notice: pickLine(locale, "Vetro pulito.", "Glass cleared.") })} onTour={startTour} tourActive={state.touring} {...chrome}>
      {state.notice ? <p className="hx-notice">{state.notice}</p> : null}
      {state.screen === "glass" ? (
        <section className="sg-glass">
          <p className="sg-kicker">{pickLine(locale, "Osservatorio", "Observatory")}</p>
          <h1>{pickLine(locale, "La costa dietro il vetro.", "The coast behind glass.")}</h1>
          <div>
            {CELLS.map((item, index) => (
              <button key={item.id} type="button" onClick={() => patch({ cell: index, screen: "cell" })}>
                <img src={item.photo} alt="" />
                <strong>{pickLine(locale, item.nameIt, item.nameEn)}</strong>
                <em>{item.wind} kn</em>
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {state.screen === "cell" ? (
        <section className="sg-cell">
          <div className="sg-view" data-layer={LAYERS[state.layer]}><img src={cell.photo} alt="" /></div>
          <aside>
            <button type="button" className="hx-text" onClick={() => patch({ screen: "glass" })}>{pickLine(locale, "Celle", "Cells")}</button>
            <h2>{pickLine(locale, cell.nameIt, cell.nameEn)}</h2>
            <div className="sg-layers">
              {LAYERS.map((layer, index) => (
                <button key={layer} type="button" data-on={state.layer === index} onClick={() => patch({ layer: index })}>{layer}</button>
              ))}
            </div>
            <button type="button" className="sg-go" onClick={() => patch({ screen: "brief" })}>{pickLine(locale, "Scrivi brief", "Write brief")}</button>
          </aside>
        </section>
      ) : null}
      {state.screen === "brief" ? (
        <section className="sg-brief">
          <img src={cell.photo} alt="" />
          <div>
            <p className="sg-kicker">{pickLine(locale, "Brief", "Brief")}</p>
            <h2>{cell.wind} kn · {LAYERS[state.layer]}</h2>
            <p>{pickLine(locale, "Allerta tenuta in vetro.", "Alert kept in glass.")}</p>
          </div>
        </section>
      ) : null}
    </DemoShell>
  );
}

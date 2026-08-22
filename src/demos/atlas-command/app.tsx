import { DemoShell } from "@/demos/shell";
import { demoChrome, pickLine } from "@/demos/chrome";
import { PREMIUM_PROMPTS } from "@/demos/registry";
import { useDemoState } from "@/demos/use-demo";
import { useI18n } from "@/lib/i18n";
import "@/demos/atelier.css";
import "./styles.css";

const THEATRES = [
  { id: "globe", photo: "/vetrina/atlas-command/globe.jpg", nameIt: "Teatro Nord", nameEn: "North theatre", code: "N-04" },
  { id: "map", photo: "/vetrina/atlas-command/map.jpg", nameIt: "Corridoio", nameEn: "Corridor", code: "C-11" },
  { id: "ridge", photo: "/vetrina/atlas-command/ridge.jpg", nameIt: "Cresta", nameEn: "Ridge", code: "R-2" },
] as const;

const LAYERS = ["relief", "routes", "orders"] as const;
const INITIAL = { theatre: 0, layer: 0, screen: "map" as "map" | "board" | "order", notice: "", touring: false };

export default function AtlasCommandApp() {
  const { locale } = useI18n();
  const chrome = demoChrome(locale);
  const { state, setState, patch, reset, later, clearTimers } = useDemoState(INITIAL);
  const theatre = THEATRES[state.theatre] ?? THEATRES[0];

  function startTour() {
    clearTimers();
    setState({ ...INITIAL, touring: true, notice: pickLine(locale, "Comando, mappa, un teatro.", "Command, a map, one theatre.") });
    later(800, () => setState((c) => ({ ...c, theatre: 0, screen: "board" })));
    later(1800, () => setState((c) => ({ ...c, layer: 2 })));
    later(2600, () => setState((c) => ({ ...c, screen: "order", touring: false, notice: pickLine(locale, "Ordine locale. Nessun teatro reale.", "Local order. No real theatre.") })));
  }

  return (
    <DemoShell className="hx ac" demoId="atlas-command" brand="Atlas Command" prompt={PREMIUM_PROMPTS["atlas-command"]} onReset={() => reset({ notice: pickLine(locale, "Mappa pulita.", "Map cleared.") })} onTour={startTour} tourActive={state.touring} {...chrome}>
      {state.notice ? <p className="hx-notice">{state.notice}</p> : null}
      {state.screen === "map" ? (
        <section className="ac-map">
          <p className="ac-kicker">{pickLine(locale, "Teatro di comando", "Command theatre")}</p>
          <h1>{pickLine(locale, "Un teatro, un ordine.", "One theatre, one order.")}</h1>
          <div>
            {THEATRES.map((item, index) => (
              <button key={item.id} type="button" onClick={() => patch({ theatre: index, screen: "board" })}>
                <img src={item.photo} alt="" />
                <strong>{pickLine(locale, item.nameIt, item.nameEn)}</strong>
                <em>{item.code}</em>
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {state.screen === "board" ? (
        <section className="ac-board">
          <div className="ac-view" data-layer={LAYERS[state.layer]}><img src={theatre.photo} alt="" /></div>
          <aside>
            <button type="button" className="hx-text" onClick={() => patch({ screen: "map" })}>{pickLine(locale, "Teatri", "Theatres")}</button>
            <h2>{theatre.code}</h2>
            <div>
              {LAYERS.map((layer, index) => (
                <button key={layer} type="button" data-on={state.layer === index} onClick={() => patch({ layer: index })}>{layer}</button>
              ))}
            </div>
            <button type="button" className="ac-go" onClick={() => patch({ screen: "order" })}>{pickLine(locale, "Emetti ordine", "Issue order")}</button>
          </aside>
        </section>
      ) : null}
      {state.screen === "order" ? (
        <section className="ac-order">
          <img src={theatre.photo} alt="" />
          <div>
            <p className="ac-kicker">{pickLine(locale, "Ordine", "Order")}</p>
            <h2>{theatre.code} · {LAYERS[state.layer]}</h2>
            <p>{pickLine(locale, theatre.nameIt, theatre.nameEn)}</p>
          </div>
        </section>
      ) : null}
    </DemoShell>
  );
}

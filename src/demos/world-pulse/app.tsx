import { DemoShell } from "@/demos/shell";
import { demoChrome, pickLine } from "@/demos/chrome";
import { PREMIUM_PROMPTS } from "@/demos/registry";
import { useDemoState } from "@/demos/use-demo";
import { useI18n } from "@/lib/i18n";
import "@/demos/atelier.css";
import "./styles.css";

const CITIES = [
  { id: "roma", x: 52, y: 46, nameIt: "Roma", nameEn: "Rome", pulse: 72, photo: "/vetrina/world-pulse/city.jpg", hedIt: "La piazza tiene il respiro.", hedEn: "The square holds its breath.", dekIt: "Un corteo silenzioso, poi le campane.", dekEn: "A quiet march, then the bells." },
  { id: "desk", x: 28, y: 32, nameIt: "Londra", nameEn: "London", pulse: 64, photo: "/vetrina/world-pulse/desk.jpg", hedIt: "La desk non dorme.", hedEn: "The desk does not sleep.", dekIt: "Tre edizioni, una sola riga vera.", dekEn: "Three editions, one true line." },
  { id: "paper", x: 74, y: 38, nameIt: "Tokyo", nameEn: "Tokyo", pulse: 88, photo: "/vetrina/world-pulse/paper.jpg", hedIt: "La carta arriva prima dell’alba.", hedEn: "The paper arrives before dawn.", dekIt: "Inchiostro caldo, città già in moto.", dekEn: "Warm ink, a city already moving." },
] as const;

const INITIAL = {
  city: 0,
  screen: "wire" as "wire" | "copy" | "edition",
  copy: "",
  notice: "",
  touring: false,
};

export default function WorldPulseApp() {
  const { locale } = useI18n();
  const chrome = demoChrome(locale);
  const { state, setState, patch, reset, later, clearTimers } = useDemoState(INITIAL);
  const city = CITIES[state.city] ?? CITIES[0];

  function startTour() {
    clearTimers();
    setState({ ...INITIAL, touring: true, notice: pickLine(locale, "Mappa, battito, una città.", "A map, a pulse, one city.") });
    later(800, () => setState((c) => ({ ...c, city: 0 })));
    later(1600, () => setState((c) => ({ ...c, screen: "copy", copy: pickLine(locale, city.hedIt, city.hedEn) })));
    later(2600, () =>
      setState((c) => ({
        ...c,
        screen: "edition",
        touring: false,
        notice: pickLine(locale, "Edizione locale. Nessun filo è stato mandato.", "Local edition. No wire was sent."),
      })),
    );
  }

  return (
    <DemoShell
      className="hx wp"
      demoId="world-pulse"
      brand="World Pulse"
      prompt={PREMIUM_PROMPTS["world-pulse"]}
      onReset={() => reset({ notice: pickLine(locale, "Desk azzerata.", "Desk reset.") })}
      onTour={startTour}
      tourActive={state.touring}
      {...chrome}
    >
      {state.notice ? <p className="hx-notice">{state.notice}</p> : null}

      {state.screen === "wire" ? (
        <section className="wp-wire">
          <div className="wp-map" aria-label={pickLine(locale, "Mappa", "Map")}>
            <img src="/vetrina/world-pulse/city.jpg" alt="" />
            {CITIES.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className="wp-pin"
                style={{ left: `${item.x}%`, top: `${item.y}%` }}
                data-on={state.city === index}
                onClick={() => patch({ city: index })}
              >
                <span>{item.pulse}</span>
                {pickLine(locale, item.nameIt, item.nameEn)}
              </button>
            ))}
          </div>
          <aside>
            <p className="wp-kicker">{pickLine(locale, "Desk di attualità", "News desk")}</p>
            <h1>{pickLine(locale, city.hedIt, city.hedEn)}</h1>
            <p>{pickLine(locale, city.dekIt, city.dekEn)}</p>
            <p className="wp-pulse">
              {pickLine(locale, "Battito", "Pulse")} {city.pulse}
            </p>
            <button type="button" className="wp-cta" onClick={() => patch({ screen: "copy", copy: pickLine(locale, city.hedIt, city.hedEn) })}>
              {pickLine(locale, "Apri la copia", "Open copy")}
            </button>
          </aside>
        </section>
      ) : null}

      {state.screen === "copy" ? (
        <section className="wp-copy">
          <img src={city.photo} alt="" />
          <div>
            <button type="button" className="hx-text" onClick={() => patch({ screen: "wire" })}>
              {pickLine(locale, "Mappa", "Map")}
            </button>
            <p className="wp-kicker">{pickLine(locale, city.nameIt, city.nameEn)}</p>
            <textarea value={state.copy} onChange={(event) => patch({ copy: event.target.value })} rows={5} />
            <button type="button" className="wp-cta" onClick={() => patch({ screen: "edition" })}>
              {pickLine(locale, "Pubblica in locale", "Publish locally")}
            </button>
          </div>
        </section>
      ) : null}

      {state.screen === "edition" ? (
        <section className="wp-edition">
          <img src="/vetrina/world-pulse/paper.jpg" alt="" />
          <article>
            <p className="wp-kicker">{pickLine(locale, "Edizione di prova", "Trial edition")}</p>
            <h2>{state.copy || pickLine(locale, city.hedIt, city.hedEn)}</h2>
            <p>{pickLine(locale, city.dekIt, city.dekEn)}</p>
            <p className="wp-mute">{pickLine(locale, "La storia resta sul banco.", "The story stays on the desk.")}</p>
          </article>
        </section>
      ) : null}
    </DemoShell>
  );
}

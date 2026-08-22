import { DemoShell, PhotoStack } from "@/demos/shell";
import { demoChrome, pickLine } from "@/demos/chrome";
import { PREMIUM_PROMPTS } from "@/demos/registry";
import { useDemoState } from "@/demos/use-demo";
import { EPOQUE_PHOTOS } from "@/lib/flagships/andrea-photos";
import { useI18n } from "@/lib/i18n";
import "@/demos/atelier.css";
import "./styles.css";

const CARS = [
  { id: "wings", name: "Aurelion SL Wings", year: "1955", era: "historic", price: "2400", place: "Como · Villa d’Este", photo: EPOQUE_PHOTOS.wings, noteIt: "Porte ad ali. La prima stella della maison.", noteEn: "Gullwing doors. The maison’s first star." },
  { id: "sl190", name: "Aurelion 190", year: "1960", era: "historic", price: "1500", place: "Parigi · Saint-Germain", photo: EPOQUE_PHOTOS.sl190, noteIt: "Avorio, pelle rossa, un weekend fino a mezzanotte.", noteEn: "Ivory, red leather, a weekend until midnight." },
  { id: "roadster", name: "Aurelion Roadster", year: "1957", era: "historic", price: "2200", place: "Parigi · Plaza Athénée", photo: EPOQUE_PHOTOS.roadster, noteIt: "La stessa stella, a cielo aperto.", noteEn: "The same star, open to the sky." },
  { id: "pagoda", name: "Aurelion Pagoda", year: "1963", era: "historic", price: "1700", place: "Como · Villa d’Este", photo: EPOQUE_PHOTOS.pagoda, noteIt: "Il tetto pagoda e la luce del lago.", noteEn: "The pagoda roof and the lake light." },
  { id: "amg", name: "Aurelion GT", year: "2024", era: "modern", price: "2900", place: "Monaco · Hôtel de Paris", photo: EPOQUE_PHOTOS.amg, noteIt: "Eccellenza moderna, stessa stella.", noteEn: "Modern excellence, same star." },
  { id: "g63", name: "Aurelion G", year: "2023", era: "modern", price: "2600", place: "Courchevel · Annapurna", photo: EPOQUE_PHOTOS.g63, noteIt: "Il G, per le strade e per la neve.", noteEn: "The G, for roads and for snow." },
] as const;

type Era = "historic" | "modern" | "all";

const INITIAL = {
  era: "historic" as Era,
  car: 0,
  days: 2,
  query: "",
  screen: "salon" as "salon" | "folio" | "hold",
  notice: "",
  touring: false,
  code: "",
};

export default function AurelionMotorsApp() {
  const { locale } = useI18n();
  const chrome = demoChrome(locale);
  const { state, setState, patch, reset, later, clearTimers } = useDemoState(INITIAL);
  const it = locale === "it";
  const car = CARS[state.car] ?? CARS[0];
  const visible = CARS.map((item, index) => ({ item, index })).filter(({ item }) => {
    const eraOk = state.era === "all" || item.era === state.era;
    const q = state.query.trim().toLowerCase();
    return eraOk && (!q || `${item.name} ${item.year}`.toLowerCase().includes(q));
  });

  function flash(notice: string) {
    patch({ notice });
    later(2400, () => setState((current) => (current.notice === notice ? { ...current, notice: "" } : current)));
  }

  function startTour() {
    clearTimers();
    setState({ ...INITIAL, touring: true, notice: pickLine(locale, "La stella, in ogni epoca.", "The star, in every era.") });
    later(800, () => setState((c) => ({ ...c, car: 0, era: "historic" })));
    later(1600, () => setState((c) => ({ ...c, screen: "folio", days: 3 })));
    later(2600, () =>
      setState((c) => ({
        ...c,
        screen: "hold",
        touring: false,
        code: "AU-1955-300",
        notice: pickLine(locale, "Richiesta demo pronta: nessuna prenotazione reale.", "Demo request ready: no real booking was sent."),
      })),
    );
  }

  return (
    <DemoShell
      className="hx am"
      demoId="aurelion-motors"
      brand="Aurelion Motors"
      prompt={PREMIUM_PROMPTS["aurelion-motors"]}
      onReset={() => reset({ notice: pickLine(locale, "Salon azzerato.", "Salon reset.") })}
      onTour={startTour}
      tourActive={state.touring}
      {...chrome}
    >
      {state.notice ? <p className="hx-notice">{state.notice}</p> : null}

      {state.screen === "salon" ? (
        <section className="am-salon">
          <div className="am-hero">
            <PhotoStack photos={CARS.map((item) => item.photo)} active={state.car} alt={car.name} />
            <div className="am-veil" />
            <p className="am-word">{pickLine(locale, "Stella", "Star")}</p>
            <div className="am-hero-copy">
              <p className="am-kicker">{pickLine(locale, "Collezione classica e moderna", "Classic and modern collection")}</p>
              <h1>{pickLine(locale, "Viaggi senza tempo.", "Journeys without time.")}</h1>
              <p>{pickLine(locale, "Metallo, strada, una stella.", "Metal, road, one star.")}</p>
            </div>
          </div>
          <div className="am-board">
            <label className="am-search">
              <span className="sr-only">{pickLine(locale, "Cerca", "Search")}</span>
              <input
                value={state.query}
                onChange={(event) => patch({ query: event.target.value })}
                placeholder={pickLine(locale, "Cerca auto, modelli o anni", "Search cars, models or years")}
              />
            </label>
            <div className="am-eras" role="group">
              {(["historic", "modern", "all"] as const).map((era) => (
                <button key={era} type="button" data-on={state.era === era} onClick={() => patch({ era })}>
                  {era === "historic"
                    ? pickLine(locale, "Storiche", "Historic")
                    : era === "modern"
                      ? pickLine(locale, "Moderne", "Modern")
                      : pickLine(locale, "Tutte", "All")}
                </button>
              ))}
            </div>
            <div className="am-fleet">
              {visible.map(({ item, index }) => (
                <button
                  key={item.id}
                  type="button"
                  className="am-car"
                  data-on={state.car === index}
                  onClick={() => {
                    patch({ car: index });
                    flash(pickLine(locale, "Selezione aggiornata", "Selection updated"));
                  }}
                >
                  <img src={item.photo} alt="" />
                  <span>
                    <strong>{item.name}</strong>
                    <em>
                      {item.year} · €{item.price}
                    </em>
                  </span>
                </button>
              ))}
              {visible.length === 0 ? <p className="am-empty">{pickLine(locale, "Nessuna leggenda corrisponde.", "No legend matches.")}</p> : null}
            </div>
            <aside className="am-folio">
              <p className="am-kicker">{pickLine(locale, "Selezionata", "Selected")}</p>
              <h2>{car.name}</h2>
              <p>{it ? car.noteIt : car.noteEn}</p>
              <dl>
                <div>
                  <dt>{pickLine(locale, "Tariffa giorno", "Daily rate")}</dt>
                  <dd>€{car.price}</dd>
                </div>
                <div>
                  <dt>{pickLine(locale, "Ritiro", "Collection")}</dt>
                  <dd>{car.place}</dd>
                </div>
              </dl>
              <div className="am-days">
                <button type="button" onClick={() => patch({ days: Math.max(1, state.days - 1) })}>
                  −
                </button>
                <output>
                  {state.days} {pickLine(locale, "giorni", "days")}
                </output>
                <button type="button" onClick={() => patch({ days: Math.min(14, state.days + 1) })}>
                  +
                </button>
              </div>
              <button type="button" className="am-reserve" onClick={() => patch({ screen: "folio" })}>
                {pickLine(locale, "Richiedi disponibilità", "Request availability")}
              </button>
            </aside>
          </div>
        </section>
      ) : null}

      {state.screen === "folio" ? (
        <section className="am-request">
          <div className="am-request-photo">
            <img src={car.photo} alt={car.name} />
          </div>
          <div className="am-request-copy">
            <button type="button" className="hx-text" onClick={() => patch({ screen: "salon" })}>
              {pickLine(locale, "Indietro", "Back")}
            </button>
            <p className="am-kicker">{car.year}</p>
            <h2>{car.name}</h2>
            <p>{it ? car.noteIt : car.noteEn}</p>
            <p className="am-sum">
              {state.days} × €{car.price} · {car.place}
            </p>
            <div className="am-events">
              <img src={EPOQUE_PHOTOS.salon} alt="" />
              <img src={EPOQUE_PHOTOS.villa} alt="" />
            </div>
            <button
              type="button"
              className="am-reserve"
              onClick={() =>
                setState((c) => ({
                  ...c,
                  screen: "hold",
                  code: `AU-${car.year}-${String(100 + c.days)}`,
                  notice: pickLine(locale, "Richiesta demo pronta: nessuna prenotazione reale.", "Demo request ready: no real booking was sent."),
                }))
              }
            >
              {pickLine(locale, "Conferma richiesta", "Confirm request")}
            </button>
          </div>
        </section>
      ) : null}

      {state.screen === "hold" ? (
        <section className="am-hold">
          <img src={car.photo} alt="" />
          <div>
            <p className="am-kicker">{pickLine(locale, "Folio", "Folio")}</p>
            <h2>{state.code}</h2>
            <p>
              {car.name} · {state.days} {pickLine(locale, "giorni", "days")}
            </p>
            <p className="am-mute">{pickLine(locale, "Niente è stato inviato alla maison reale.", "Nothing was sent to the real maison.")}</p>
          </div>
        </section>
      ) : null}
    </DemoShell>
  );
}

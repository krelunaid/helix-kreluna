import { DemoShell } from "@/demos/shell";
import { demoChrome, pickLine } from "@/demos/chrome";
import { PREMIUM_PROMPTS } from "@/demos/registry";
import { useDemoState } from "@/demos/use-demo";
import { useI18n } from "@/lib/i18n";
import "@/demos/atelier.css";
import "./styles.css";

const FILMS = [
  { id: "hall", photo: "/vetrina/cinematica/hall.jpg", titleIt: "Sala 1 · Notte lunga", titleEn: "Hall 1 · Long night", time: "21:10", hall: 1 },
  { id: "reel", photo: "/vetrina/cinematica/reel.jpg", titleIt: "Sala 2 · Pellicola 16mm", titleEn: "Hall 2 · 16mm reel", time: "19:40", hall: 2 },
  { id: "light", photo: "/vetrina/cinematica/light.jpg", titleIt: "Sala 3 · Luce tagliata", titleEn: "Hall 3 · Cut light", time: "22:30", hall: 3 },
] as const;

const SEATS = [
  ["A1", "A2", "A3", "A4", "A5", "A6"],
  ["B1", "B2", "B3", "B4", "B5", "B6"],
  ["C1", "C2", "C3", "C4", "C5", "C6"],
];

const TAKEN = new Set(["A3", "B1", "C5"]);

const INITIAL = {
  film: 0,
  seat: "B3",
  screen: "bills" as "bills" | "hall" | "ticket",
  notice: "",
  touring: false,
};

export default function CinematicaApp() {
  const { locale } = useI18n();
  const chrome = demoChrome(locale);
  const { state, setState, patch, reset, later, clearTimers } = useDemoState(INITIAL);
  const film = FILMS[state.film] ?? FILMS[0];

  function startTour() {
    clearTimers();
    setState({ ...INITIAL, touring: true, notice: pickLine(locale, "Pellicola, buio, un fotogramma.", "Film, dark, one frame.") });
    later(800, () => setState((c) => ({ ...c, film: 0, screen: "hall" })));
    later(1800, () => setState((c) => ({ ...c, seat: "B4" })));
    later(2600, () =>
      setState((c) => ({
        ...c,
        screen: "ticket",
        touring: false,
        notice: pickLine(locale, "Posto tenuto in locale. Nessun biglietto reale.", "Seat held locally. No real ticket."),
      })),
    );
  }

  return (
    <DemoShell
      className="hx cm"
      demoId="cinematica"
      brand="Cinematica"
      prompt={PREMIUM_PROMPTS.cinematica}
      onReset={() => reset({ notice: pickLine(locale, "Sala vuota.", "Hall cleared.") })}
      onTour={startTour}
      tourActive={state.touring}
      {...chrome}
    >
      {state.notice ? <p className="hx-notice">{state.notice}</p> : null}

      {state.screen === "bills" ? (
        <section className="cm-bills">
          <header>
            <p className="cm-kicker">{pickLine(locale, "Programma di sala", "Hall programme")}</p>
            <h1>{pickLine(locale, "Il buio, poi un fotogramma.", "Dark, then one frame.")}</h1>
          </header>
          <div className="cm-posters">
            {FILMS.map((item, index) => (
              <button key={item.id} type="button" onClick={() => patch({ film: index, screen: "hall" })}>
                <img src={item.photo} alt="" />
                <span>
                  <strong>{pickLine(locale, item.titleIt, item.titleEn)}</strong>
                  <em>
                    {item.time} · {pickLine(locale, "Sala", "Hall")} {item.hall}
                  </em>
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {state.screen === "hall" ? (
        <section className="cm-hall">
          <div className="cm-screen">
            <img src={film.photo} alt="" />
            <p>{pickLine(locale, "Schermo", "Screen")}</p>
          </div>
          <aside>
            <button type="button" className="hx-text" onClick={() => patch({ screen: "bills" })}>
              {pickLine(locale, "Programma", "Programme")}
            </button>
            <p className="cm-kicker">{film.time}</p>
            <h2>{pickLine(locale, film.titleIt, film.titleEn)}</h2>
            <div className="cm-seats" role="grid">
              {SEATS.map((row) => (
                <div key={row[0]} role="row">
                  {row.map((seat) => (
                    <button
                      key={seat}
                      type="button"
                      role="gridcell"
                      disabled={TAKEN.has(seat)}
                      data-on={state.seat === seat}
                      onClick={() => patch({ seat })}
                    >
                      {seat}
                    </button>
                  ))}
                </div>
              ))}
            </div>
            <button type="button" className="cm-hold" onClick={() => patch({ screen: "ticket" })}>
              {pickLine(locale, "Tieni il posto", "Hold seat")}
            </button>
          </aside>
        </section>
      ) : null}

      {state.screen === "ticket" ? (
        <section className="cm-ticket">
          <img src={film.photo} alt="" />
          <article>
            <p className="cm-kicker">{pickLine(locale, "Biglietto di prova", "Trial ticket")}</p>
            <h2>
              {state.seat} · {film.time}
            </h2>
            <p>{pickLine(locale, film.titleIt, film.titleEn)}</p>
            <p className="cm-mute">{pickLine(locale, "Nessuna sala reale è stata occupata.", "No real hall was occupied.")}</p>
          </article>
        </section>
      ) : null}
    </DemoShell>
  );
}

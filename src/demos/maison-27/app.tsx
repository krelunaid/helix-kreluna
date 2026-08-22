import { DemoShell } from "@/demos/shell";
import { demoChrome, pickLine } from "@/demos/chrome";
import { PREMIUM_PROMPTS } from "@/demos/registry";
import { useDemoState } from "@/demos/use-demo";
import { useI18n } from "@/lib/i18n";
import "@/demos/atelier.css";
import "./styles.css";

const SUITES = [
  { id: "lobby", photo: "/vetrina/maison-27/lobby.jpg", nameIt: "Hall 27", nameEn: "Hall 27", noteIt: "La luce del numero, niente reception rumorosa.", noteEn: "The number’s light, no noisy desk." },
  { id: "suite", photo: "/vetrina/maison-27/suite.jpg", nameIt: "Suite alta", nameEn: "High suite", noteIt: "Un letto, una finestra, il silenzio.", noteEn: "A bed, a window, the quiet." },
  { id: "pool", photo: "/vetrina/maison-27/pool.jpg", nameIt: "Acqua", nameEn: "Water", noteIt: "La vasca tiene la notte.", noteEn: "The pool holds the night." },
] as const;

const INITIAL = { suite: 0, nights: 2, screen: "house" as "house" | "stay" | "hold", notice: "", touring: false };

export default function Maison27App() {
  const { locale } = useI18n();
  const chrome = demoChrome(locale);
  const { state, setState, patch, reset, later, clearTimers } = useDemoState(INITIAL);
  const suite = SUITES[state.suite] ?? SUITES[0];

  function startTour() {
    clearTimers();
    setState({ ...INITIAL, touring: true, notice: pickLine(locale, "Casa, numero, una luce.", "A house, a number, one light.") });
    later(800, () => setState((c) => ({ ...c, suite: 1, screen: "stay" })));
    later(1800, () => setState((c) => ({ ...c, nights: 3 })));
    later(2600, () => setState((c) => ({ ...c, screen: "hold", touring: false, notice: pickLine(locale, "Soggiorno tenuto in locale.", "Stay held locally.") })));
  }

  return (
    <DemoShell className="hx m27" demoId="maison-27" brand="Maison 27" prompt={PREMIUM_PROMPTS["maison-27"]} onReset={() => reset({ notice: pickLine(locale, "Casa vuota.", "House emptied.") })} onTour={startTour} tourActive={state.touring} {...chrome}>
      {state.notice ? <p className="hx-notice">{state.notice}</p> : null}
      {state.screen === "house" ? (
        <section className="m27-house">
          <p className="m27-kicker">{pickLine(locale, "Hotel maison", "Maison hotel")}</p>
          <h1>27</h1>
          <div>
            {SUITES.map((item, index) => (
              <button key={item.id} type="button" onClick={() => patch({ suite: index, screen: "stay" })}>
                <img src={item.photo} alt="" />
                <strong>{pickLine(locale, item.nameIt, item.nameEn)}</strong>
                <em>{pickLine(locale, item.noteIt, item.noteEn)}</em>
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {state.screen === "stay" ? (
        <section className="m27-stay">
          <img src={suite.photo} alt="" />
          <aside>
            <button type="button" className="hx-text" onClick={() => patch({ screen: "house" })}>{pickLine(locale, "Casa", "House")}</button>
            <h2>{pickLine(locale, suite.nameIt, suite.nameEn)}</h2>
            <p>{pickLine(locale, suite.noteIt, suite.noteEn)}</p>
            <div className="m27-nights">
              <button type="button" onClick={() => patch({ nights: Math.max(1, state.nights - 1) })}>−</button>
              <output>{state.nights} {pickLine(locale, "notti", "nights")}</output>
              <button type="button" onClick={() => patch({ nights: Math.min(12, state.nights + 1) })}>+</button>
            </div>
            <button type="button" className="m27-go" onClick={() => patch({ screen: "hold" })}>{pickLine(locale, "Tieni la stanza", "Hold the room")}</button>
          </aside>
        </section>
      ) : null}
      {state.screen === "hold" ? (
        <section className="m27-hold">
          <img src={suite.photo} alt="" />
          <div>
            <p className="m27-kicker">{pickLine(locale, "Chiave di prova", "Trial key")}</p>
            <h2>27 · {state.nights}</h2>
            <p>{pickLine(locale, suite.nameIt, suite.nameEn)}</p>
          </div>
        </section>
      ) : null}
    </DemoShell>
  );
}

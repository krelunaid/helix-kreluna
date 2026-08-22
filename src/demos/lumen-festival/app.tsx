import { DemoShell } from "@/demos/shell";
import { demoChrome, pickLine } from "@/demos/chrome";
import { PREMIUM_PROMPTS } from "@/demos/registry";
import { useDemoState } from "@/demos/use-demo";
import { useI18n } from "@/lib/i18n";
import "@/demos/atelier.css";
import "./styles.css";

const NIGHTS = [
  { id: "stage", photo: "/vetrina/lumen-festival/stage.jpg", nameIt: "Venerdì · Palco", nameEn: "Friday · Stage", act: "Lumen Ensemble" },
  { id: "crowd", photo: "/vetrina/lumen-festival/crowd.jpg", nameIt: "Sabato · Folla", nameEn: "Saturday · Crowd", act: "Coro di notte" },
  { id: "night", photo: "/vetrina/lumen-festival/night.jpg", nameIt: "Domenica · Chiusura", nameEn: "Sunday · Close", act: "Finale" },
] as const;

const INITIAL = { night: 0, screen: "poster" as "poster" | "night" | "pass", notice: "", touring: false };

export default function LumenFestivalApp() {
  const { locale } = useI18n();
  const chrome = demoChrome(locale);
  const { state, setState, patch, reset, later, clearTimers } = useDemoState(INITIAL);
  const night = NIGHTS[state.night] ?? NIGHTS[0];

  function startTour() {
    clearTimers();
    setState({ ...INITIAL, touring: true, notice: pickLine(locale, "Notte, palco, una festa.", "Night, a stage, one feast.") });
    later(800, () => setState((c) => ({ ...c, night: 0, screen: "night" })));
    later(2000, () => setState((c) => ({ ...c, screen: "pass", touring: false, notice: pickLine(locale, "Pass di prova. Nessun ingresso reale.", "Trial pass. No real entry.") })));
  }

  return (
    <DemoShell className="hx lf" demoId="lumen-festival" brand="Lumen Festival" prompt={PREMIUM_PROMPTS["lumen-festival"]} onReset={() => reset({ notice: pickLine(locale, "Palco spento.", "Stage dark.") })} onTour={startTour} tourActive={state.touring} {...chrome}>
      {state.notice ? <p className="hx-notice">{state.notice}</p> : null}
      {state.screen === "poster" ? (
        <section className="lf-poster">
          <p className="lf-kicker">{pickLine(locale, "Notte di palco", "Stage night")}</p>
          <h1>LUMEN</h1>
          <div>
            {NIGHTS.map((item, index) => (
              <button key={item.id} type="button" onClick={() => patch({ night: index, screen: "night" })}>
                <img src={item.photo} alt="" />
                <strong>{pickLine(locale, item.nameIt, item.nameEn)}</strong>
                <em>{item.act}</em>
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {state.screen === "night" ? (
        <section className="lf-night">
          <img src={night.photo} alt="" />
          <aside>
            <button type="button" className="hx-text" onClick={() => patch({ screen: "poster" })}>{pickLine(locale, "Programma", "Programme")}</button>
            <h2>{pickLine(locale, night.nameIt, night.nameEn)}</h2>
            <p>{night.act}</p>
            <button type="button" className="lf-go" onClick={() => patch({ screen: "pass" })}>{pickLine(locale, "Tieni il pass", "Hold the pass")}</button>
          </aside>
        </section>
      ) : null}
      {state.screen === "pass" ? (
        <section className="lf-pass">
          <img src={night.photo} alt="" />
          <div>
            <p className="lf-kicker">PASS</p>
            <h2>{night.act}</h2>
            <p>{pickLine(locale, night.nameIt, night.nameEn)}</p>
          </div>
        </section>
      ) : null}
    </DemoShell>
  );
}

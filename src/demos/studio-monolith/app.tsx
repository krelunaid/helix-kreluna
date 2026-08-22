import { DemoShell } from "@/demos/shell";
import { demoChrome, pickLine } from "@/demos/chrome";
import { PREMIUM_PROMPTS } from "@/demos/registry";
import { useDemoState } from "@/demos/use-demo";
import { useI18n } from "@/lib/i18n";
import "@/demos/atelier.css";
import "./styles.css";

const WORKS = [
  { id: "tower", photo: "/vetrina/studio-monolith/tower.jpg", nameIt: "Torre 04", nameEn: "Tower 04", mass: "18.400 m³" },
  { id: "plan", photo: "/vetrina/studio-monolith/plan.jpg", nameIt: "Pianta nera", nameEn: "Black plan", mass: "A0" },
  { id: "model", photo: "/vetrina/studio-monolith/model.jpg", nameIt: "Modello", nameEn: "Model", mass: "1:200" },
] as const;

const INITIAL = { work: 0, screen: "index" as "index" | "folio" | "request", note: "", notice: "", touring: false };

export default function StudioMonolithApp() {
  const { locale } = useI18n();
  const chrome = demoChrome(locale);
  const { state, setState, patch, reset, later, clearTimers } = useDemoState(INITIAL);
  const work = WORKS[state.work] ?? WORKS[0];

  function startTour() {
    clearTimers();
    setState({ ...INITIAL, touring: true, notice: pickLine(locale, "Pietra, studio, un volume.", "Stone, studio, one volume.") });
    later(800, () => setState((c) => ({ ...c, work: 0, screen: "folio" })));
    later(1800, () => setState((c) => ({ ...c, note: pickLine(locale, "Richiesta di sopralluogo.", "Site visit request.") })));
    later(2600, () => setState((c) => ({ ...c, screen: "request", touring: false, notice: pickLine(locale, "Richiesta locale. Nessun invio.", "Local request. Nothing sent.") })));
  }

  return (
    <DemoShell className="hx sm" demoId="studio-monolith" brand="Studio Monolith" prompt={PREMIUM_PROMPTS["studio-monolith"]} onReset={() => reset({ notice: pickLine(locale, "Tavolo pulito.", "Board cleared.") })} onTour={startTour} tourActive={state.touring} {...chrome}>
      {state.notice ? <p className="hx-notice">{state.notice}</p> : null}
      {state.screen === "index" ? (
        <section className="sm-index">
          <p className="sm-kicker">{pickLine(locale, "Atelier di volume", "Volume atelier")}</p>
          <h1>{pickLine(locale, "Un volume, una pianta.", "One volume, one plan.")}</h1>
          <div>
            {WORKS.map((item, index) => (
              <button key={item.id} type="button" onClick={() => patch({ work: index, screen: "folio" })}>
                <img src={item.photo} alt="" />
                <strong>{pickLine(locale, item.nameIt, item.nameEn)}</strong>
                <em>{item.mass}</em>
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {state.screen === "folio" ? (
        <section className="sm-folio">
          <img src={work.photo} alt="" />
          <aside>
            <button type="button" className="hx-text" onClick={() => patch({ screen: "index" })}>{pickLine(locale, "Indice", "Index")}</button>
            <h2>{pickLine(locale, work.nameIt, work.nameEn)}</h2>
            <p>{work.mass}</p>
            <textarea value={state.note} onChange={(e) => patch({ note: e.target.value })} placeholder={pickLine(locale, "Nota di progetto", "Project note")} />
            <button type="button" className="sm-go" onClick={() => patch({ screen: "request" })}>{pickLine(locale, "Richiedi", "Request")}</button>
          </aside>
        </section>
      ) : null}
      {state.screen === "request" ? (
        <section className="sm-req">
          <img src={work.photo} alt="" />
          <div>
            <p className="sm-kicker">{pickLine(locale, "Richiesta", "Request")}</p>
            <h2>{pickLine(locale, work.nameIt, work.nameEn)}</h2>
            <p>{state.note || work.mass}</p>
          </div>
        </section>
      ) : null}
    </DemoShell>
  );
}

import { DemoShell } from "@/demos/shell";
import { demoChrome, pickLine } from "@/demos/chrome";
import { PREMIUM_PROMPTS } from "@/demos/registry";
import { useDemoState } from "@/demos/use-demo";
import { useI18n } from "@/lib/i18n";
import "@/demos/atelier.css";
import "./styles.css";

const FILES = [
  { id: "vale", photo: "/vetrina/nexora/office.jpg", name: "Casa Vale", cityIt: "Milano · privata", cityEn: "Milan · private", noteIt: "Trust, tre sedi, un silenzio.", noteEn: "Trust, three seats, one silence." },
  { id: "nord", photo: "/vetrina/nexora/desk.jpg", name: "Nord Atelier", cityIt: "Zurigo · family", cityEn: "Zurich · family", noteIt: "Il dossier è più corto della voce.", noteEn: "The file is shorter than the voice." },
  { id: "lido", photo: "/vetrina/nexora/folio.jpg", name: "Lido Holding", cityIt: "Venezia · office", cityEn: "Venice · office", noteIt: "Una nota, poi si chiude.", noteEn: "One note, then it closes." },
] as const;

const INITIAL = { file: 0, note: "", screen: "desk" as "desk" | "folio" | "closed", notice: "", touring: false };

export default function NexoraCrmApp() {
  const { locale } = useI18n();
  const chrome = demoChrome(locale);
  const { state, setState, patch, reset, later, clearTimers } = useDemoState(INITIAL);
  const file = FILES[state.file] ?? FILES[0];

  function startTour() {
    clearTimers();
    setState({ ...INITIAL, touring: true, notice: pickLine(locale, "Clienti, silenzio, ordine.", "Clients, quiet, order.") });
    later(800, () => setState((c) => ({ ...c, file: 0, screen: "folio" })));
    later(1800, () => setState((c) => ({ ...c, note: pickLine(locale, "Chiusura discreta. Niente da inviare.", "Quiet close. Nothing to send.") })));
    later(2600, () => setState((c) => ({ ...c, screen: "closed", touring: false, notice: pickLine(locale, "Pratica chiusa in locale.", "File closed locally.") })));
  }

  return (
    <DemoShell className="hx nx" demoId="nexora-crm" brand="Nexora CRM" prompt={PREMIUM_PROMPTS["nexora-crm"]} onReset={() => reset({ notice: pickLine(locale, "Scrivania pulita.", "Desk cleared.") })} onTour={startTour} tourActive={state.touring} {...chrome}>
      {state.notice ? <p className="hx-notice">{state.notice}</p> : null}
      {state.screen === "desk" ? (
        <section className="nx-desk">
          <p className="nx-kicker">{pickLine(locale, "Scrivania privata", "Private desk")}</p>
          <h1>{pickLine(locale, "La clientela non è una pipeline.", "Clientele is not a pipeline.")}</h1>
          <ul>
            {FILES.map((item, index) => (
              <li key={item.id}>
                <button type="button" onClick={() => patch({ file: index, screen: "folio" })}>
                  <img src={item.photo} alt="" />
                  <span><strong>{item.name}</strong><em>{pickLine(locale, item.cityIt, item.cityEn)}</em></span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {state.screen === "folio" ? (
        <section className="nx-folio">
          <img src={file.photo} alt="" />
          <div>
            <button type="button" className="hx-text" onClick={() => patch({ screen: "desk" })}>{pickLine(locale, "Pratiche", "Files")}</button>
            <p className="nx-kicker">{pickLine(locale, file.cityIt, file.cityEn)}</p>
            <h2>{file.name}</h2>
            <p>{pickLine(locale, file.noteIt, file.noteEn)}</p>
            <textarea value={state.note} onChange={(e) => patch({ note: e.target.value })} placeholder={pickLine(locale, "Nota di casa", "House note")} />
            <button type="button" className="nx-close" onClick={() => patch({ screen: "closed" })}>{pickLine(locale, "Chiudi pratica", "Close file")}</button>
          </div>
        </section>
      ) : null}
      {state.screen === "closed" ? (
        <section className="nx-done">
          <img src={file.photo} alt="" />
          <div>
            <p className="nx-kicker">{pickLine(locale, "Chiusa", "Closed")}</p>
            <h2>{file.name}</h2>
            <p>{state.note || pickLine(locale, file.noteIt, file.noteEn)}</p>
          </div>
        </section>
      ) : null}
    </DemoShell>
  );
}

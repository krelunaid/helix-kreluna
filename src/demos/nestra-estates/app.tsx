import { DemoShell } from "@/demos/shell";
import { demoChrome, pickLine } from "@/demos/chrome";
import { PREMIUM_PROMPTS } from "@/demos/registry";
import { useDemoState } from "@/demos/use-demo";
import { useI18n } from "@/lib/i18n";
import "@/demos/atelier.css";
import "./styles.css";

const VILLAS = [
  { id: "villa", photo: "/vetrina/nestra/villa.jpg", nameIt: "Villa Nestra", nameEn: "Villa Nestra", seasonIt: "Tardo agosto", seasonEn: "Late August" },
  { id: "lawn", photo: "/vetrina/nestra/lawn.jpg", nameIt: "Prato lungo", nameEn: "Long lawn", seasonIt: "Giugno", seasonEn: "June" },
  { id: "court", photo: "/vetrina/nestra/court.jpg", nameIt: "Corte", nameEn: "Court", seasonIt: "Settembre", seasonEn: "September" },
] as const;

const INITIAL = { villa: 0, season: 0, screen: "land" as "land" | "gate" | "visit", notice: "", touring: false };

export default function NestraEstatesApp() {
  const { locale } = useI18n();
  const chrome = demoChrome(locale);
  const { state, setState, patch, reset, later, clearTimers } = useDemoState(INITIAL);
  const villa = VILLAS[state.villa] ?? VILLAS[0];

  function startTour() {
    clearTimers();
    setState({ ...INITIAL, touring: true, notice: pickLine(locale, "Terra, cancello, una villa.", "Land, a gate, one villa.") });
    later(800, () => setState((c) => ({ ...c, villa: 0, screen: "gate" })));
    later(1800, () => setState((c) => ({ ...c, season: 1 })));
    later(2600, () => setState((c) => ({ ...c, screen: "visit", touring: false, notice: pickLine(locale, "Visita tenuta in locale.", "Visit held locally.") })));
  }

  return (
    <DemoShell className="hx ne" demoId="nestra-estates" brand="Nestra Estates" prompt={PREMIUM_PROMPTS["nestra-estates"]} onReset={() => reset({ notice: pickLine(locale, "Cancello chiuso.", "Gate closed.") })} onTour={startTour} tourActive={state.touring} {...chrome}>
      {state.notice ? <p className="hx-notice">{state.notice}</p> : null}
      {state.screen === "land" ? (
        <section className="ne-land">
          <p className="ne-kicker">{pickLine(locale, "Concierge di terra", "Land concierge")}</p>
          <h1>{pickLine(locale, "Oltre il cancello.", "Beyond the gate.")}</h1>
          <div>
            {VILLAS.map((item, index) => (
              <button key={item.id} type="button" onClick={() => patch({ villa: index, screen: "gate" })}>
                <img src={item.photo} alt="" />
                <strong>{pickLine(locale, item.nameIt, item.nameEn)}</strong>
                <em>{pickLine(locale, item.seasonIt, item.seasonEn)}</em>
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {state.screen === "gate" ? (
        <section className="ne-gate">
          <img src={villa.photo} alt="" />
          <aside>
            <button type="button" className="hx-text" onClick={() => patch({ screen: "land" })}>{pickLine(locale, "Terre", "Lands")}</button>
            <h2>{pickLine(locale, villa.nameIt, villa.nameEn)}</h2>
            <div>
              {VILLAS.map((item, index) => (
                <button key={item.id} type="button" data-on={state.season === index} onClick={() => patch({ season: index })}>
                  {pickLine(locale, item.seasonIt, item.seasonEn)}
                </button>
              ))}
            </div>
            <button type="button" className="ne-go" onClick={() => patch({ screen: "visit" })}>{pickLine(locale, "Chiedi visita", "Request visit")}</button>
          </aside>
        </section>
      ) : null}
      {state.screen === "visit" ? (
        <section className="ne-visit">
          <img src={villa.photo} alt="" />
          <div>
            <p className="ne-kicker">{pickLine(locale, "Dossier", "Dossier")}</p>
            <h2>{pickLine(locale, villa.nameIt, villa.nameEn)}</h2>
            <p>{pickLine(locale, VILLAS[state.season].seasonIt, VILLAS[state.season].seasonEn)}</p>
          </div>
        </section>
      ) : null}
    </DemoShell>
  );
}

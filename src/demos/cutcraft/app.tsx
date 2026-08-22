import { DemoShell } from "@/demos/shell";
import { demoChrome, pickLine } from "@/demos/chrome";
import { PREMIUM_PROMPTS } from "@/demos/registry";
import { useDemoState } from "@/demos/use-demo";
import { useI18n } from "@/lib/i18n";
import "@/demos/atelier.css";
import "./styles.css";

const REELS = [
  { id: "night", photo: "/vetrina/cutcraft/reel.jpg", titleIt: "Notte 04", titleEn: "Night 04", dur: "02:18" },
  { id: "bench", photo: "/vetrina/cutcraft/bench.jpg", titleIt: "Banco", titleEn: "Bench", dur: "01:02" },
  { id: "grain", photo: "/vetrina/cutcraft/grain.jpg", titleIt: "Grana", titleEn: "Grain", dur: "00:47" },
] as const;

const INITIAL = { reel: 0, markIn: 12, markOut: 78, grade: false, screen: "bins" as "bins" | "cut" | "export", notice: "", touring: false };

export default function CutCraftApp() {
  const { locale } = useI18n();
  const chrome = demoChrome(locale);
  const { state, setState, patch, reset, later, clearTimers } = useDemoState(INITIAL);
  const reel = REELS[state.reel] ?? REELS[0];

  function startTour() {
    clearTimers();
    setState({ ...INITIAL, touring: true, notice: pickLine(locale, "Il tempo si taglia in sala.", "Time is cut in the room.") });
    later(800, () => setState((c) => ({ ...c, screen: "cut", reel: 0 })));
    later(1700, () => setState((c) => ({ ...c, markIn: 18, markOut: 64, grade: true })));
    later(2600, () => setState((c) => ({ ...c, screen: "export", touring: false, notice: pickLine(locale, "Export di prova. Niente è uscito dalla macchina.", "Trial export. Nothing left the machine.") })));
  }

  return (
    <DemoShell className="hx cc" demoId="cutcraft" brand="CutCraft" prompt={PREMIUM_PROMPTS.cutcraft} onReset={() => reset({ notice: pickLine(locale, "Sala azzerata.", "Suite cleared.") })} onTour={startTour} tourActive={state.touring} {...chrome}>
      {state.notice ? <p className="hx-notice">{state.notice}</p> : null}
      {state.screen === "bins" ? (
        <section className="cc-bins">
          <p className="cc-kicker">{pickLine(locale, "Cutting room", "Cutting room")}</p>
          <h1>{pickLine(locale, "In, out, grade.", "In, out, grade.")}</h1>
          <div className="cc-reels">
            {REELS.map((item, index) => (
              <button key={item.id} type="button" onClick={() => patch({ reel: index, screen: "cut" })}>
                <img src={item.photo} alt="" />
                <strong>{pickLine(locale, item.titleIt, item.titleEn)}</strong>
                <em>{item.dur}</em>
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {state.screen === "cut" ? (
        <section className="cc-cut">
          <div className="cc-monitor" data-grade={state.grade}>
            <img src={reel.photo} alt="" />
            <div className="cc-bar" style={{ left: `${state.markIn}%`, width: `${state.markOut - state.markIn}%` }} />
          </div>
          <aside>
            <button type="button" className="hx-text" onClick={() => patch({ screen: "bins" })}>{pickLine(locale, "Reel", "Reels")}</button>
            <h2>{pickLine(locale, reel.titleIt, reel.titleEn)}</h2>
            <label>{pickLine(locale, "In", "In")}<input type="range" min={0} max={70} value={state.markIn} onChange={(e) => patch({ markIn: Number(e.target.value) })} /></label>
            <label>{pickLine(locale, "Out", "Out")}<input type="range" min={30} max={100} value={state.markOut} onChange={(e) => patch({ markOut: Number(e.target.value) })} /></label>
            <button type="button" data-on={state.grade} onClick={() => patch({ grade: !state.grade })}>{pickLine(locale, "Grade", "Grade")}</button>
            <button type="button" className="cc-go" onClick={() => patch({ screen: "export" })}>{pickLine(locale, "Export di prova", "Trial export")}</button>
          </aside>
        </section>
      ) : null}
      {state.screen === "export" ? (
        <section className="cc-export">
          <img src={reel.photo} alt="" />
          <div>
            <p className="cc-kicker">{pickLine(locale, "Pronto", "Ready")}</p>
            <h2>{pickLine(locale, "Taglio chiuso.", "Cut closed.")}</h2>
            <p>{state.markIn} → {state.markOut}{state.grade ? " · grade" : ""}</p>
          </div>
        </section>
      ) : null}
    </DemoShell>
  );
}

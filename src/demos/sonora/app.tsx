import { DemoShell } from "@/demos/shell";
import { demoChrome, pickLine } from "@/demos/chrome";
import { PREMIUM_PROMPTS } from "@/demos/registry";
import { useDemoState } from "@/demos/use-demo";
import { useI18n } from "@/lib/i18n";
import "@/demos/atelier.css";
import "./styles.css";

const TRACKS = [
  { id: "vinyl", photo: "/vetrina/sonora/vinyl.jpg", titleIt: "Lato A", titleEn: "Side A", bpm: 92 },
  { id: "stage", photo: "/vetrina/sonora/stage.jpg", titleIt: "Palco vuoto", titleEn: "Empty stage", bpm: 108 },
  { id: "desk", photo: "/vetrina/sonora/desk.jpg", titleIt: "Rame", titleEn: "Copper", bpm: 76 },
] as const;

const INITIAL = { track: 0, mix: [40, 55, 35], screen: "crate" as "crate" | "desk" | "master", notice: "", touring: false };

export default function SonoraApp() {
  const { locale } = useI18n();
  const chrome = demoChrome(locale);
  const { state, setState, patch, reset, later, clearTimers } = useDemoState(INITIAL);
  const track = TRACKS[state.track] ?? TRACKS[0];

  function startTour() {
    clearTimers();
    setState({ ...INITIAL, touring: true, notice: pickLine(locale, "Ascolto, stanza, un accordo.", "Listening, a room, one chord.") });
    later(800, () => setState((c) => ({ ...c, screen: "desk", track: 0 })));
    later(1800, () => setState((c) => ({ ...c, mix: [62, 48, 30] })));
    later(2600, () => setState((c) => ({ ...c, screen: "master", touring: false, notice: pickLine(locale, "Master di prova. Resta in stanza.", "Trial master. Stays in the room.") })));
  }

  return (
    <DemoShell className="hx so" demoId="sonora" brand="Sonora" prompt={PREMIUM_PROMPTS.sonora} onReset={() => reset({ notice: pickLine(locale, "Silenzio.", "Silence.") })} onTour={startTour} tourActive={state.touring} {...chrome}>
      {state.notice ? <p className="hx-notice">{state.notice}</p> : null}
      {state.screen === "crate" ? (
        <section className="so-crate">
          <p className="so-kicker">{pickLine(locale, "Studio di ascolto", "Listening studio")}</p>
          <h1>{pickLine(locale, "Il mix è un rito.", "Mixing is a rite.")}</h1>
          <div className="so-tracks">
            {TRACKS.map((item, index) => (
              <button key={item.id} type="button" onClick={() => patch({ track: index, screen: "desk" })}>
                <img src={item.photo} alt="" />
                <strong>{pickLine(locale, item.titleIt, item.titleEn)}</strong>
                <em>{item.bpm} bpm</em>
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {state.screen === "desk" ? (
        <section className="so-desk">
          <div className="so-vinyl"><img src={track.photo} alt="" /><i style={{ transform: `rotate(${state.mix[0] * 3}deg)` }} /></div>
          <aside>
            <button type="button" className="hx-text" onClick={() => patch({ screen: "crate" })}>{pickLine(locale, "Cassa", "Crate")}</button>
            <h2>{pickLine(locale, track.titleIt, track.titleEn)}</h2>
            {["Low", "Mid", "Air"].map((name, index) => (
              <label key={name}>
                {name}
                <input type="range" min={0} max={100} value={state.mix[index]} onChange={(e) => {
                  const mix = [...state.mix];
                  mix[index] = Number(e.target.value);
                  patch({ mix });
                }} />
              </label>
            ))}
            <button type="button" className="so-go" onClick={() => patch({ screen: "master" })}>{pickLine(locale, "Master di prova", "Trial master")}</button>
          </aside>
        </section>
      ) : null}
      {state.screen === "master" ? (
        <section className="so-master">
          <img src={track.photo} alt="" />
          <div>
            <p className="so-kicker">{pickLine(locale, "Master", "Master")}</p>
            <h2>{pickLine(locale, "L’accordo resta qui.", "The chord stays here.")}</h2>
            <p>{state.mix.join(" / ")}</p>
          </div>
        </section>
      ) : null}
    </DemoShell>
  );
}

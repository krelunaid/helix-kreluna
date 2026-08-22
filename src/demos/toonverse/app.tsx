import { DemoShell } from "@/demos/shell";
import { demoChrome, pickLine } from "@/demos/chrome";
import { PREMIUM_PROMPTS } from "@/demos/registry";
import { useDemoState } from "@/demos/use-demo";
import { useI18n } from "@/lib/i18n";
import "@/demos/atelier.css";
import "./styles.css";

const FRAMES = [
  { id: "ink", photo: "/vetrina/toonverse/ink.jpg", titleIt: "Inchiostro", titleEn: "Ink", beatIt: "Il primo tratto, ancora umido.", beatEn: "The first stroke, still wet." },
  { id: "desk", photo: "/vetrina/toonverse/desk.jpg", titleIt: "Banco", titleEn: "Desk", beatIt: "Carta, lampada, un mondo in dodici fogli.", beatEn: "Paper, lamp, a world in twelve sheets." },
  { id: "wall", photo: "/vetrina/toonverse/wall.jpg", titleIt: "Muro", titleEn: "Wall", beatIt: "Le pose, appese come un respiro.", beatEn: "Poses hung like a breath." },
] as const;

const POSES = ["rest", "step", "turn", "leap"] as const;

const INITIAL = {
  screen: "board" as "board" | "desk" | "play",
  frame: 0,
  pose: 0,
  onion: true,
  playing: false,
  notice: "",
  touring: false,
};

export default function ToonVerseApp() {
  const { locale } = useI18n();
  const chrome = demoChrome(locale);
  const { state, setState, patch, reset, later, clearTimers } = useDemoState(INITIAL);
  const frame = FRAMES[state.frame] ?? FRAMES[0];

  function startTour() {
    clearTimers();
    setState({ ...INITIAL, touring: true, notice: pickLine(locale, "Inchiostro, movimento, un mondo.", "Ink, motion, one world.") });
    later(800, () => setState((c) => ({ ...c, frame: 1, screen: "desk" })));
    later(1700, () => setState((c) => ({ ...c, pose: 2, onion: true })));
    later(2600, () => setState((c) => ({ ...c, screen: "play", playing: true, touring: false, notice: pickLine(locale, "Playback locale. Nessun file è uscito dal banco.", "Local playback. Nothing left the desk.") })));
  }

  return (
    <DemoShell
      className="hx tv"
      demoId="toonverse"
      brand="ToonVerse"
      prompt={PREMIUM_PROMPTS.toonverse}
      onReset={() => reset({ notice: pickLine(locale, "Tavolo pulito.", "Desk cleared.") })}
      onTour={startTour}
      tourActive={state.touring}
      {...chrome}
    >
      {state.notice ? <p className="hx-notice">{state.notice}</p> : null}

      {state.screen === "board" ? (
        <section className="tv-board">
          <header className="tv-mast">
            <p className="tv-kicker">{pickLine(locale, "Tavolo di animazione", "Animation desk")}</p>
            <h1>{pickLine(locale, "Dodici fogli, un mondo.", "Twelve sheets, one world.")}</h1>
            <p>{pickLine(locale, "Inchiostro e carta, non clipart.", "Ink and paper, not clipart.")}</p>
          </header>
          <ol className="tv-strip">
            {FRAMES.map((item, index) => (
              <li key={item.id}>
                <button type="button" onClick={() => patch({ frame: index, screen: "desk" })}>
                  <img src={item.photo} alt="" />
                  <span>
                    <strong>{pickLine(locale, item.titleIt, item.titleEn)}</strong>
                    <em>{pickLine(locale, item.beatIt, item.beatEn)}</em>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {state.screen === "desk" ? (
        <section className="tv-desk">
          <div className="tv-paper" data-pose={POSES[state.pose]} data-onion={state.onion}>
            <img src={frame.photo} alt="" />
            <svg viewBox="0 0 200 240" aria-hidden="true">
              <ellipse className="tv-body" cx="100" cy="150" rx="36" ry="48" />
              <circle className="tv-head" cx="100" cy="78" r="28" />
              <path className="tv-limb" d="M70 150 Q40 190 48 220" />
              <path className="tv-limb tv-arm" d="M128 128 Q168 110 176 78" />
            </svg>
          </div>
          <aside>
            <button type="button" className="hx-text" onClick={() => patch({ screen: "board" })}>
              {pickLine(locale, "Storyboard", "Storyboard")}
            </button>
            <p className="tv-kicker">{pickLine(locale, frame.titleIt, frame.titleEn)}</p>
            <h2>{pickLine(locale, frame.beatIt, frame.beatEn)}</h2>
            <div className="tv-poses">
              {POSES.map((pose, index) => (
                <button key={pose} type="button" data-on={state.pose === index} onClick={() => patch({ pose: index })}>
                  {pose}
                </button>
              ))}
            </div>
            <button type="button" className="tv-chip" data-on={state.onion} onClick={() => patch({ onion: !state.onion })}>
              {pickLine(locale, "Cipolla", "Onion skin")}
            </button>
            <button type="button" className="tv-play" onClick={() => patch({ screen: "play", playing: true })}>
              {pickLine(locale, "Playback", "Playback")}
            </button>
          </aside>
        </section>
      ) : null}

      {state.screen === "play" ? (
        <section className="tv-playback" data-playing={state.playing}>
          {FRAMES.map((item) => (
            <img key={item.id} src={item.photo} alt="" />
          ))}
          <div>
            <p className="tv-kicker">{pickLine(locale, "Loop locale", "Local loop")}</p>
            <h2>{pickLine(locale, "Il mondo gira sul banco.", "The world turns on the desk.")}</h2>
            <p>{pickLine(locale, "Nessun file è uscito dalla stanza.", "Nothing left the room.")}</p>
          </div>
        </section>
      ) : null}
    </DemoShell>
  );
}

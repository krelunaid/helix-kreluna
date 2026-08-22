import { DemoShell } from "@/demos/shell";
import { demoChrome, pickLine } from "@/demos/chrome";
import { PREMIUM_PROMPTS } from "@/demos/registry";
import { useDemoState } from "@/demos/use-demo";
import { useI18n } from "@/lib/i18n";
import "@/demos/atelier.css";
import "./styles.css";

const ROOMS = [
  { id: "salon", photo: "/vetrina/roomverse/salon.jpg", nameIt: "Salone", nameEn: "Salon", noteIt: "Stucchi, un divano, la luce del pomeriggio.", noteEn: "Stucco, one sofa, afternoon light." },
  { id: "suite", photo: "/vetrina/roomverse/suite.jpg", nameIt: "Suite", nameEn: "Suite", noteIt: "Letto basso, pietra calda, un ospite solo.", noteEn: "Low bed, warm stone, one guest." },
  { id: "stone", photo: "/vetrina/roomverse/stone.jpg", nameIt: "Pietra", nameEn: "Stone", noteIt: "Il pavimento tiene la misura.", noteEn: "The floor holds the measure." },
] as const;

const MATERIALS = [
  { id: "linen", it: "Lino", en: "Linen" },
  { id: "walnut", it: "Noce", en: "Walnut" },
  { id: "stone", it: "Pietra", en: "Stone" },
] as const;

const FURNITURE = [
  { id: "sofa", x: 28, y: 62, it: "Divano", en: "Sofa" },
  { id: "lamp", x: 68, y: 30, it: "Lampada", en: "Lamp" },
  { id: "table", x: 52, y: 48, it: "Tavolo", en: "Table" },
] as const;

const INITIAL = {
  room: 0,
  material: 0,
  placed: ["sofa"] as string[],
  screen: "rooms" as "rooms" | "plan" | "saved",
  notice: "",
  touring: false,
};

export default function RoomVerseApp() {
  const { locale } = useI18n();
  const chrome = demoChrome(locale);
  const { state, setState, patch, reset, later, clearTimers } = useDemoState(INITIAL);
  const room = ROOMS[state.room] ?? ROOMS[0];

  function toggle(id: string) {
    patch({
      placed: state.placed.includes(id) ? state.placed.filter((item) => item !== id) : [...state.placed, id],
    });
  }

  function startTour() {
    clearTimers();
    setState({ ...INITIAL, touring: true, notice: pickLine(locale, "Stanze, misura, un ospite.", "Rooms, measure, one guest.") });
    later(800, () => setState((c) => ({ ...c, room: 1, screen: "plan" })));
    later(1700, () => setState((c) => ({ ...c, material: 2, placed: ["sofa", "lamp"] })));
    later(2600, () =>
      setState((c) => ({
        ...c,
        screen: "saved",
        touring: false,
        notice: pickLine(locale, "Layout salvato in locale.", "Layout saved locally."),
      })),
    );
  }

  return (
    <DemoShell
      className="hx rv"
      demoId="roomverse"
      brand="RoomVerse"
      prompt={PREMIUM_PROMPTS.roomverse}
      onReset={() => reset({ notice: pickLine(locale, "Stanza vuota.", "Room cleared.") })}
      onTour={startTour}
      tourActive={state.touring}
      {...chrome}
    >
      {state.notice ? <p className="hx-notice">{state.notice}</p> : null}

      {state.screen === "rooms" ? (
        <section className="rv-rooms">
          <header>
            <p className="rv-kicker">{pickLine(locale, "Atelier di interni", "Interior atelier")}</p>
            <h1>{pickLine(locale, "Una stanza, una misura.", "One room, one measure.")}</h1>
          </header>
          <div className="rv-grid">
            {ROOMS.map((item, index) => (
              <button key={item.id} type="button" onClick={() => patch({ room: index, screen: "plan" })}>
                <img src={item.photo} alt="" />
                <strong>{pickLine(locale, item.nameIt, item.nameEn)}</strong>
                <em>{pickLine(locale, item.noteIt, item.noteEn)}</em>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {state.screen === "plan" ? (
        <section className="rv-plan">
          <div className="rv-stage" data-material={MATERIALS[state.material].id}>
            <img src={room.photo} alt={pickLine(locale, room.nameIt, room.nameEn)} />
            {FURNITURE.map((item) =>
              state.placed.includes(item.id) ? (
                <span key={item.id} className="rv-dot" style={{ left: `${item.x}%`, top: `${item.y}%` }}>
                  {pickLine(locale, item.it, item.en)}
                </span>
              ) : null,
            )}
          </div>
          <aside>
            <button type="button" className="hx-text" onClick={() => patch({ screen: "rooms" })}>
              {pickLine(locale, "Stanze", "Rooms")}
            </button>
            <p className="rv-kicker">{pickLine(locale, room.nameIt, room.nameEn)}</p>
            <h2>{pickLine(locale, room.noteIt, room.noteEn)}</h2>
            <div className="rv-swatches">
              {MATERIALS.map((item, index) => (
                <button key={item.id} type="button" data-on={state.material === index} onClick={() => patch({ material: index })}>
                  {pickLine(locale, item.it, item.en)}
                </button>
              ))}
            </div>
            <div className="rv-furn">
              {FURNITURE.map((item) => (
                <button key={item.id} type="button" data-on={state.placed.includes(item.id)} onClick={() => toggle(item.id)}>
                  {pickLine(locale, item.it, item.en)}
                </button>
              ))}
            </div>
            <button type="button" className="rv-save" onClick={() => patch({ screen: "saved" })}>
              {pickLine(locale, "Salva layout", "Save layout")}
            </button>
          </aside>
        </section>
      ) : null}

      {state.screen === "saved" ? (
        <section className="rv-saved">
          <img src={room.photo} alt="" />
          <div>
            <p className="rv-kicker">{pickLine(locale, "Ospite", "Guest")}</p>
            <h2>{pickLine(locale, "La stanza è pronta.", "The room is ready.")}</h2>
            <p>
              {pickLine(locale, MATERIALS[state.material].it, MATERIALS[state.material].en)} · {state.placed.length}{" "}
              {pickLine(locale, "pezzi", "pieces")}
            </p>
          </div>
        </section>
      ) : null}
    </DemoShell>
  );
}

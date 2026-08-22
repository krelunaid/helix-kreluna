import { DemoShell } from "@/demos/shell";
import { demoChrome, pickLine } from "@/demos/chrome";
import { PREMIUM_PROMPTS } from "@/demos/registry";
import { useDemoState } from "@/demos/use-demo";
import { useI18n } from "@/lib/i18n";
import "@/demos/atelier.css";
import "./styles.css";

const LOOKS = [
  { id: "look", photo: "/vetrina/vela-noir/look.jpg", nameIt: "Notte 03", nameEn: "Night 03", clothIt: "Seta nera", clothEn: "Black silk" },
  { id: "runway", photo: "/vetrina/vela-noir/runway.jpg", nameIt: "Passarella", nameEn: "Runway", clothIt: "Lana umida", clothEn: "Damp wool" },
  { id: "atelier", photo: "/vetrina/vela-noir/atelier.jpg", nameIt: "Atelier", nameEn: "Atelier", clothIt: "Tulle", clothEn: "Tulle" },
] as const;

const SIZES = ["XS", "S", "M", "L"] as const;
const INITIAL = { look: 0, size: "M", screen: "book" as "book" | "cloth" | "wardrobe", notice: "", touring: false };

export default function VelaNoirApp() {
  const { locale } = useI18n();
  const chrome = demoChrome(locale);
  const { state, setState, patch, reset, later, clearTimers } = useDemoState(INITIAL);
  const look = LOOKS[state.look] ?? LOOKS[0];

  function startTour() {
    clearTimers();
    setState({ ...INITIAL, touring: true, notice: pickLine(locale, "Seta, notte, un tessuto.", "Silk, night, one cloth.") });
    later(800, () => setState((c) => ({ ...c, look: 0, screen: "cloth" })));
    later(1800, () => setState((c) => ({ ...c, size: "S" })));
    later(2600, () => setState((c) => ({ ...c, screen: "wardrobe", touring: false, notice: pickLine(locale, "Guardaroba locale. Nessun ordine.", "Local wardrobe. No order.") })));
  }

  return (
    <DemoShell className="hx vn" demoId="vela-noir" brand="Vela Noir" prompt={PREMIUM_PROMPTS["vela-noir"]} onReset={() => reset({ notice: pickLine(locale, "Seta riposta.", "Silk put away.") })} onTour={startTour} tourActive={state.touring} {...chrome}>
      {state.notice ? <p className="hx-notice">{state.notice}</p> : null}
      {state.screen === "book" ? (
        <section className="vn-book">
          <p className="vn-kicker">{pickLine(locale, "Lookbook notturno", "Night lookbook")}</p>
          <h1>{pickLine(locale, "Un tessuto, una notte.", "One cloth, one night.")}</h1>
          <div>
            {LOOKS.map((item, index) => (
              <button key={item.id} type="button" onClick={() => patch({ look: index, screen: "cloth" })}>
                <img src={item.photo} alt="" />
                <strong>{pickLine(locale, item.nameIt, item.nameEn)}</strong>
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {state.screen === "cloth" ? (
        <section className="vn-cloth">
          <img src={look.photo} alt="" />
          <aside>
            <button type="button" className="hx-text" onClick={() => patch({ screen: "book" })}>{pickLine(locale, "Look", "Looks")}</button>
            <h2>{pickLine(locale, look.nameIt, look.nameEn)}</h2>
            <p>{pickLine(locale, look.clothIt, look.clothEn)}</p>
            <div>
              {SIZES.map((size) => (
                <button key={size} type="button" data-on={state.size === size} onClick={() => patch({ size })}>{size}</button>
              ))}
            </div>
            <button type="button" className="vn-go" onClick={() => patch({ screen: "wardrobe" })}>{pickLine(locale, "Tieni nel guardaroba", "Hold in wardrobe")}</button>
          </aside>
        </section>
      ) : null}
      {state.screen === "wardrobe" ? (
        <section className="vn-ward">
          <img src={look.photo} alt="" />
          <div>
            <p className="vn-kicker">{pickLine(locale, "Guardaroba", "Wardrobe")}</p>
            <h2>{state.size}</h2>
            <p>{pickLine(locale, look.clothIt, look.clothEn)}</p>
          </div>
        </section>
      ) : null}
    </DemoShell>
  );
}

import { DemoShell } from "@/demos/shell";
import { demoChrome, pickLine } from "@/demos/chrome";
import { PREMIUM_PROMPTS } from "@/demos/registry";
import { useDemoState } from "@/demos/use-demo";
import { useI18n } from "@/lib/i18n";
import "@/demos/atelier.css";
import "./styles.css";

const BIOMES = [
  { id: "ridge", photo: "/vetrina/worldforge/ridge.jpg", nameIt: "Cresta", nameEn: "Ridge", ruleIt: "Niente strade dritte.", ruleEn: "No straight roads." },
  { id: "forest", photo: "/vetrina/worldforge/forest.jpg", nameIt: "Bosco", nameEn: "Forest", ruleIt: "Luce solo a chiazze.", ruleEn: "Light only in patches." },
  { id: "dune", photo: "/vetrina/worldforge/dune.jpg", nameIt: "Duna", nameEn: "Dune", ruleIt: "Il vento decide i nomi.", ruleEn: "Wind names the places." },
] as const;

const INITIAL = { biome: 0, seed: 27, screen: "forge" as "forge" | "rule" | "world", notice: "", touring: false };

export default function WorldForgeApp() {
  const { locale } = useI18n();
  const chrome = demoChrome(locale);
  const { state, setState, patch, reset, later, clearTimers } = useDemoState(INITIAL);
  const biome = BIOMES[state.biome] ?? BIOMES[0];

  function startTour() {
    clearTimers();
    setState({ ...INITIAL, touring: true, notice: pickLine(locale, "Mondo, forgia, una regola.", "A world, a forge, one rule.") });
    later(800, () => setState((c) => ({ ...c, biome: 2, screen: "rule" })));
    later(1800, () => setState((c) => ({ ...c, seed: 81 })));
    later(2600, () => setState((c) => ({ ...c, screen: "world", touring: false, notice: pickLine(locale, "Mondo generato in locale.", "World generated locally.") })));
  }

  return (
    <DemoShell className="hx wf" demoId="worldforge" brand="WorldForge" prompt={PREMIUM_PROMPTS.worldforge} onReset={() => reset({ notice: pickLine(locale, "Forgia spenta.", "Forge cold.") })} onTour={startTour} tourActive={state.touring} {...chrome}>
      {state.notice ? <p className="hx-notice">{state.notice}</p> : null}
      {state.screen === "forge" ? (
        <section className="wf-forge">
          <p className="wf-kicker">{pickLine(locale, "Forgia di mondi", "World forge")}</p>
          <h1>{pickLine(locale, "Una regola, un suolo.", "One rule, one soil.")}</h1>
          <div>
            {BIOMES.map((item, index) => (
              <button key={item.id} type="button" onClick={() => patch({ biome: index, screen: "rule" })}>
                <img src={item.photo} alt="" />
                <strong>{pickLine(locale, item.nameIt, item.nameEn)}</strong>
                <em>{pickLine(locale, item.ruleIt, item.ruleEn)}</em>
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {state.screen === "rule" ? (
        <section className="wf-rule">
          <img src={biome.photo} alt="" />
          <aside>
            <button type="button" className="hx-text" onClick={() => patch({ screen: "forge" })}>{pickLine(locale, "Biomi", "Biomes")}</button>
            <h2>{pickLine(locale, biome.nameIt, biome.nameEn)}</h2>
            <p>{pickLine(locale, biome.ruleIt, biome.ruleEn)}</p>
            <label>
              Seed
              <input type="range" min={1} max={99} value={state.seed} onChange={(e) => patch({ seed: Number(e.target.value) })} />
              <output>{state.seed}</output>
            </label>
            <button type="button" className="wf-go" onClick={() => patch({ screen: "world" })}>{pickLine(locale, "Genera regione", "Generate region")}</button>
          </aside>
        </section>
      ) : null}
      {state.screen === "world" ? (
        <section className="wf-world">
          <img src={biome.photo} alt="" />
          <div>
            <p className="wf-kicker">SEED {state.seed}</p>
            <h2>{pickLine(locale, biome.nameIt, biome.nameEn)}</h2>
            <p>{pickLine(locale, biome.ruleIt, biome.ruleEn)}</p>
          </div>
        </section>
      ) : null}
    </DemoShell>
  );
}

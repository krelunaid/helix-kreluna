import { useEffect, useRef, useState, type CSSProperties } from "react";
import { DemoShell } from "@/demos/shell";
import { PREMIUM_PROMPTS, premiumDemoTitle, type PremiumDemoId } from "@/demos/registry";
import { demoSpec, type DemoItem, type DemoSpec, type Line } from "@/demos/specs";
import { useI18n } from "@/lib/i18n";
import "./themes.css";

const SHARED = {
  it: {
    back: "Vetrina",
    reset: "Ricomincia",
    tour: "Percorso guidato",
    touring: "In corso",
    made: "Demo interattiva realizzata con Helix",
    create: "Crea qualcosa di simile",
    open: "Apri",
    next: "Continua",
    backStep: "Indietro",
    confirm: "Conferma",
    days: "Giorni",
    size: "Taglia",
    note: "Nota",
    grade: "Grade",
    markIn: "In",
    markOut: "Out",
    seed: "Seed",
    layer: "Strato",
    material: "Materiale",
  },
  en: {
    back: "Showcase",
    reset: "Start over",
    tour: "Guided path",
    touring: "In progress",
    made: "Interactive demo made with Helix",
    create: "Create something like this",
    open: "Open",
    next: "Continue",
    backStep: "Back",
    confirm: "Confirm",
    days: "Days",
    size: "Size",
    note: "Note",
    grade: "Grade",
    markIn: "In",
    markOut: "Out",
    seed: "Seed",
    layer: "Layer",
    material: "Material",
  },
} as const;

function line(locale: string, value: Line) {
  return locale === "it" ? value.it : value.en;
}

export default function PremiumPlayer({ id }: { id: PremiumDemoId }) {
  const { locale } = useI18n();
  if (id === "velvet-table") return null;
  const spec = demoSpec(id);
  const ui = locale === "it" ? SHARED.it : SHARED.en;
  const [screen, setScreen] = useState(0);
  const [itemId, setItemId] = useState(spec.items[0]?.id ?? "");
  const [touring, setTouring] = useState(false);
  const [notice, setNotice] = useState("");
  const [markIn, setMarkIn] = useState(12);
  const [markOut, setMarkOut] = useState(78);
  const [grade, setGrade] = useState(false);
  const [mix, setMix] = useState([40, 55, 35]);
  const [note, setNote] = useState("");
  const [pose, setPose] = useState(0);
  const [days, setDays] = useState(2);
  const [size, setSize] = useState("M");
  const [layer, setLayer] = useState(0);
  const [material, setMaterial] = useState(0);
  const [seed, setSeed] = useState(27);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      for (const timer of timers.current) window.clearTimeout(timer);
    };
  }, []);

  function later(ms: number, fn: () => void) {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = window.setTimeout(fn, reduced ? 40 : ms);
    timers.current.push(id);
  }

  function reset() {
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];
    setScreen(0);
    setItemId(spec.items[0]?.id ?? "");
    setTouring(false);
    setNotice(line(locale, spec.notice));
    setMarkIn(12);
    setMarkOut(78);
    setGrade(false);
    setMix([40, 55, 35]);
    setNote("");
    setPose(0);
    setDays(2);
    setSize("M");
    setLayer(0);
    setMaterial(0);
    setSeed(27);
  }

  function startTour() {
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];
    setTouring(true);
    setScreen(0);
    setItemId(spec.items[0]?.id ?? "");
    setNotice(line(locale, spec.lead));
    later(700, () => setScreen(1));
    later(1500, () => {
      setItemId(spec.items[0]?.id ?? "");
      setScreen(2);
    });
    later(2400, () => {
      setScreen(3);
      setGrade(true);
      setDays(3);
      setSize("M");
      setMaterial(1);
    });
    later(3400, () => {
      setScreen(4);
      setTouring(false);
      setNotice(line(locale, spec.notice));
    });
  }

  const item = spec.items.find((entry) => entry.id === itemId) ?? spec.items[0];

  return (
    <DemoShell
      className="hx"
      demoId={spec.id}
      brand={premiumDemoTitle(spec.id, locale)}
      back={ui.back}
      reset={ui.reset}
      tour={ui.tour}
      touring={ui.touring}
      made={ui.made}
      create={ui.create}
      prompt={PREMIUM_PROMPTS[spec.id]}
      style={
        {
          "--hx-ink": spec.ink,
          "--hx-cream": spec.cream,
          "--hx-accent": spec.accent,
          "--hx-mute": spec.mute,
          "--hx-serif": spec.serif,
        } as CSSProperties
      }
      layout={spec.layout}
      onReset={reset}
      onTour={startTour}
      tourActive={touring}
    >
      <div data-layout={spec.layout} style={{ minHeight: "100%" }}>
        {notice ? <p className="hx-notice">{notice}</p> : null}
        {screen === 0 ? (
          <Hero spec={spec} locale={locale} onOpen={(next) => { setItemId(next); setScreen(1); }} />
        ) : null}
        {screen === 1 ? (
          <Board
            spec={spec}
            locale={locale}
            ui={ui}
            onBack={() => setScreen(0)}
            onOpen={(next) => { setItemId(next); setScreen(2); }}
          />
        ) : null}
        {screen >= 2 && item ? (
          <Detail
            spec={spec}
            item={item}
            locale={locale}
            ui={ui}
            screen={screen}
            markIn={markIn}
            markOut={markOut}
            grade={grade}
            mix={mix}
            note={note}
            pose={pose}
            days={days}
            size={size}
            layer={layer}
            material={material}
            seed={seed}
            onBack={() => setScreen(Math.max(0, screen - 1))}
            onNext={() => setScreen(Math.min(4, screen + 1))}
            onMarkIn={setMarkIn}
            onMarkOut={setMarkOut}
            onGrade={setGrade}
            onMix={setMix}
            onNote={setNote}
            onPose={setPose}
            onDays={setDays}
            onSize={setSize}
            onLayer={setLayer}
            onMaterial={setMaterial}
            onSeed={setSeed}
          />
        ) : null}
      </div>
    </DemoShell>
  );
}

function Hero({
  spec,
  locale,
  onOpen,
}: {
  spec: DemoSpec;
  locale: string;
  onOpen: (id: string) => void;
}) {
  return (
    <section className="hx-hero">
      <img src={spec.hero} alt="" />
      <div className="hx-veil" />
      <p className="hx-word">{line(locale, spec.word)}</p>
      <div className="hx-copy">
        <p className="hx-kicker">{line(locale, spec.kicker)}</p>
        <h1 className="hx-display">{line(locale, spec.title)}</h1>
        <p className="hx-lead">{line(locale, spec.lead)}</p>
      </div>
      <div className="hx-doors">
        {spec.items.slice(0, 3).map((item) => (
          <button key={item.id} type="button" className="hx-door" onClick={() => onOpen(item.id)}>
            <p className="hx-meta">{line(locale, item.meta)}</p>
            <strong>{line(locale, item.title)}</strong>
            <span className="hx-lead">{line(locale, item.note)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function Board({
  spec,
  locale,
  ui,
  onBack,
  onOpen,
}: {
  spec: DemoSpec;
  locale: string;
  ui: (typeof SHARED)["it"] | (typeof SHARED)["en"];
  onBack: () => void;
  onOpen: (id: string) => void;
}) {
  return (
    <section className="hx-page">
      <button type="button" className="hx-text" onClick={onBack}>
        {ui.backStep}
      </button>
      <p className="hx-kicker">{line(locale, spec.kicker)}</p>
      <h2 className="hx-display">{line(locale, spec.board)}</h2>
      <div className="hx-grid">
        {spec.items.map((item) => (
          <button key={item.id} type="button" className="hx-card" onClick={() => onOpen(item.id)}>
            <img src={item.photo} alt="" />
            <div>
              <p className="hx-meta">{line(locale, item.meta)}</p>
              <h3>{line(locale, item.title)}</h3>
              <p className="hx-lead">{line(locale, item.note)}</p>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function Detail({
  spec,
  item,
  locale,
  ui,
  screen,
  markIn,
  markOut,
  grade,
  mix,
  note,
  pose,
  days,
  size,
  layer,
  material,
  seed,
  onBack,
  onNext,
  onMarkIn,
  onMarkOut,
  onGrade,
  onMix,
  onNote,
  onPose,
  onDays,
  onSize,
  onLayer,
  onMaterial,
  onSeed,
}: {
  spec: DemoSpec;
  item: DemoItem;
  locale: string;
  ui: (typeof SHARED)["it"] | (typeof SHARED)["en"];
  screen: number;
  markIn: number;
  markOut: number;
  grade: boolean;
  mix: number[];
  note: string;
  pose: number;
  days: number;
  size: string;
  layer: number;
  material: number;
  seed: number;
  onBack: () => void;
  onNext: () => void;
  onMarkIn: (value: number) => void;
  onMarkOut: (value: number) => void;
  onGrade: (value: boolean) => void;
  onMix: (value: number[]) => void;
  onNote: (value: string) => void;
  onPose: (value: number) => void;
  onDays: (value: number) => void;
  onSize: (value: string) => void;
  onLayer: (value: number) => void;
  onMaterial: (value: number) => void;
  onSeed: (value: number) => void;
}) {
  const materials = [
    { it: "Noce", en: "Walnut", color: "#6b4a2e" },
    { it: "Ottone", en: "Brass", color: "#c4a574" },
    { it: "Pietra", en: "Stone", color: "#8a8378" },
  ];
  const layers = [
    { it: "Vento", en: "Wind" },
    { it: "Mare", en: "Sea" },
    { it: "Neve", en: "Snow" },
  ];
  return (
    <section className="hx-split">
      <div className="hx-bleed">
        {spec.items.map((entry) => (
          <img
            key={entry.id}
            src={entry.photo}
            alt=""
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              opacity: entry.id === item.id ? 1 : 0,
              transition: "opacity 0.56s ease",
              filter: spec.work === "room" ? `sepia(${material * 0.12})` : undefined,
            }}
          />
        ))}
        <div className="hx-veil" />
        <div className="hx-copy">
          <button type="button" className="hx-text" onClick={onBack}>
            {ui.backStep}
          </button>
          <p className="hx-kicker">{line(locale, item.meta)}</p>
          <h2 className="hx-display">{line(locale, item.title)}</h2>
          <p className="hx-lead">{line(locale, item.note)}</p>
        </div>
      </div>
      <div className="hx-page">
        <p className="hx-kicker">{screen === 4 ? line(locale, spec.done) : line(locale, spec.act)}</p>
        {screen === 2 ? (
          <>
            <p className="hx-lead">{line(locale, spec.lead)}</p>
            <button type="button" className="hx-cta" data-fill="true" onClick={onNext}>
              {ui.next}
            </button>
          </>
        ) : null}
        {screen === 3 ? (
          <div className="hx-work">
            {spec.work === "cut" ? (
              <>
                <label className="hx-fader">
                  {ui.markIn}
                  <input type="range" min={0} max={60} value={markIn} onChange={(e) => onMarkIn(+e.target.value)} />
                </label>
                <label className="hx-fader">
                  {ui.markOut}
                  <input type="range" min={40} max={100} value={markOut} onChange={(e) => onMarkOut(+e.target.value)} />
                </label>
                <button type="button" className="hx-chip" data-on={grade} onClick={() => onGrade(!grade)}>
                  {ui.grade}
                </button>
              </>
            ) : null}
            {spec.work === "mix" ? (
              mix.map((value, index) => (
                <label key={index} className="hx-fader">
                  {index + 1}
                  <input
                    type="range"
                    value={value}
                    onChange={(event) => {
                      const next = [...mix];
                      next[index] = Number(event.target.value);
                      onMix(next);
                    }}
                  />
                </label>
              ))
            ) : null}
            {spec.work === "desk" || spec.work === "publish" || spec.work === "request" ? (
              <textarea rows={4} value={note} onChange={(event) => onNote(event.target.value)} placeholder={ui.note} />
            ) : null}
            {spec.work === "pose" ? (
              <div className="hx-row">
                {[0, 1, 2].map((frame) => (
                  <button key={frame} type="button" className="hx-chip" data-on={pose === frame} onClick={() => onPose(frame)}>
                    {frame + 1}
                  </button>
                ))}
              </div>
            ) : null}
            {spec.work === "reserve" || spec.work === "stay" || spec.work === "visit" ? (
              <div className="hx-row">
                <button type="button" className="hx-chip" onClick={() => onDays(Math.max(1, days - 1))}>
                  −
                </button>
                <strong>
                  {ui.days} {days}
                </strong>
                <button type="button" className="hx-chip" onClick={() => onDays(Math.min(12, days + 1))}>
                  +
                </button>
              </div>
            ) : null}
            {spec.work === "look" ? (
              <div className="hx-row">
                {["XS", "S", "M", "L"].map((value) => (
                  <button key={value} type="button" className="hx-chip" data-on={size === value} onClick={() => onSize(value)}>
                    {ui.size} {value}
                  </button>
                ))}
              </div>
            ) : null}
            {spec.work === "brief" || spec.work === "order" ? (
              <div className="hx-row">
                {layers.map((entry, index) => (
                  <button key={entry.en} type="button" className="hx-chip" data-on={layer === index} onClick={() => onLayer(index)}>
                    {locale === "it" ? entry.it : entry.en}
                  </button>
                ))}
              </div>
            ) : null}
            {spec.work === "room" ? (
              <div className="hx-row">
                {materials.map((entry, index) => (
                  <button
                    key={entry.en}
                    type="button"
                    className="hx-chip"
                    data-on={material === index}
                    onClick={() => onMaterial(index)}
                    style={{ borderColor: entry.color }}
                  >
                    {locale === "it" ? entry.it : entry.en}
                  </button>
                ))}
              </div>
            ) : null}
            {spec.work === "forge" ? (
              <label className="hx-fader">
                {ui.seed} {seed}
                <input type="range" min={1} max={99} value={seed} onChange={(event) => onSeed(Number(event.target.value))} />
              </label>
            ) : null}
            <button type="button" className="hx-cta" data-fill="true" onClick={onNext}>
              {ui.confirm}
            </button>
          </div>
        ) : null}
        {screen === 4 ? (
          <article className="hx-pass">
            <p className="hx-meta">{line(locale, spec.kicker)}</p>
            <h3 className="hx-display" style={{ fontSize: 40 }}>
              {line(locale, item.title)}
            </h3>
            <p className="hx-lead">{line(locale, spec.done)}</p>
            <p className="hx-meta">{line(locale, spec.notice)}</p>
          </article>
        ) : null}
      </div>
    </section>
  );
}

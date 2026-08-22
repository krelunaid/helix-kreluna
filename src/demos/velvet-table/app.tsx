import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, ChevronLeft, Flower2, MapPin, MessageCircle } from "lucide-react";
import { DemoShell } from "@/demos/shell";
import { useI18n } from "@/lib/i18n";
import { velvetCopy } from "./copy";
import {
  DEPOSIT_EUR,
  FLOWER_EUR,
  GUIDED_TABLE_ID,
  GUIDED_VENUE_ID,
  MENU,
  VENUES,
  WINE_EUR,
  type Atmosphere,
  type OccasionId,
  type VenueFixture,
  type VenueId,
} from "./fixtures";
import { VELVET_PHOTOS } from "./photos";
import "./styles.css";

export type VelvetScreen = "discover" | "results" | "venue" | "table" | "book" | "wallet";

const INITIAL = {
  screen: "discover" as VelvetScreen,
  occasion: null as OccasionId | null,
  query: "",
  availableOnly: false,
  highBand: false,
  nearby: false,
  viewMode: "list" as "list" | "map",
  filtersOpen: false,
  venueId: null as VenueId | null,
  tableId: null as string | null,
  venueTab: "gallery" as "gallery" | "menu" | "chef",
  atmosphere: "sunset" as Atmosphere,
  people: 2,
  date: "tonight",
  allergies: "",
  flowers: false,
  wine: false,
  bookStep: 1 as 1 | 2 | 3 | 4,
  confirming: false,
  reservation: "",
  invited: false,
  calendar: false,
  concierge: "",
  log: "",
  notice: "",
  touring: false,
};

type State = typeof INITIAL;

function tonightLabel(locale: string) {
  return new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(
    new Date(),
  );
}

function reservationCode() {
  return `VT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function venueById(id: VenueId) {
  return VENUES.find((venue) => venue.id === id) ?? VENUES[0];
}

export default function VelvetTableApp() {
  const { locale } = useI18n();
  const t = velvetCopy(locale);
  const [state, setState] = useState<State>(INITIAL);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    return () => {
      for (const id of timers.current) window.clearTimeout(id);
    };
  }, []);

  function later(ms: number, fn: () => void) {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = window.setTimeout(fn, reduced ? 40 : ms);
    timers.current.push(id);
  }

  function patch(next: Partial<State>) {
    setState((current) => ({ ...current, ...next }));
  }

  function reset() {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
    setState({ ...INITIAL, notice: t.noticeReset });
  }

  function flash(notice: string) {
    patch({ notice });
    later(3200, () => setState((current) => (current.notice === notice ? { ...current, notice: "" } : current)));
  }

  const venues = useMemo(() => {
    const q = state.query.trim().toLowerCase();
    return VENUES.filter((venue) => {
      const copy = t.venue[venue.id];
      if (state.occasion && !venue.occasions.includes(state.occasion)) return false;
      if (state.highBand && venue.priceBand < 3) return false;
      if (q && !`${copy.name} ${copy.city} ${copy.line}`.toLowerCase().includes(q)) return false;
      if (state.availableOnly && !venue.tables.some((table) => table.status === "available")) return false;
      return true;
    });
  }, [state.availableOnly, state.highBand, state.occasion, state.query, t.venue]);

  const venue = state.venueId ? venueById(state.venueId) : null;
  const table = venue?.tables.find((item) => item.id === state.tableId) ?? venue?.tables[0] ?? null;

  function openOccasion(occasion: OccasionId) {
    patch({
      occasion,
      screen: "results",
      notice: occasion === "romantic" ? t.noticeRomantic : "",
    });
  }

  function openVenue(id: VenueId) {
    const next = venueById(id);
    patch({
      venueId: id,
      tableId: next.tables.find((item) => item.status === "available")?.id ?? next.tables[0]?.id ?? null,
      screen: "venue",
      venueTab: "gallery",
      atmosphere: "sunset",
    });
  }

  function chooseTable(id: string) {
    const next = venue?.tables.find((item) => item.id === id);
    if (!next || next.status === "full") return;
    patch({ tableId: id, notice: t.noticeTable });
  }

  function confirmBooking() {
    patch({ confirming: true });
    later(640, () => {
      setState((current) => ({
        ...current,
        confirming: false,
        screen: "wallet",
        reservation: current.reservation || reservationCode(),
        notice: t.noticeBooked,
        touring: false,
      }));
    });
  }

  function startTour() {
    for (const id of timers.current) window.clearTimeout(id);
    timers.current = [];
    const guided = venueById(GUIDED_VENUE_ID);
    setState({
      ...INITIAL,
      touring: true,
      occasion: "romantic",
      screen: "discover",
      notice: t.noticeTour,
    });
    later(700, () => {
      setState((current) => ({ ...current, screen: "results", availableOnly: true }));
    });
    later(1500, () => {
      setState((current) => ({
        ...current,
        venueId: GUIDED_VENUE_ID,
        tableId: guided.tables[1]?.id ?? GUIDED_TABLE_ID,
        screen: "venue",
        atmosphere: "sunset",
      }));
    });
    later(2400, () => {
      setState((current) => ({ ...current, screen: "table", tableId: guided.tables[1]?.id ?? GUIDED_TABLE_ID }));
    });
    later(3100, () => {
      setState((current) => ({ ...current, tableId: guided.tables[2]?.id ?? GUIDED_TABLE_ID, notice: t.noticeTable }));
    });
    later(3800, () => {
      setState((current) => ({ ...current, tableId: GUIDED_TABLE_ID }));
    });
    later(4600, () => {
      setState((current) => ({
        ...current,
        screen: "book",
        bookStep: 1,
        people: 2,
        date: "tonight",
        flowers: false,
      }));
    });
    later(5300, () => setState((current) => ({ ...current, bookStep: 2 })));
    later(5900, () => setState((current) => ({ ...current, bookStep: 3 })));
    later(6500, () => setState((current) => ({ ...current, bookStep: 4, flowers: true })));
    later(7400, () => {
      setState((current) => ({
        ...current,
        confirming: false,
        screen: "wallet",
        reservation: current.reservation || reservationCode(),
        flowers: true,
        notice: t.noticeBooked,
        touring: false,
      }));
    });
  }

  const total =
    DEPOSIT_EUR + (state.flowers ? FLOWER_EUR : 0) + (state.wine ? WINE_EUR : 0) + (table?.surcharge ?? 0);

  return (
    <DemoShell
      brand={t.brand}
      back={t.back}
      reset={t.reset}
      tour={t.tour}
      touring={t.touring}
      made={t.made}
      create={t.create}
      onReset={reset}
      onTour={startTour}
      tourActive={state.touring}
    >
      {state.notice ? <p className="vt-notice">{state.notice}</p> : null}
      {state.screen === "discover" ? (
        <Discover t={t} query={state.query} onQuery={(query) => patch({ query })} onOccasion={openOccasion} />
      ) : null}
      {state.screen === "results" ? (
        <Results
          t={t}
          venues={venues}
          state={state}
          patch={patch}
          onOpen={openVenue}
          onBack={() => patch({ screen: "discover" })}
        />
      ) : null}
      {state.screen === "venue" && venue ? (
        <Venue
          t={t}
          venue={venue}
          state={state}
          patch={patch}
          onBack={() => patch({ screen: "results" })}
          onTables={() => patch({ screen: "table" })}
        />
      ) : null}
      {state.screen === "table" && venue && table ? (
        <PickTable
          t={t}
          venue={venue}
          tableId={state.tableId}
          onBack={() => patch({ screen: "venue" })}
          onChoose={chooseTable}
          onBook={() => patch({ screen: "book", bookStep: 1 })}
        />
      ) : null}
      {state.screen === "book" && venue && table ? (
        <Book
          t={t}
          locale={locale}
          venue={venue}
          table={table}
          state={state}
          total={total}
          patch={patch}
          onBack={() =>
            state.bookStep === 1 ? patch({ screen: "table" }) : patch({ bookStep: (state.bookStep - 1) as 1 | 2 | 3 })
          }
          onConfirm={confirmBooking}
        />
      ) : null}
      {state.screen === "wallet" && venue && table ? (
        <Wallet t={t} locale={locale} venue={venue} table={table} state={state} patch={patch} />
      ) : null}
    </DemoShell>
  );
}

function Discover({
  t,
  query,
  onQuery,
  onOccasion,
}: {
  t: ReturnType<typeof velvetCopy>;
  query: string;
  onQuery: (value: string) => void;
  onOccasion: (id: OccasionId) => void;
}) {
  return (
    <section className="vt-hero">
      <img className="vt-hero-photo" src={VELVET_PHOTOS.salon} alt="" />
      <div className="vt-hero-veil" />
      <p className="vt-word">{t.word}</p>
      <div className="vt-hero-copy">
        <p className="vt-kicker">{t.discoverKicker}</p>
        <h1 className="vt-display">{t.discoverTitle}</h1>
        <p className="vt-lead">{t.discoverLead}</p>
      </div>
      <form
        className="vt-search"
        onSubmit={(event) => {
          event.preventDefault();
          onOccasion("romantic");
        }}
      >
        <input
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder={t.search}
          aria-label={t.search}
        />
      </form>
      <div className="vt-occasions">
        {(["romantic", "business", "family"] as const).map((id) => (
          <button key={id} type="button" className="vt-occasion" onClick={() => onOccasion(id)}>
            <strong>{t.occasions[id].title}</strong>
            <span>{t.occasions[id].line}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function Results({
  t,
  venues,
  state,
  patch,
  onOpen,
  onBack,
}: {
  t: ReturnType<typeof velvetCopy>;
  venues: readonly VenueFixture[];
  state: State;
  patch: (next: Partial<State>) => void;
  onOpen: (id: VenueId) => void;
  onBack: () => void;
}) {
  return (
    <section className="vt-page vt-split">
      <div className="vt-panel">
        <button type="button" className="vt-text" onClick={onBack}>
          <ChevronLeft size={16} strokeWidth={1.4} /> {t.backStep}
        </button>
        <p className="vt-kicker">{t.resultsKicker}</p>
        <h2 className="vt-display" style={{ fontSize: "clamp(36px, 6vw, 56px)" }}>
          {t.resultsTitle}
        </h2>
        <div className="vt-toolbar">
          <button
            type="button"
            className="vt-pill"
            data-active={state.viewMode === "list"}
            onClick={() => patch({ viewMode: "list" })}
          >
            {t.list}
          </button>
          <button
            type="button"
            className="vt-pill"
            data-active={state.viewMode === "map"}
            onClick={() => patch({ viewMode: "map" })}
          >
            {t.map}
          </button>
          <button type="button" className="vt-pill" onClick={() => patch({ filtersOpen: !state.filtersOpen })}>
            {t.filters}
          </button>
          <button
            type="button"
            className="vt-pill"
            data-active={state.availableOnly}
            onClick={() => patch({ availableOnly: !state.availableOnly })}
          >
            {t.filterAvailable}
          </button>
        </div>
        {venues.length === 0 ? <p className="vt-empty">{t.noMatch}</p> : null}
        <div className="vt-cards" data-mode={state.viewMode}>
          {venues.map((venue) => (
            <button key={venue.id} type="button" className="vt-card" onClick={() => onOpen(venue.id)}>
              <img src={venue.cover} alt="" />
              <div className="vt-card-body">
                <p className="vt-meta">{t.venue[venue.id].city}</p>
                <h3>{t.venue[venue.id].name}</h3>
                <p>{t.venue[venue.id].line}</p>
              </div>
            </button>
          ))}
        </div>
        {state.viewMode === "map" ? (
          <div className="vt-map-mobile">
            <CityMap t={t} venues={venues} onOpen={onOpen} />
          </div>
        ) : null}
      </div>
      <aside className="vt-panel vt-map-col">
        <CityMap t={t} venues={venues} onOpen={onOpen} />
      </aside>
      {state.filtersOpen ? (
        <div className="vt-drawer">
          <p className="vt-kicker">{t.filters}</p>
          <div className="vt-toolbar">
            <button
              type="button"
              className="vt-pill"
              data-active={state.availableOnly}
              onClick={() => patch({ availableOnly: !state.availableOnly })}
            >
              {t.filterAvailable}
            </button>
            <button
              type="button"
              className="vt-pill"
              data-active={state.highBand}
              onClick={() => patch({ highBand: !state.highBand })}
            >
              {t.filterPrice}
            </button>
            <button
              type="button"
              className="vt-pill"
              data-active={state.nearby}
              onClick={() => patch({ nearby: !state.nearby })}
            >
              {t.filterNear}
            </button>
            <button type="button" className="vt-pill" onClick={() => patch({ filtersOpen: false })}>
              {t.closeFilters}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function CityMap({
  t,
  venues,
  onOpen,
}: {
  t: ReturnType<typeof velvetCopy>;
  venues: readonly VenueFixture[];
  onOpen: (id: VenueId) => void;
}) {
  const marks: Record<VenueId, { x: number; y: number }> = {
    "terrazza-aurora": { x: 72, y: 28 },
    "sala-velluto": { x: 34, y: 46 },
    orangerie: { x: 58, y: 70 },
  };
  return (
    <div className="vt-map">
      <svg viewBox="0 0 100 80" role="img" aria-label={t.map}>
        <rect width="100" height="80" fill="#0d090a" />
        <path d="M8 18 C 28 8, 48 22, 92 14" fill="none" stroke="#d7b16d" strokeOpacity="0.25" />
        <path d="M6 50 C 30 40, 40 62, 94 48" fill="none" stroke="#6d1324" strokeOpacity="0.45" />
        {venues.map((venue) => (
          <g
            key={venue.id}
            transform={`translate(${marks[venue.id].x} ${marks[venue.id].y})`}
            onClick={() => onOpen(venue.id)}
            style={{ cursor: "pointer" }}
          >
            <circle r="3.2" fill="#d7b16d" />
            <text x="5" y="1.4" fill="#f4e7da" fontSize="4.2" fontFamily="Inter, sans-serif">
              {t.venue[venue.id].name}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function Venue({
  t,
  venue,
  state,
  patch,
  onBack,
  onTables,
}: {
  t: ReturnType<typeof velvetCopy>;
  venue: VenueFixture;
  state: State;
  patch: (next: Partial<State>) => void;
  onBack: () => void;
  onTables: () => void;
}) {
  const photo = venue.atmospheres[state.atmosphere];
  return (
    <section>
      <div className="vt-venue-hero">
        <img className="vt-hero-photo" src={photo} alt="" />
        <div className="vt-hero-veil" />
        <div className="vt-hero-copy">
          <button type="button" className="vt-text" onClick={onBack}>
            <ChevronLeft size={16} strokeWidth={1.4} /> {t.backStep}
          </button>
          <p className="vt-kicker">{t.venue[venue.id].city}</p>
          <h2 className="vt-display">{t.venue[venue.id].name}</h2>
          <p className="vt-lead">{t.venue[venue.id].line}</p>
        </div>
      </div>
      <div className="vt-tabs">
        {(["gallery", "menu", "chef"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            className="vt-pill"
            data-active={state.venueTab === tab}
            onClick={() => patch({ venueTab: tab })}
          >
            {t[tab]}
          </button>
        ))}
        {(["day", "sunset", "night"] as const).map((hour) => (
          <button
            key={hour}
            type="button"
            className="vt-pill"
            data-active={state.atmosphere === hour}
            onClick={() => patch({ atmosphere: hour })}
          >
            {t.atmosphere[hour]}
          </button>
        ))}
      </div>
      {state.venueTab === "gallery" ? (
        <div className="vt-gallery">
          {venue.gallery.map((src) => (
            <img key={src} src={src} alt="" />
          ))}
        </div>
      ) : null}
      {state.venueTab === "menu" ? (
        <div className="vt-menu">
          <p className="vt-kicker">{t.menuTitle}</p>
          <ul>
            {MENU.map((item) => (
              <li key={item.course}>
                <span>{t.courses[item.course]}</span>
                <strong>{item.price}</strong>
              </li>
            ))}
          </ul>
          <p className="vt-lead">{t.venue[venue.id].dress}</p>
        </div>
      ) : null}
      {state.venueTab === "chef" ? (
        <div className="vt-chef">
          <img src={venue.chefPhoto} alt={t.chefName} />
          <div>
            <p className="vt-kicker">{t.chefRole}</p>
            <h3 className="vt-display" style={{ fontSize: 42 }}>
              {t.chefName}
            </h3>
            <p className="vt-lead">{t.chefNote}</p>
          </div>
        </div>
      ) : null}
      <div className="vt-panel">
        <button type="button" className="vt-cta" onClick={onTables}>
          {t.chooseTable}
        </button>
      </div>
    </section>
  );
}

function PickTable({
  t,
  venue,
  tableId,
  onBack,
  onChoose,
  onBook,
}: {
  t: ReturnType<typeof velvetCopy>;
  venue: VenueFixture;
  tableId: string | null;
  onBack: () => void;
  onChoose: (id: string) => void;
  onBook: () => void;
}) {
  const selected = venue.tables.find((item) => item.id === tableId) ?? venue.tables[0];
  const zone = t[selected.zone];
  return (
    <section className="vt-pick">
      <div className="vt-view-stack" key={selected.id}>
        {venue.tables.map((item) => (
          <img
            key={item.id}
            src={item.view}
            alt=""
            data-on={item.id === selected.id}
            className={item.id === selected.id ? "vt-iris" : undefined}
          />
        ))}
        <div className="vt-hero-veil" />
        <div className="vt-hero-copy">
          <button type="button" className="vt-text" onClick={onBack}>
            <ChevronLeft size={16} strokeWidth={1.4} /> {t.backStep}
          </button>
          <p className="vt-kicker">{t.pickKicker}</p>
          <h2 className="vt-display">{t.pickTitle}</h2>
        </div>
      </div>
      <div>
        <div className="vt-plan-wrap">
          <FloorPlan venue={venue} selected={selected.id} onChoose={onChoose} label={t.pickTitle} />
        </div>
        <div className="vt-table-card">
          <p className="vt-meta">
            {t.table} {selected.number} · {zone}
          </p>
          <h3>
            {t.table} {selected.number}
          </h3>
          <div className="vt-stats">
            <div>
              <span>{t.view}</span>
              <strong>{zone}</strong>
            </div>
            <div>
              <span>{t.privacy}</span>
              <strong>{t.privacyLevels[selected.privacy - 1]}</strong>
            </div>
            <div>
              <span>{t.status[selected.status]}</span>
              <strong>{selected.surcharge ? `+${selected.surcharge}` : "—"}</strong>
            </div>
          </div>
          {selected.status === "full" ? <p className="vt-lead">{t.fullHint}</p> : null}
          {selected.status === "waitlist" ? (
            <button type="button" className="vt-cta" data-quiet="true" onClick={onBook}>
              {t.waitlistJoin}
            </button>
          ) : (
            <button type="button" className="vt-cta" disabled={selected.status === "full"} onClick={onBook}>
              {t.continueBook}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function FloorPlan({
  venue,
  selected,
  onChoose,
  label,
}: {
  venue: VenueFixture;
  selected: string;
  onChoose: (id: string) => void;
  label: string;
}) {
  return (
    <svg className="vt-plan" viewBox="0 0 100 70" role="img" aria-label={label}>
      <rect x="3" y="4" width="94" height="62" fill="none" stroke="#d7b16d" strokeOpacity="0.35" />
      <rect x="78" y="8" width="14" height="22" fill="none" stroke="#f4e7da" strokeOpacity="0.35" />
      <text x="80" y="20" fill="#d7b16d" fontSize="3.2" fontFamily="Inter, sans-serif">
        ···
      </text>
      {venue.tables.map((item) => {
        const fill =
          item.status === "full" ? "#3a2a2c" : item.status === "waitlist" ? "#6d1324" : "#d7b16d";
        const on = item.id === selected;
        return (
          <g
            key={item.id}
            className="vt-table-dot"
            data-status={item.status}
            onClick={() => onChoose(item.id)}
            transform={`translate(${item.x} ${item.y})`}
          >
            <circle r={on ? 5.4 : 4.2} fill={fill} opacity={item.status === "full" ? 0.45 : 1}>
              {item.status === "available" ? (
                <animate attributeName="opacity" values="0.7;1;0.7" dur="2.4s" repeatCount="indefinite" />
              ) : null}
            </circle>
            <text
              y="1.2"
              textAnchor="middle"
              fill={item.status === "available" ? "#0d090a" : "#f4e7da"}
              fontSize="3.4"
              fontFamily="Inter, sans-serif"
            >
              {item.number}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Book({
  t,
  locale,
  venue,
  table,
  state,
  total,
  patch,
  onBack,
  onConfirm,
}: {
  t: ReturnType<typeof velvetCopy>;
  locale: string;
  venue: VenueFixture;
  table: NonNullable<VenueFixture["tables"][number]>;
  state: State;
  total: number;
  patch: (next: Partial<State>) => void;
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <section className="vt-book">
      <button type="button" className="vt-text" onClick={onBack}>
        <ChevronLeft size={16} strokeWidth={1.4} /> {t.backStep}
      </button>
      <p className="vt-kicker">{t.bookKicker}</p>
      <h2 className="vt-display" style={{ fontSize: "clamp(36px, 6vw, 56px)" }}>
        {t.bookTitle}
      </h2>
      <p className="vt-meta">
        {t.step} {state.bookStep} · {t.steps[state.bookStep - 1]}
      </p>
      <div className="vt-steps">
        {[1, 2, 3, 4].map((step) => (
          <i key={step} data-on={state.bookStep >= step} />
        ))}
      </div>
      {state.bookStep === 1 ? (
        <>
          <div className="vt-field">
            <label>{t.people}</label>
            <div className="vt-people">
              <button type="button" onClick={() => patch({ people: Math.max(1, state.people - 1) })}>
                −
              </button>
              <strong>{state.people}</strong>
              <button type="button" onClick={() => patch({ people: Math.min(8, state.people + 1) })}>
                +
              </button>
            </div>
          </div>
          <div className="vt-field">
            <label>{t.date}</label>
            <button type="button" className="vt-check" data-on={state.date === "tonight"} onClick={() => patch({ date: "tonight" })}>
              <span>{t.tonight}</span>
              <strong>{tonightLabel(locale)}</strong>
            </button>
          </div>
        </>
      ) : null}
      {state.bookStep === 2 ? (
        <div className="vt-field">
          {(["romantic", "business", "family"] as const).map((id) => (
            <button
              key={id}
              type="button"
              className="vt-check"
              data-on={state.occasion === id}
              onClick={() => patch({ occasion: id })}
            >
              <span>{t.occasions[id].title}</span>
            </button>
          ))}
        </div>
      ) : null}
      {state.bookStep === 3 ? (
        <div className="vt-field">
          <label>{t.allergies}</label>
          <textarea
            rows={3}
            value={state.allergies}
            onChange={(event) => patch({ allergies: event.target.value })}
            placeholder={t.allergiesHint}
          />
        </div>
      ) : null}
      {state.bookStep === 4 ? (
        <>
          <button
            type="button"
            className="vt-check"
            data-on={state.flowers}
            onClick={() => patch({ flowers: !state.flowers })}
          >
            <span>
              <Flower2 size={16} strokeWidth={1.4} /> {t.flowers}
            </span>
            <strong>+{FLOWER_EUR}</strong>
          </button>
          <button type="button" className="vt-check" data-on={state.wine} onClick={() => patch({ wine: !state.wine })}>
            <span>{t.wine}</span>
            <strong>+{WINE_EUR}</strong>
          </button>
          <p className="vt-lead">
            {t.deposit} {DEPOSIT_EUR} · {t.surcharge} {table.surcharge || 0} · {total}
          </p>
          <p className="vt-meta">{t.depositNote}</p>
        </>
      ) : null}
      <div className="vt-actions">
        {state.bookStep < 4 ? (
          <button
            type="button"
            className="vt-cta"
            onClick={() => patch({ bookStep: (state.bookStep + 1) as 2 | 3 | 4 })}
          >
            {t.next}
          </button>
        ) : (
          <button type="button" className="vt-cta" onClick={onConfirm} disabled={state.confirming}>
            {state.confirming ? t.confirming : t.confirm}
          </button>
        )}
      </div>
      <p className="vt-meta" style={{ marginTop: 18 }}>
        {t.venue[venue.id].name} · {t.table} {table.number}
      </p>
    </section>
  );
}

function Wallet({
  t,
  locale,
  venue,
  table,
  state,
  patch,
}: {
  t: ReturnType<typeof velvetCopy>;
  locale: string;
  venue: VenueFixture;
  table: NonNullable<VenueFixture["tables"][number]>;
  state: State;
  patch: (next: Partial<State>) => void;
}) {
  return (
    <section className="vt-wallet">
      <p className="vt-kicker">{t.walletKicker}</p>
      <h2 className="vt-display" style={{ fontSize: "clamp(36px, 6vw, 56px)" }}>
        {t.walletTitle}
      </h2>
      <article className="vt-pass">
        <p className="vt-meta">
          {t.reservation} {state.reservation}
        </p>
        <h3 className="vt-display" style={{ fontSize: 40 }}>
          {t.venue[venue.id].name}
        </h3>
        <p className="vt-lead">
          {t.table} {table.number} · {t[table.zone]} · {state.people} · {tonightLabel(locale)}
        </p>
        {state.flowers ? (
          <p className="vt-meta">
            <Flower2 size={14} strokeWidth={1.4} /> {t.flowers}
          </p>
        ) : null}
        <div className="vt-qr" aria-label={t.qr}>
          <PassMark code={state.reservation} />
        </div>
        <p className="vt-kicker" style={{ marginTop: 16 }}>
          <MapPin size={14} strokeWidth={1.4} /> {t.path}
        </p>
        <p>{t.pathLine}</p>
      </article>
      <div className="vt-actions">
        <button type="button" className="vt-ghost" onClick={() => patch({ invited: true })}>
          {state.invited ? t.invited : t.invite}
        </button>
        <button type="button" className="vt-ghost" onClick={() => patch({ calendar: true })}>
          <Calendar size={14} strokeWidth={1.4} /> {state.calendar ? t.calendarSaved : t.calendar}
        </button>
        <button type="button" className="vt-ghost" onClick={() => patch({ screen: "book", bookStep: 1 })}>
          {t.edit}
        </button>
      </div>
      <div className="vt-chat">
        <p className="vt-kicker">
          <MessageCircle size={14} strokeWidth={1.4} /> {t.concierge}
        </p>
        <div className="vt-chat-log">{state.log || t.conciergeHint}</div>
        <form
          className="vt-search"
          style={{ margin: 0 }}
          onSubmit={(event) => {
            event.preventDefault();
            if (!state.concierge.trim()) return;
            patch({ log: t.conciergeReply, concierge: "" });
          }}
        >
          <input
            value={state.concierge}
            onChange={(event) => patch({ concierge: event.target.value })}
            placeholder={t.conciergeHint}
            aria-label={t.concierge}
          />
          <button type="submit" className="vt-ghost">
            {t.send}
          </button>
        </form>
      </div>
    </section>
  );
}

function PassMark({ code }: { code: string }) {
  const cells = Array.from({ length: 49 }, (_, index) => {
    const on = (code.charCodeAt(index % code.length) + index * 7) % 3 !== 0;
    return on;
  });
  return (
    <svg viewBox="0 0 7 7" width="100%" height="100%" aria-hidden="true">
      {cells.map((on, index) =>
        on ? (
          <rect
            key={index}
            x={index % 7}
            y={Math.floor(index / 7)}
            width="1"
            height="1"
            fill="#0d090a"
          />
        ) : null,
      )}
    </svg>
  );
}

import { useRef, useState } from "react";
import { ArrowUp, Mic, Paperclip } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Gear } from "@/lib/house";
import {
  getBuildQuote,
  publicProductionBuildCredits,
  type BuildLevel,
} from "@/lib/build-level";

type SpeechRecognitionResultEvent = Event & {
  results: ArrayLike<ArrayLike<{ transcript?: string }>>;
};

type SpeechRecognitionLike = {
  lang: string;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export function IdeaDesk({
  value,
  onChange,
  onSubmit,
  busy,
  example,
  authenticated,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (payload: {
    prompt: string;
    gear: Gear;
    max: boolean;
    buildLevel: BuildLevel;
  }) => void;
  busy?: boolean;
  example?: string;
  authenticated?: boolean;
}) {
  const { t, locale } = useI18n();
  const [gear, setGear] = useState<Gear>("auto");
  const [max, setMax] = useState(false);
  const [listening, setListening] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [buildLevel, setBuildLevel] = useState<BuildLevel>("prototype");
  const productionCredits = publicProductionBuildCredits();
  const prototypeQuote = getBuildQuote({
    buildLevel: "prototype",
    authenticated: Boolean(authenticated),
  });
  const productionQuote = getBuildQuote({
    buildLevel: "production",
    authenticated: Boolean(authenticated),
    productionCredits,
  });

  function send() {
    const prompt = value.trim();
    if (!prompt || busy) return;
    onSubmit({ prompt, gear, max, buildLevel });
  }

  function speak() {
    const speechWindow = window as unknown as {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const SR = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = locale === "it" ? "it-IT" : "en-US";
    rec.onresult = (e) => {
      const said = e.results[0]?.[0]?.transcript ?? "";
      if (said) onChange(value ? `${value} ${said}` : said);
    };
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  }

  return (
    <form
      className="rounded-2xl bg-elevated p-3 window-shadow sm:p-4"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <Textarea
        id="idea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("mkt.ph")}
        className="min-h-28 border-0 bg-transparent text-base shadow-none sm:min-h-32"
      />
      {example ? <p className="px-1 text-xs text-subtle">{example}</p> : null}
      <fieldset className="mt-3 grid gap-2 sm:grid-cols-2">
        <legend className="sr-only">{t("desk.level")}</legend>
        <button
          type="button"
          role="radio"
          aria-checked={buildLevel === "prototype"}
          onClick={() => setBuildLevel("prototype")}
          className={cn(
            "rounded-xl border px-3 py-2 text-left",
            buildLevel === "prototype"
              ? "border-accent/50 bg-accent/10"
              : "border-border",
          )}
        >
          <span className="block text-xs font-medium text-fg">
            {t("desk.prototype")} · {prototypeQuote.credits} cr
          </span>
          <span className="mt-0.5 block text-[11px] leading-4 text-muted">
            {t("desk.prototypeHint")}
          </span>
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={buildLevel === "production"}
          aria-disabled={!productionQuote.available}
          disabled={!productionQuote.available}
          onClick={() => setBuildLevel("production")}
          className={cn(
            "rounded-xl border px-3 py-2 text-left",
            buildLevel === "production"
              ? "border-accent/50 bg-accent/10"
              : "border-border",
            !productionQuote.available && "opacity-55",
          )}
          title={productionQuote.reasonCode}
        >
          <span className="block text-xs font-medium text-fg">
            {t("desk.production")} · {productionQuote.available
              ? `${productionQuote.credits} cr`
              : t("desk.unavailable")}
          </span>
          <span className="mt-0.5 block text-[11px] leading-4 text-muted">
            {productionQuote.available
              ? t("desk.productionReadyHint")
              : authenticated
                ? t("desk.productionHint")
              : t("desk.productionGuestHint")}
          </span>
        </button>
      </fieldset>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*,.txt,.md"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            if (f.type.startsWith("image/")) {
              onChange(`${value}${value ? "\n" : ""}[${t("desk.attach")}: ${f.name}]`);
            } else {
              const text = await f.text();
              onChange(`${value}${value ? "\n" : ""}${text.slice(0, 4000)}`);
            }
            e.target.value = "";
          }}
        />
        <button
          type="button"
          className="grid size-10 place-items-center rounded-full hairline text-muted"
          onClick={() => fileRef.current?.click()}
          aria-label={t("desk.attach")}
        >
          <Paperclip className="size-4" />
        </button>
        <button
          type="button"
          className={cn(
            "grid size-10 place-items-center rounded-full hairline",
            listening ? "text-accent" : "text-muted",
          )}
          onClick={speak}
          aria-label="mic"
        >
          <Mic className="size-4" />
        </button>
        <select
          value={gear}
          onChange={(e) => setGear(e.target.value as Gear)}
          className="h-10 rounded-full bg-bg/50 px-3 text-xs"
          title={t(`desk.${gear}Hint` as "desk.autoHint")}
        >
          <option value="auto">{t("desk.auto")}</option>
          <option value="house">{t("desk.house")}</option>
          <option value="fast">{t("desk.fast")}</option>
        </select>
        <button
          type="button"
          onClick={() => setMax((v) => !v)}
          className={cn(
            "h-10 rounded-full px-3 text-xs",
            max ? "bg-accent text-accent-fg" : "hairline text-muted",
          )}
          title={t("desk.maxHint")}
        >
          {t("desk.max")}
        </button>
        <button
          type="submit"
          disabled={busy || !value.trim()}
          className="ml-auto grid size-10 place-items-center rounded-full bg-accent text-accent-fg disabled:opacity-40"
          aria-label={t("mkt.cta")}
        >
          <ArrowUp className="size-5" />
        </button>
      </div>
    </form>
  );
}

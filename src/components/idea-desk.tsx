import { useRef, useState } from "react";
import { ArrowUp, Mic, Paperclip } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { Gear } from "@/lib/house";

export function IdeaDesk({
  value,
  onChange,
  onSubmit,
  busy,
  example,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (payload: { prompt: string; gear: Gear; max: boolean }) => void;
  busy?: boolean;
  example?: string;
}) {
  const { t, locale } = useI18n();
  const [gear, setGear] = useState<Gear>("auto");
  const [max, setMax] = useState(false);
  const [listening, setListening] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function send() {
    const prompt = value.trim();
    if (!prompt || busy) return;
    onSubmit({ prompt, gear, max });
  }

  function speak() {
    const SR = (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognition; SpeechRecognition?: new () => SpeechRecognition })
      .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognition }).webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = locale === "it" ? "it-IT" : "en-US";
    rec.onresult = (e: SpeechRecognitionEvent) => {
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
          className={cn("grid size-10 place-items-center rounded-full hairline", listening ? "text-accent" : "text-muted")}
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
          className={cn("h-10 rounded-full px-3 text-xs", max ? "bg-accent text-accent-fg" : "hairline text-muted")}
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

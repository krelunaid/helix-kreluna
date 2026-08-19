import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/go-live")({ component: GoLive });

const RECORD = {
  type: "CNAME",
  name: "helix",
  value: "moon-prism-grove-valley.grok.me",
};

function GoLive() {
  const { t } = useI18n();
  const [copied, setCopied] = useState<string | null>(null);

  function copy(label: string, value: string) {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 1600);
    });
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl px-5 pb-24 pt-10">
        <p className="text-[11px] tracking-[0.22em] text-subtle uppercase">{t("live.kicker")}</p>
        <h1 className="font-display mt-3 text-5xl italic tracking-tight">{t("live.title")}</h1>
        <p className="mt-4 text-lg text-muted">{t("live.lead")}</p>
        <p className="mt-2 font-display text-2xl italic">helix.kreluna.it</p>

        <ol className="mt-12 space-y-8">
          <li>
            <p className="font-display text-4xl italic text-accent-soft">01</p>
            <h2 className="font-display mt-2 text-2xl">{t("live.s1")}</h2>
            <p className="mt-2 text-muted">{t("live.s1b")}</p>
          </li>
          <li>
            <p className="font-display text-4xl italic text-accent-soft">02</p>
            <h2 className="font-display mt-2 text-2xl">{t("live.s2")}</h2>
            <p className="mt-2 text-muted">{t("live.s2b")}</p>
            <div className="mt-4 divide-y divide-border rounded-xl bg-surface hairline">
              {(
                [
                  ["type", RECORD.type],
                  ["name", RECORD.name],
                  ["value", RECORD.value],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="text-[11px] tracking-[0.16em] text-subtle uppercase">{t(`live.${k}` as "live.type")}</p>
                    <p className="font-mono text-sm">{v}</p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => copy(k, v)}>
                    {copied === k ? t("live.copied") : t("live.copy")}
                  </Button>
                </div>
              ))}
            </div>
          </li>
          <li>
            <p className="font-display text-4xl italic text-accent-soft">03</p>
            <h2 className="font-display mt-2 text-2xl">{t("live.s3")}</h2>
            <p className="mt-2 text-muted">{t("live.s3b")}</p>
          </li>
        </ol>

        <p className="mt-12 text-sm text-subtle">{t("live.note")}</p>
      </main>
    </div>
  );
}

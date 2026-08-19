import { DESKS, PUBLIC_HOUSE, type Desk } from "@/lib/house";
import { useI18n } from "@/lib/i18n";

const SAMPLE: Record<Desk, string[]> = {
  ops: ["gemini", "senate", "augur", "harbor", "seal"],
  product: ["nova", "atlas", "lumen", "reed"],
  eng: ["forge", "basalt", "orbit", "patch"],
  quality: ["iris", "twin", "aegis", "echo"],
  growth: ["beacon", "sage", "pulsar"],
};

export function HouseRoster() {
  const { t, locale } = useI18n();
  return (
    <section id="house" className="border-t border-border">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <p className="text-[11px] tracking-[0.2em] text-subtle uppercase">{t("house.section.kicker")}</p>
        <h2 className="mt-3 text-4xl tracking-tight sm:text-5xl">{t("house.section.title")}</h2>
        <p className="mt-4 max-w-2xl text-lg text-muted">{t("house.section.lead")}</p>
        <div className="mt-12 grid gap-8 md:grid-cols-2 lg:grid-cols-5">
          {DESKS.map((desk) => {
            const ids = SAMPLE[desk];
            const people = ids
              .map((id) => PUBLIC_HOUSE.find((a) => a.id === id))
              .filter(Boolean);
            return (
              <article key={desk}>
                <p className="text-xs tracking-[0.18em] text-accent uppercase">
                  {t(
                    desk === "ops"
                      ? "house.desk.ops"
                      : desk === "product"
                        ? "house.desk.product"
                        : desk === "eng"
                          ? "house.desk.eng"
                          : desk === "quality"
                            ? "house.desk.quality"
                            : "house.desk.growth",
                  )}
                </p>
                <ul className="mt-4 space-y-3">
                  {people.map((a) =>
                    a ? (
                      <li key={a.id}>
                        <p className="font-medium">{a.name}</p>
                        <p className="text-xs text-accent-soft">{locale === "it" ? a.roleIt : a.role}</p>
                        <p className="mt-0.5 text-sm text-muted">{locale === "it" ? a.briefIt : a.brief}</p>
                      </li>
                    ) : null,
                  )}
                </ul>
              </article>
            );
          })}
        </div>
        <p className="mt-10 text-sm text-subtle">
          {PUBLIC_HOUSE.length} {locale === "it" ? "specialisti in house. Flint non è più in squadra." : "specialists in house. Flint is no longer on the floor."}
        </p>
      </div>
    </section>
  );
}

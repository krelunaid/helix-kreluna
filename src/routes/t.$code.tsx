import { createFileRoute, Link } from "@tanstack/react-router";
import { AppStoreMark, PlayStoreMark } from "@/components/store-marks";
import { getPublicByCode } from "@/lib/server/deploy";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/t/$code")({
  loader: async ({ params }) => getPublicByCode({ data: params.code }),
  component: TestTrack,
});

function TestTrack() {
  const app = Route.useLoaderData();
  const { code } = Route.useParams();
  const { t } = useI18n();

  if (!app) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#070914] px-6 text-center text-sm text-[#aab3c5]">
        {t("track.missing", { code })}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#070914] px-5 py-16 text-[#f8fafc]">
      <div className="w-full max-w-md">
        <p className="text-[11px] tracking-[0.2em] text-accent uppercase">{t("track.kicker")}</p>
        <div className="mt-6 rounded-2xl bg-[#12141f] p-6 shadow-[0_0_0_1px_rgb(255_255_255/0.06)]">
          <div className="flex items-center gap-4">
            <div className="grid size-16 place-items-center rounded-2xl bg-accent font-semibold text-2xl text-accent-fg">
              {app.title.slice(0, 1)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-lg">{app.title}</p>
              <p className="text-xs text-[#aab3c5]">{t("track.internal")} · {code}</p>
            </div>
          </div>
          <p className="mt-5 text-sm leading-relaxed text-[#aab3c5]">{t("track.body")}</p>
          <Link
            to="/a/$slug"
            params={{ slug: app.slug }}
            className="mt-6 flex h-12 items-center justify-center rounded-full bg-accent text-sm font-medium text-accent-fg"
          >
            {t("track.open")}
          </Link>
          <div className="mt-6 grid gap-3 text-sm">
            <p className="flex items-start gap-2 text-[#aab3c5]">
              <AppStoreMark className="mt-0.5 size-5 shrink-0" />
              <span>{t("track.ios")}</span>
            </p>
            <p className="flex items-start gap-2 text-[#aab3c5]">
              <PlayStoreMark className="mt-0.5 size-5 shrink-0" />
              <span>{t("track.android")}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
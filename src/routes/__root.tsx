import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { I18nProvider } from "@/lib/i18n";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { publicEnv } from "@/lib/env.public";
import { Toaster } from "sonner";
import appCss from "../styles.css?url";

const APP_NAME = "Helix by Kreluna";
const origin = publicEnv.origin;
const ogImage = origin ? `${origin}/og.jpg` : undefined;
const xBanner = origin ? `${origin}/x-banner.jpg` : undefined;
const DESC =
  "Trasforma la tua idea in un prodotto digitale. Helix progetta, sviluppa, esegue i controlli configurati e prepara un candidato per la tua revisione.";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Helix by Kreluna | Crea siti, app e software" },
      { name: "description", content: DESC },
      { name: "apple-mobile-web-app-title", content: "Helix" },
      { name: "robots", content: "index, follow, max-image-preview:large" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: APP_NAME },
      { name: "twitter:description", content: DESC },
      { property: "og:type", content: "website" },
      { property: "og:title", content: APP_NAME },
      { property: "og:description", content: DESC },
      ...(origin ? [{ property: "og:url", content: origin }] : []),
      ...(ogImage
        ? [
            { property: "og:image", content: ogImage },
            { property: "og:image:width", content: "1200" },
            { property: "og:image:height", content: "630" },
          ]
        : []),
      ...(xBanner
        ? [
            { property: "x:game:image", content: xBanner },
            { property: "x:game:image:width", content: "1200" },
            { property: "x:game:image:height", content: "264" },
          ]
        : []),
    ],
    links: [
      { rel: "icon", href: "/favicon.ico" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32.png" },
      { rel: "icon", type: "image/png", sizes: "48x48", href: "/favicon-48.png" },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
      ...(origin ? [{ rel: "canonical", href: origin }] : []),
    ],
  }),
  component: () => (
    <html lang="it" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="bg-bg text-fg">
        <noscript>
          <p>
            Helix by Kreluna — software house AI. Scheda senza JavaScript:{" "}
            <a href="/scheda.html">scheda.html</a> · <a href="/llms.txt">llms.txt</a>
          </p>
        </noscript>
        <PreviewHostBridge />
        <AuthProvider>
          <I18nProvider>
            <Outlet />
          </I18nProvider>
        </AuthProvider>
        <Toaster
          theme="dark"
          position="bottom-center"
          toastOptions={{
            className: "!bg-elevated !text-fg !border-border",
          }}
        />
        <Scripts />
      </body>
    </html>
  ),
});

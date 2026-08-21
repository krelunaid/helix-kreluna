// Node's test runner executes this TypeScript module directly and requires the
// explicit extension; Vite also resolves it. The project emits no TypeScript.
// @ts-expect-error TS5097: explicit TS extension is intentional for both runtimes.
import { protectGeneratedHtml } from "./generated-content-policy.ts";

function protectPackagedHtml(html: string) {
  // Native/desktop wrappers are offline by default. Integrations must be
  // implemented by a reviewed native bridge instead of granting arbitrary
  // renderer network access.
  return protectGeneratedHtml(html, {
    noIndex: true,
    allowlist: {},
  });
}

export function slugify(input: string) {
  const s = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 28);
  return s || "app";
}

export function bundleIdFromTitle(title: string) {
  const parts = slugify(title).split("-").filter(Boolean).slice(0, 3);
  return `helix.kreluna.${parts.join("") || "app"}`;
}

export function expoFiles(input: {
  title: string;
  slug: string;
  html: string;
  bundleId: string;
  easProjectId?: string;
  appleTeam?: string;
  liveUrl: string;
  platform: "ios" | "android";
}) {
  const scheme = input.slug.replace(/-/g, "");
  const protectedHtml = protectPackagedHtml(input.html);
  return {
    "README.md": `# ${input.title}

Web-to-native Expo source package prepared by Helix / Harbor.

Creating or downloading this ZIP does not execute a native build, signing,
TestFlight distribution or Play upload. Helix can dispatch the checked-in EAS
workflow only through its separately configured authenticated Store runner and
only after an explicit submission request.

## TestFlight (iOS)
The checked-in workflow uses an EAS build job followed by a TestFlight job.
The runner invokes it non-interactively with its configured, exact eas-cli pin.

Apple Team: ${input.appleTeam || "(add your Team ID)"}
Bundle: ${input.bundleId}

## Google Play internal track
The checked-in workflow uses an EAS build job followed by a submit job. The
submission profile is fixed to the internal track and produces an Android App
Bundle (AAB).

Before the authenticated runner is enabled, the signing credentials and the
Google Play service-account key must already be uploaded to the matching EAS
project. This source package never contains, generates or uploads a credential
file. A non-interactive workflow with missing EAS credentials must stop and be
reported as action required.

Suggested web route (not published by this package action): ${input.liveUrl}
`,
    "package.json": JSON.stringify(
      {
        name: input.slug,
        version: "1.0.0",
        private: true,
        main: "index.js",
        scripts: {
          start: "expo start",
          ios: "expo run:ios",
          android: "expo run:android",
        },
        dependencies: {
          expo: "~52.0.0",
          react: "18.3.1",
          "react-native": "0.76.6",
          "react-native-webview": "13.12.5",
        },
      },
      null,
      2,
    ),
    "app.json": JSON.stringify(
      {
        expo: {
          name: input.title,
          slug: input.slug,
          scheme,
          version: "1.0.0",
          orientation: "portrait",
          userInterfaceStyle: "automatic",
          ios: {
            bundleIdentifier: input.bundleId,
            supportsTablet: true,
            appleTeamId: input.appleTeam || undefined,
          },
          android: { package: input.bundleId },
          extra: {
            liveUrl: input.liveUrl,
            eas: input.easProjectId ? { projectId: input.easProjectId } : undefined,
          },
        },
      },
      null,
      2,
    ),
    "eas.json": JSON.stringify(
      {
        cli: { version: ">= 13.0.0" },
        build: {
          production: {
            ios: { resourceClass: "m-medium" },
            android: { buildType: "app-bundle" },
          },
          preview: { distribution: "internal" },
        },
        submit: {
          production: {
            ios: { appleTeamId: input.appleTeam || undefined },
            android: {
              track: "internal",
              releaseStatus: "completed",
            },
          },
        },
      },
      null,
      2,
    ),
    ".eas/workflows/helix-store.yml":
      input.platform === "ios"
        ? `name: Helix iOS TestFlight release

jobs:
  build_ios:
    name: Build signed iOS archive
    type: build
    params:
      platform: ios
      profile: production
  distribute_testflight:
    name: Upload and distribute with TestFlight
    needs: [build_ios]
    type: testflight
    params:
      build_id: \${{ needs.build_ios.outputs.build_id }}
      profile: production
      wait_processing_timeout_seconds: 1800
`
        : `name: Helix Android internal-track release

jobs:
  build_android:
    name: Build signed Android App Bundle
    type: build
    params:
      platform: android
      profile: production
  submit_play_internal:
    name: Upload to Google Play internal track
    needs: [build_android]
    type: submit
    params:
      build_id: \${{ needs.build_android.outputs.build_id }}
      profile: production
`,
    "index.js": `import { registerRootComponent } from 'expo';
import App from './App';
registerRootComponent(App);
`,
    "App.js": `import { WebView } from 'react-native-webview';

const html = ${JSON.stringify(protectedHtml)};
const isPackagedDocument = ({ url }) =>
  url === 'about:blank' || url.startsWith('about:blank#');

export default function App() {
  return (
    <WebView
      originWhitelist={['about:blank']}
      source={{ html, baseUrl: 'about:blank' }}
      onShouldStartLoadWithRequest={isPackagedDocument}
      style={{ flex: 1 }}
      incognito
      cacheEnabled={false}
      cacheMode="LOAD_NO_CACHE"
      domStorageEnabled={false}
      sharedCookiesEnabled={false}
      thirdPartyCookiesEnabled={false}
      allowFileAccess={false}
      allowFileAccessFromFileURLs={false}
      allowUniversalAccessFromFileURLs={false}
      mixedContentMode="never"
      javaScriptCanOpenWindowsAutomatically={false}
      setSupportMultipleWindows={false}
      geolocationEnabled={false}
      webviewDebuggingEnabled={false}
      mediaPlaybackRequiresUserAction
      allowsInlineMediaPlayback
    />
  );
}
`,
    ".gitignore": "node_modules\n.expo\ndist\n.helix\n",
  };
}

export function windowsFiles(input: {
  title: string;
  slug: string;
  html: string;
  liveUrl: string;
}) {
  const name = input.slug || "helix-app";
  const protectedHtml = protectPackagedHtml(input.html);
  return {
    "README.md": `# ${input.title} — desktop program

Web-to-desktop Electron source package prepared by Helix / Harbor. This is not
a compiled desktop binary or a Microsoft Store submission.

## Run on Windows, Mac or Linux
\`\`\`
npm install
npm start
\`\`\`

After you install dependencies locally, it opens an Electron window with the
approved web artifact inside.

## Microsoft Store
1. Open ${input.liveUrl} in Edge → Apps → Install this site as an app.
2. Or package this folder with \`electron-builder\`.

Suggested web route (not published by this package action): ${input.liveUrl}
`,
    "package.json": JSON.stringify(
      {
        name,
        version: "1.0.0",
        private: true,
        main: "main.js",
        scripts: {
          start: "electron .",
          pack: "electron-builder --win --mac --linux",
        },
        devDependencies: {
          electron: "^33.0.0",
          "electron-builder": "^25.1.8",
        },
        build: {
          appId: `helix.kreluna.${name.replace(/-/g, "")}`,
          productName: input.title,
          files: ["main.js", "index.html", "preload.js"],
          win: { target: "nsis" },
          mac: { target: "dmg" },
          linux: { target: "AppImage" },
        },
      },
      null,
      2,
    ),
    "main.js": `const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

const ISOLATED_PARTITION = 'helix-generated-app';
let sessionConfigured = false;

// Renderer storage is disabled where Chromium supports it. The remaining
// session storage is memory-only and cleared before and after each window.
app.commandLine.appendSwitch('disable-local-storage');

async function configureIsolatedSession(trustedPage) {
  const isolatedSession = session.fromPartition(ISOLATED_PARTITION, { cache: false });
  await Promise.all([
    isolatedSession.clearCache(),
    isolatedSession.clearStorageData(),
  ]);

  if (!sessionConfigured) {
    isolatedSession.setPermissionCheckHandler(() => false);
    isolatedSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
      callback(false);
    });
    isolatedSession.setDevicePermissionHandler(() => false);
    isolatedSession.on('will-download', (event) => event.preventDefault());
    isolatedSession.webRequest.onBeforeRequest((details, callback) => {
      const allowed =
        details.url === trustedPage ||
        details.url.startsWith('data:') ||
        details.url.startsWith('blob:');
      callback({ cancel: !allowed });
    });
    sessionConfigured = true;
  }

  return isolatedSession;
}

async function create() {
  const trustedPage = pathToFileURL(path.join(__dirname, 'index.html')).toString();
  const isolatedSession = await configureIsolatedSession(trustedPage);
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: ${JSON.stringify(input.title)},
    backgroundColor: '#070914',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      partition: ISOLATED_PARTITION,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      webviewTag: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      navigateOnDragDrop: false,
      safeDialogs: true,
      devTools: false,
    },
  });

  const allowOnlyPackagedPage = (event, navigationUrl) => {
    const allowed =
      navigationUrl === trustedPage || navigationUrl.startsWith(trustedPage + '#');
    if (!allowed) event.preventDefault();
  };
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', allowOnlyPackagedPage);
  win.webContents.on('will-redirect', allowOnlyPackagedPage);
  win.webContents.on('will-attach-webview', (event) => event.preventDefault());

  await win.loadURL(trustedPage);
  win.on('closed', () => {
    void isolatedSession.clearCache();
    void isolatedSession.clearStorageData();
  });
}
app.whenReady().then(create);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void create();
});
`,
    "preload.js": `'use strict';
// Intentionally empty: no renderer bridge or privileged API is exposed.
`,
    "index.html": protectedHtml,
    "manifest.json": JSON.stringify(
      {
        name: input.title,
        short_name: input.title.slice(0, 12),
        start_url: ".",
        display: "standalone",
        background_color: "#070914",
        theme_color: "#7C3AED",
      },
      null,
      2,
    ),
  };
}

export function withPwa(html: string, title: string, _slug: string) {
  const manifest = {
    name: title,
    short_name: title.slice(0, 12),
    start_url: `.`,
    display: "standalone",
    background_color: "#070914",
    theme_color: "#7C3AED",
  };
  const tag = `<link rel="manifest" href="data:application/manifest+json,${encodeURIComponent(JSON.stringify(manifest))}"/>
<meta name="apple-mobile-web-app-capable" content="yes"/>
<meta name="apple-mobile-web-app-title" content="${title.replace(/"/g, "")}"/>
<meta name="mobile-web-app-capable" content="yes"/>`;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => `${m}\n${tag}`);
  return tag + html;
}

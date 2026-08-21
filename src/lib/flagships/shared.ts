import type { Locale } from "@/lib/i18n-core";

export function escapeFlagshipMarkup(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function flagshipScriptData(value: unknown): string {
  return JSON.stringify(value).replaceAll("</script", "<\\/script");
}

export function flagshipDocument(input: {
  id: string;
  locale: Locale;
  title: string;
  themeColor: string;
  css: string;
  body: string;
  script: string;
}): string {
  const title = escapeFlagshipMarkup(input.title);
  return `<!doctype html>
<html lang="${input.locale}" data-flagship="${input.id}" data-locale="${input.locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="${input.themeColor}">
<title>${title}</title>
<style>
*{box-sizing:border-box}
html,body{margin:0;min-height:100%;width:100%}
button,input,select{font:inherit}
button:not(:disabled),input[type="range"],select{cursor:pointer}
svg,canvas{display:block}
[hidden]{display:none!important}
${input.css}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important;transition-duration:.01ms!important}}
</style>
</head>
<body>${input.body}<script>(()=>{"use strict";${input.script}})();</script></body>
</html>`;
}

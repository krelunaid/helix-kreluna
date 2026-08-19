export type LookId = "ember" | "ink" | "paper" | "noir";

export type Look = {
  id: LookId;
  name: string;
  mood: string;
  bg: string;
  fg: string;
  muted: string;
  accent: string;
  onAccent: string;
  elevated: string;
  display: string;
  body: string;
};

export const LOOKS: Look[] = [
  {
    id: "ember",
    name: "Helix",
    mood: "Night engine. Violet, cyan edge, quiet metal.",
    bg: "#070914",
    fg: "#f8fafc",
    muted: "#aab3c5",
    accent: "#7c3aed",
    onAccent: "#f8fafc",
    elevated: "#131a2e",
    display: "Fraunces, Newsreader, Georgia, serif",
    body: "Outfit, Sora, system-ui, sans-serif",
  },
  {
    id: "ink",
    name: "Ink",
    mood: "Gallery. Cold stone, one sharp mark.",
    bg: "#10141a",
    fg: "#e8eef4",
    muted: "#9aabc0",
    accent: "#7eb6ff",
    onAccent: "#071018",
    elevated: "#171d26",
    display: "Newsreader, Georgia, serif",
    body: "Sora, system-ui, sans-serif",
  },
  {
    id: "paper",
    name: "Paper",
    mood: "Daylight studio. Cream, ink, one red.",
    bg: "#f3ece2",
    fg: "#1a1612",
    muted: "#5c534a",
    accent: "#7c3aed",
    onAccent: "#f8fafc",
    elevated: "#fffaf3",
    display: "Newsreader, Georgia, serif",
    body: "Sora, system-ui, sans-serif",
  },
  {
    id: "noir",
    name: "Noir",
    mood: "Film still. Black, bone, a single cut.",
    bg: "#0a0a0a",
    fg: "#f2efe8",
    muted: "#a3a399",
    accent: "#f5f0e6",
    onAccent: "#0a0a0a",
    elevated: "#161616",
    display: "Newsreader, Georgia, serif",
    body: "Sora, system-ui, sans-serif",
  },
];

export function lookById(id?: string | null): Look {
  return LOOKS.find((l) => l.id === id) ?? LOOKS[0];
}

export function applyLook(html: string, look: Look): string {
  const css = `
html,body{background:${look.bg}!important;color:${look.fg}!important;font-family:${look.body}!important}
h1,h2,h3,.mark,.hero-copy h1{font-family:${look.display}!important;color:${look.fg}!important}
p,label,span,li{color:inherit}
.lead,.meta,nav{color:${look.muted}!important}
button,.cta,button.add,[type=submit]{background:${look.accent}!important;color:${look.onAccent}!important;border-color:transparent!important}
input,select,textarea{background:${look.elevated}!important;color:${look.fg}!important;border-color:color-mix(in oklab,${look.fg} 16%,transparent)!important}
header,.dish,li,article,.wrap{color:${look.fg}}
.dish,li,article{background:${look.elevated}!important}
`;
  const tag = `<style id="lumen-look">${css}</style>`;
  const cleaned = html.replace(/<style id="lumen-look">[\s\S]*?<\/style>/i, "");
  if (/<\/head>/i.test(cleaned)) return cleaned.replace(/<\/head>/i, `${tag}</head>`);
  return tag + cleaned;
}

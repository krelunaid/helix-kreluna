export const GEMS = [
  {
    id: "sable",
    name: "Sable",
    craft: "First screen",
    craftIt: "Prima schermata",
    brief: "Fills the first screen for this brief with real items.",
    briefIt: "Riempio la prima schermata: oggetti veri, non scatole vuote.",
  },
  {
    id: "wren",
    name: "Wren",
    craft: "Interactions",
    craftIt: "Interazioni",
    brief: "Tabs and primary taps must change the interior.",
    briefIt: "Ogni tasto deve cambiare ciò che vedi, non solo il colore.",
  },
  {
    id: "bramble",
    name: "Bramble",
    craft: "Copy",
    craftIt: "Testi",
    brief: "Kills empty copy. Specific names, prices, places.",
    briefIt: "Tolgo i testi vuoti. Nomi, prezzi, posti veri.",
  },
] as const;

export type GemId = (typeof GEMS)[number]["id"];

export type GemRun = {
  id: GemId;
  name: string;
  did: string;
  validation?: {
    checks: readonly string[];
    artifactSha256: string;
    aegisPassed: boolean;
  };
};

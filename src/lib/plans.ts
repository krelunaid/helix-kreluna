export const PLAN_IDS = ["free", "standard", "pro", "team"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export type Plan = {
  id: PlanId;
  name: string;
  price: number;
  currency: "$" | "€";
  credits: number;
  note: string;
  highlight?: boolean;
};

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Starter",
    price: 0,
    currency: "€",
    credits: 10,
    note: "Prototipi. Anteprime che scadono.",
  },
  {
    id: "standard",
    name: "Creator",
    price: 20,
    currency: "$",
    credits: 100,
    note: "Developer e creator.",
    highlight: true,
  },
  {
    id: "pro",
    name: "Pro",
    price: 200,
    currency: "$",
    credits: 750,
    note: "Prodotti completi.",
  },
  {
    id: "team",
    name: "Business",
    price: 300,
    currency: "$",
    credits: 1250,
    note: "Startup e aziende.",
  },
];

export const ACTIONS = {
  generate: { credits: 8, label: "Genera app" },
  iterate: { credits: 3, label: "Modifica" },
  debug: { credits: 2, label: "Debug" },
  host: { credits: 50, label: "Hosting 30 giorni" },
} as const;

export type ActionId = keyof typeof ACTIONS;

export const EXTRA_PACK = { credits: 50, price: 15, currency: "€" as const };

export function planById(id: string): Plan {
  return PLANS.find((p) => p.id === id) ?? PLANS[0];
}

type EventName =
  | "home_view"
  | "cta_create_free"
  | "cta_demo"
  | "kind_select"
  | "first_prompt"
  | "signup_start"
  | "project_created"
  | "preview_seen"
  | "pricing_view"
  | "checkout_start"
  | "generate_error"
  | "project_published";

export function track(name: EventName, extra?: Record<string, string | number | boolean>) {
  if (typeof window === "undefined") return;
  const payload = { name, at: Date.now(), ...extra };
  const sink = (window as Window & { helixTrack?: (p: typeof payload) => void }).helixTrack;
  if (sink) sink(payload);
}

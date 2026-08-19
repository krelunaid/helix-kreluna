import type { ChatMessage } from "@/lib/server/vetra";

export type GuestProject = {
  title: string;
  prompt: string;
  html: string;
  messages: ChatMessage[];
  usedAi: boolean;
  locale: string;
};

const KEY = "kreluna.guest.project";

function store() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? window.sessionStorage;
  } catch {
    return null;
  }
}

export function loadGuest(): GuestProject | null {
  const s = store();
  if (!s) return null;
  try {
    const raw = s.getItem(KEY) ?? (typeof sessionStorage !== "undefined" ? sessionStorage.getItem(KEY) : null);
    if (!raw) return null;
    const v = JSON.parse(raw) as GuestProject;
    if (!v || typeof v.html !== "string") return null;
    return v;
  } catch {
    return null;
  }
}

export function saveGuest(project: GuestProject) {
  const s = store();
  if (!s) return;
  s.setItem(KEY, JSON.stringify(project));
}

export function clearGuest() {
  try {
    localStorage.removeItem(KEY);
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

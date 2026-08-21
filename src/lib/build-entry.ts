export type BuildEntryDecision = "wait_for_session" | "authenticated" | "login" | "guest";

export type BuildEntryState = Readonly<{
  authEnabled: boolean;
  previewPasswordSignInEnabled: boolean;
  isPending: boolean;
  userPresent: boolean;
}>;

export const PENDING_BUILD_PROMPT_KEY = "kreluna.prompt";

type BuildPromptStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function decideBuildEntry(state: BuildEntryState): BuildEntryDecision {
  if (state.userPresent) return "authenticated";
  if (!state.authEnabled || state.previewPasswordSignInEnabled) return "guest";
  return state.isPending ? "wait_for_session" : "login";
}

export function buildLoginSearch(prompt: string): { next: "/"; prompt: string } {
  return { next: "/", prompt: prompt.trim() };
}

export function buildPromptDestination(
  next: string | undefined,
  prompt: string | undefined,
): string {
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : "/";
  const normalizedPrompt = prompt?.trim();
  if (!normalizedPrompt) return safeNext;
  const destination = new URL(safeNext, "https://helix.invalid");
  destination.searchParams.set("prompt", normalizedPrompt);
  return `${destination.pathname}${destination.search}${destination.hash}`;
}

export function preservePendingBuildPrompt(
  storage: Pick<BuildPromptStorage, "setItem">,
  prompt: string,
): void {
  storage.setItem(PENDING_BUILD_PROMPT_KEY, prompt.trim());
}

export function takePendingBuildPrompt(
  storage: Pick<BuildPromptStorage, "getItem" | "removeItem">,
  routePrompt?: string,
): string | null {
  const prompt = routePrompt?.trim() || storage.getItem(PENDING_BUILD_PROMPT_KEY)?.trim();
  if (!prompt) return null;
  storage.removeItem(PENDING_BUILD_PROMPT_KEY);
  return prompt;
}

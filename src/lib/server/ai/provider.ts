import { AiProviderError, type AiCompletionProvider } from "@/lib/server/ai/types";

/** Explicit registry: selecting a missing provider fails instead of falling back. */
export class AiProviderRegistry {
  readonly #providers = new Map<string, AiCompletionProvider>();

  constructor(providers: readonly AiCompletionProvider[] = []) {
    for (const provider of providers) this.register(provider);
  }

  register(provider: AiCompletionProvider): void {
    const id = provider.id.trim();
    if (!id || this.#providers.has(id)) {
      throw new Error(id ? `AI_PROVIDER_DUPLICATE:${id}` : "AI_PROVIDER_ID_INVALID");
    }
    this.#providers.set(id, provider);
  }

  get(id: string): AiCompletionProvider {
    const provider = this.#providers.get(id);
    if (!provider) {
      throw new AiProviderError(`AI_PROVIDER_NOT_CONFIGURED:${id}`, {
        retryable: false,
      });
    }
    return provider;
  }

  ids(): readonly string[] {
    return [...this.#providers.keys()].sort();
  }
}

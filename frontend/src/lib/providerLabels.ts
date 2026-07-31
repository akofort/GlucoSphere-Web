/** Short, clean provider names for attribution lines ("Ausgewertet mit: ...") and log tables --
 * distinct from model_catalog.PROVIDER_LABELS on the backend, which include suffixes like "API"/
 * "(empfohlen)" meant for the LLM-config picker, not a one-line attribution under an answer. */
export const PROVIDER_SHORT_LABELS: Record<string, string> = {
  GEMINI: "Google Gemini",
  CLAUDE: "Anthropic Claude",
  OPENAI: "OpenAI / OpenRouter",
  DEEPSEEK: "DeepSeek",
};

export function providerLabel(provider: string): string {
  return PROVIDER_SHORT_LABELS[provider] ?? provider;
}

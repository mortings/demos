/**
 * Cleanup through any OpenAI-compatible chat completions endpoint (OpenAI,
 * Mistral, Ollama, LM Studio, ...). Provided for people who prefer a different
 * or fully local model; the Anthropic path is the default.
 */
export interface OpenAiCompatibleCleanupOptions {
  baseUrl: string;
  apiKey: string | null;
  model: string;
  system: string;
  user: string;
  timeoutMs: number;
}

/**
 * OpenAI's reasoning models (gpt-5.x, o-series) reject `temperature` and take a
 * `reasoning_effort` instead; everything else gets a low temperature for
 * deterministic cleanup.
 */
function modelParams(model: string): Record<string, unknown> {
  if (/^(gpt-5|o\d)/i.test(model)) return { reasoning_effort: 'low' };
  return { temperature: 0.2 };
}

export async function cleanupWithOpenAiCompatible(opts: OpenAiCompatibleCleanupOptions): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (opts.apiKey) headers.Authorization = `Bearer ${opts.apiKey}`;
    const res = await fetch(`${opts.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: opts.model,
        ...modelParams(opts.model),
        messages: [
          { role: 'system', content: opts.system },
          { role: 'user', content: opts.user },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`LLM ${res.status}: ${body.slice(0, 300)}`);
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
    return (json.choices?.[0]?.message?.content ?? '').trim();
  } finally {
    clearTimeout(timer);
  }
}

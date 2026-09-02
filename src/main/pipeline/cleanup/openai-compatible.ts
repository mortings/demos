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
        temperature: 0.2,
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

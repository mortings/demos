import Anthropic from '@anthropic-ai/sdk';
import type { Effort } from '../../../shared/types';

export interface AnthropicCleanupOptions {
  apiKey: string;
  model: string;
  effort: Effort;
  system: string;
  user: string;
  timeoutMs: number;
}

const clients = new Map<string, Anthropic>();

function clientFor(apiKey: string): Anthropic {
  let client = clients.get(apiKey);
  if (!client) {
    client = new Anthropic({ apiKey, maxRetries: 1 });
    clients.set(apiKey, client);
  }
  return client;
}

/** `output_config.effort` is rejected by the 4.5 generation and older. */
function supportsEffort(model: string): boolean {
  return !/haiku-4-5|sonnet-4-5|opus-4-5|opus-4-1|opus-4$|sonnet-4$/.test(model);
}

/** Server-side refusal fallbacks are documented for Claude Opus 5 and the Fable family. */
function supportsFallbacks(model: string): boolean {
  return /^claude-(opus-5|fable)/.test(model);
}

export class CleanupRefusedError extends Error {
  constructor() {
    super('The cleanup model declined to process this text');
    this.name = 'CleanupRefusedError';
  }
}

/**
 * One request, no tools, no streaming: the whole dictation comes back as a
 * single text block. The long system prompt is marked for prompt caching so
 * only the transcript itself is billed at full price after the first call.
 * Thinking is left at the model default (adaptive) and depth is controlled
 * with `effort`, which is what keeps this fast enough for dictation.
 */
export async function cleanupWithAnthropic(opts: AnthropicCleanupOptions): Promise<string> {
  const client = clientFor(opts.apiKey);
  const system = [{ type: 'text' as const, text: opts.system, cache_control: { type: 'ephemeral' as const } }];
  const messages = [{ role: 'user' as const, content: opts.user }];
  const outputConfig = supportsEffort(opts.model) ? { output_config: { effort: opts.effort } } : {};
  const requestOptions = { timeout: opts.timeoutMs };

  if (supportsFallbacks(opts.model)) {
    // Safety classifiers can decline a request; `fallbacks: "default"` re-runs
    // it server-side on Anthropic's recommended substitute instead of failing.
    const response = await client.beta.messages.create(
      {
        model: opts.model,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system,
        messages,
        ...outputConfig,
      },
      requestOptions,
    );
    if (response.stop_reason === 'refusal') throw new CleanupRefusedError();
    return response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();
  }

  const response = await client.messages.create(
    {
      model: opts.model,
      max_tokens: 16000,
      system,
      messages,
      ...outputConfig,
    },
    requestOptions,
  );
  if (response.stop_reason === 'refusal') throw new CleanupRefusedError();
  return response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
}

export function describeAnthropicError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return 'Anthropic API key was rejected';
  if (err instanceof Anthropic.RateLimitError) return 'Anthropic rate limit reached';
  if (err instanceof Anthropic.APIConnectionTimeoutError) return 'Anthropic request timed out';
  if (err instanceof Anthropic.APIConnectionError) return 'Could not reach the Anthropic API';
  if (err instanceof Anthropic.BadRequestError) return `Anthropic rejected the request: ${err.message}`;
  if (err instanceof Anthropic.APIError) return `Anthropic API error ${err.status}: ${err.message}`;
  if (err instanceof Error) return err.message;
  return String(err);
}

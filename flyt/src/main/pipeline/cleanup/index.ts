import type { ActiveApp, SecretName, Settings, TextStyle } from '../../../shared/types';
import { cleanupWithAnthropic, describeAnthropicError } from './anthropic';
import { guardCleanup } from './guard';
import { cleanupWithOpenAiCompatible } from './openai-compatible';
import { CLEANUP_SYSTEM_PROMPT, buildCleanupUserMessage, resolveStyle } from './prompt';
import { applyDictionary, applyRules, applySnippets } from './rules';
import { collapseWhitespace } from './text-utils';

export type CleanupEngine = 'anthropic' | 'openai-compatible' | 'rules' | 'raw';

export interface CleanupResult {
  text: string;
  engine: CleanupEngine;
  style: TextStyle;
  latencyMs: number;
  /** Set when the model path failed and the rules fallback was used. */
  note?: string;
}

export interface CleanupContext {
  settings: Settings;
  secret: (name: SecretName) => string | null;
  app: ActiveApp | null;
  /** Text already inserted earlier in this hands-free session. */
  previousText: string | null;
  detectedLanguage: string | null;
}

export function llmConfigured(settings: Settings, secret: (name: SecretName) => string | null): boolean {
  switch (settings.llm.provider) {
    case 'anthropic':
      return Boolean(secret('anthropic'));
    case 'openai-compatible':
      return Boolean(settings.llm.customBaseUrl.trim());
    case 'none':
      return false;
  }
}

function rulesFallback(raw: string, ctx: CleanupContext, style: TextStyle): string {
  const d = ctx.settings.dictation;
  return applyRules(raw, {
    removeFillers: d.removeFillers,
    voiceCommands: d.voiceCommands,
    style,
    dictionary: ctx.settings.dictionary,
    snippets: ctx.settings.snippets,
    finish: d.smartPunctuation,
  });
}

/** Cheap deterministic pass on top of the model output. */
function safetyNet(text: string, ctx: CleanupContext): string {
  return collapseWhitespace(applyDictionary(text, ctx.settings.dictionary));
}

export async function cleanupTranscript(raw: string, ctx: CleanupContext): Promise<CleanupResult> {
  const started = Date.now();
  const { settings } = ctx;
  const resolved = resolveStyle(ctx.app, settings.appStyles, settings.dictation.defaultStyle);
  const style = resolved.style;
  const finish = (text: string, engine: CleanupEngine, note?: string): CleanupResult => ({
    text,
    engine,
    style,
    latencyMs: Date.now() - started,
    ...(note ? { note } : {}),
  });

  const trimmed = collapseWhitespace(raw);
  if (!trimmed) return finish('', 'raw');
  if (settings.dictation.rawMode) return finish(trimmed, 'raw');
  if (settings.llm.provider === 'none' || !llmConfigured(settings, ctx.secret)) {
    return finish(rulesFallback(trimmed, ctx, style), 'rules');
  }

  const user = buildCleanupUserMessage(trimmed, {
    settings,
    app: ctx.app,
    style,
    appInstructions: resolved.instructions,
    previousText: ctx.previousText,
    detectedLanguage: ctx.detectedLanguage,
  });

  try {
    let output: string;
    let engine: CleanupEngine;
    if (settings.llm.provider === 'anthropic') {
      engine = 'anthropic';
      output = await cleanupWithAnthropic({
        apiKey: ctx.secret('anthropic') as string,
        model: settings.llm.models.anthropic ?? 'claude-opus-5',
        effort: settings.llm.effort,
        system: CLEANUP_SYSTEM_PROMPT,
        user,
        timeoutMs: settings.llm.timeoutMs,
      });
    } else {
      engine = 'openai-compatible';
      output = await cleanupWithOpenAiCompatible({
        baseUrl: settings.llm.customBaseUrl,
        apiKey: ctx.secret('openaiCompatible'),
        model: settings.llm.models['openai-compatible'] ?? 'gpt-4.1-mini',
        system: CLEANUP_SYSTEM_PROMPT,
        user,
        timeoutMs: settings.llm.timeoutMs,
      });
    }
    const snippetMatched = applySnippets(trimmed, settings.snippets).matched;
    const guarded = guardCleanup(trimmed, output, { allowGrowth: snippetMatched || settings.dictation.translateTo !== 'off' });
    if (!guarded.accepted) {
      return finish(rulesFallback(trimmed, ctx, style), 'rules', `Model output rejected (${guarded.reason}); used offline cleanup`);
    }
    return finish(safetyNet(guarded.text, ctx), engine);
  } catch (err) {
    const message = settings.llm.provider === 'anthropic' ? describeAnthropicError(err) : err instanceof Error ? err.message : String(err);
    return finish(rulesFallback(trimmed, ctx, style), 'rules', `${message}; used offline cleanup`);
  }
}

/** Round-trip used by the "Test" button in settings. */
export async function testCleanup(settings: Settings, secret: (name: SecretName) => string | null): Promise<{ ok: boolean; message: string; latencyMs: number }> {
  const started = Date.now();
  if (settings.llm.provider === 'none') return { ok: true, message: 'Cleanup model disabled; offline rules will be used.', latencyMs: 0 };
  if (!llmConfigured(settings, secret)) return { ok: false, message: 'No API key / endpoint configured for the cleanup model.', latencyMs: 0 };
  const sample = 'um so let\'s meet on monday no wait tuesday at ten and uh bring the the quarterly numbers';
  const user = buildCleanupUserMessage(sample, {
    settings,
    app: null,
    style: 'standard',
    appInstructions: '',
    previousText: null,
    detectedLanguage: 'en',
  });
  try {
    const output =
      settings.llm.provider === 'anthropic'
        ? await cleanupWithAnthropic({
            apiKey: secret('anthropic') as string,
            model: settings.llm.models.anthropic ?? 'claude-opus-5',
            effort: settings.llm.effort,
            system: CLEANUP_SYSTEM_PROMPT,
            user,
            timeoutMs: settings.llm.timeoutMs,
          })
        : await cleanupWithOpenAiCompatible({
            baseUrl: settings.llm.customBaseUrl,
            apiKey: secret('openaiCompatible'),
            model: settings.llm.models['openai-compatible'] ?? 'gpt-4.1-mini',
            system: CLEANUP_SYSTEM_PROMPT,
            user,
            timeoutMs: settings.llm.timeoutMs,
          });
    return { ok: true, message: `"${sample}" → "${output}"`, latencyMs: Date.now() - started };
  } catch (err) {
    return {
      ok: false,
      message: settings.llm.provider === 'anthropic' ? describeAnthropicError(err) : err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - started,
    };
  }
}

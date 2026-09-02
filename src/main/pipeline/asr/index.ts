import type { DictionaryEntry, SecretName, Settings } from '../../../shared/types';
import { ASR_SECRET } from '../../../shared/defaults';
import { encodeWav } from '../wav';
import { createDeepgramTranscriber } from './deepgram';
import { createElevenLabsTranscriber } from './elevenlabs';
import { createOpenAiCompatibleTranscriber } from './openai-compatible';
import type { Transcriber } from './types';

export * from './types';

export { ASR_SECRET };

export type SecretLookup = (name: SecretName) => string | null;

/** Build the recogniser for the current settings, or null when it lacks a key. */
export function createTranscriber(settings: Settings, secret: SecretLookup): Transcriber | null {
  const { provider } = settings.asr;
  const model = settings.asr.models[provider] ?? '';
  const key = secret(ASR_SECRET[provider]);
  switch (provider) {
    case 'openai':
      if (!key) return null;
      return createOpenAiCompatibleTranscriber({ name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', apiKey: key, model });
    case 'groq':
      if (!key) return null;
      return createOpenAiCompatibleTranscriber({ name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', apiKey: key, model });
    case 'deepgram':
      if (!key) return null;
      return createDeepgramTranscriber({ apiKey: key, model, keyterms: dictionaryTerms(settings.dictionary) });
    case 'elevenlabs':
      if (!key) return null;
      return createElevenLabsTranscriber({ apiKey: key, model });
    case 'custom':
      if (!settings.asr.customBaseUrl.trim()) return null;
      return createOpenAiCompatibleTranscriber({ name: 'Custom', baseUrl: settings.asr.customBaseUrl.trim(), apiKey: key, model });
  }
}

export function dictionaryTerms(dictionary: DictionaryEntry[]): string[] {
  return dictionary.map((d) => d.term.trim()).filter(Boolean);
}

/**
 * Whisper-style recognisers accept a text "prompt" that biases spelling and
 * style. We hand them the custom vocabulary and the tail of what was just
 * transcribed so names stay consistent across chunks.
 */
export function buildAsrPrompt(dictionary: DictionaryEntry[], previous: string | null): string {
  const terms = dictionaryTerms(dictionary);
  const parts: string[] = [];
  if (terms.length) parts.push(terms.join(', ') + '.');
  if (previous && previous.trim()) parts.push(previous.trim().slice(-300));
  return parts.join(' ');
}

/** A short, quiet WAV used to verify credentials without spending much. */
export function probeWav(): Uint8Array {
  const sampleRate = 16000;
  const pcm = new Int16Array(sampleRate); // one second
  for (let i = 0; i < pcm.length; i++) {
    // Faint 440 Hz tone so servers that reject pure silence still accept it.
    pcm[i] = Math.round(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 300);
  }
  return encodeWav(pcm, sampleRate);
}

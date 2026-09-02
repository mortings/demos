import type { LanguageMode } from '../../../shared/types';

export interface TranscribeRequest {
  /** RIFF/WAVE bytes, 16 kHz mono 16-bit. */
  wav: Uint8Array;
  languageMode: LanguageMode;
  /** Vocabulary / context hint for recognisers that support it. */
  prompt?: string;
  signal?: AbortSignal;
}

export interface TranscribeResult {
  text: string;
  /** ISO 639-1 code reported by the recogniser, if any. */
  language: string | null;
}

export interface Transcriber {
  readonly name: string;
  transcribe(req: TranscribeRequest): Promise<TranscribeResult>;
}

export class AsrError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'AsrError';
  }
}

export function wavBlob(wav: Uint8Array): Blob {
  const copy = new Uint8Array(wav.byteLength);
  copy.set(wav);
  return new Blob([copy], { type: 'audio/wav' });
}

export async function readErrorBody(res: Response): Promise<string> {
  try {
    const text = await res.text();
    try {
      const json = JSON.parse(text) as { error?: { message?: string } | string; message?: string; detail?: unknown };
      if (typeof json.error === 'string') return json.error;
      if (json.error?.message) return json.error.message;
      if (json.message) return json.message;
      if (json.detail) return typeof json.detail === 'string' ? json.detail : JSON.stringify(json.detail);
    } catch {
      /* not json */
    }
    return text.slice(0, 300);
  } catch {
    return res.statusText;
  }
}

/** Normalise language codes from different providers to ISO 639-1. */
export function normaliseLanguage(code: string | null | undefined): string | null {
  if (!code) return null;
  const lower = code.toLowerCase();
  const map: Record<string, string> = {
    english: 'en',
    eng: 'en',
    norwegian: 'no',
    nor: 'no',
    nob: 'no',
    nno: 'no',
    nb: 'no',
    nn: 'no',
    'no-nb': 'no',
    'no-nn': 'no',
    'nb-no': 'no',
    'en-us': 'en',
    'en-gb': 'en',
  };
  return map[lower] ?? lower.slice(0, 2);
}

export function languageParam(mode: LanguageMode): string | undefined {
  return mode === 'auto' ? undefined : mode;
}

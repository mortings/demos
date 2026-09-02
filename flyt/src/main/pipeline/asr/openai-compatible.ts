import { AsrError, languageParam, normaliseLanguage, originOf, readErrorBody, wavBlob, type Transcriber, type TranscribeRequest, type TranscribeResult } from './types';

export interface OpenAiCompatibleOptions {
  name: string;
  baseUrl: string;
  apiKey: string | null;
  model: string;
}

/**
 * Speech-to-text through the OpenAI `/audio/transcriptions` shape. Used for
 * OpenAI itself (gpt-4o-transcribe, whisper-1), Groq (whisper-large-v3) and
 * any self-hosted server that speaks the same protocol (whisper.cpp server,
 * faster-whisper-server, Speaches, LocalAI, ...).
 */
export function createOpenAiCompatibleTranscriber(opts: OpenAiCompatibleOptions): Transcriber {
  const isWhisper = /whisper/i.test(opts.model);
  return {
    name: opts.name,
    origin: originOf(opts.baseUrl),
    async transcribe(req: TranscribeRequest): Promise<TranscribeResult> {
      const form = new FormData();
      form.append('file', wavBlob(req.wav), 'audio.wav');
      form.append('model', opts.model);
      // whisper models return the detected language with verbose_json; the
      // gpt-4o-transcribe family only supports json/text.
      form.append('response_format', isWhisper ? 'verbose_json' : 'json');
      form.append('temperature', '0');
      const language = languageParam(req.languageMode);
      if (language) form.append('language', language);
      if (req.prompt) form.append('prompt', req.prompt.slice(0, 800));

      const headers: Record<string, string> = {};
      if (opts.apiKey) headers.Authorization = `Bearer ${opts.apiKey}`;
      const url = `${opts.baseUrl.replace(/\/+$/, '')}/audio/transcriptions`;
      const res = await fetch(url, { method: 'POST', headers, body: form, signal: req.signal });
      if (!res.ok) throw new AsrError(`${opts.name}: ${res.status} ${await readErrorBody(res)}`, res.status);
      const json = (await res.json()) as { text?: string; language?: string };
      return { text: (json.text ?? '').trim(), language: normaliseLanguage(json.language) };
    },
  };
}

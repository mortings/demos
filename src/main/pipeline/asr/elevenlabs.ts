import { AsrError, languageParam, normaliseLanguage, readErrorBody, wavBlob, type Transcriber, type TranscribeRequest, type TranscribeResult } from './types';

export interface ElevenLabsOptions {
  apiKey: string;
  model: string;
  /** Vocabulary boosted through Scribe keyterms (max 100, each ≤ 5 words / 50 chars). */
  keyterms: string[];
}

/**
 * ElevenLabs Scribe v2: the most accurate option on Norwegian by a wide margin
 * (about 3 % word error rate on FLEURS versus about 10 % for Whisper large-v3).
 */
export function createElevenLabsTranscriber(opts: ElevenLabsOptions): Transcriber {
  return {
    name: 'ElevenLabs',
    async transcribe(req: TranscribeRequest): Promise<TranscribeResult> {
      const form = new FormData();
      form.append('file', wavBlob(req.wav), 'audio.wav');
      form.append('model_id', opts.model);
      form.append('tag_audio_events', 'false');
      form.append('diarize', 'false');
      form.append('timestamps_granularity', 'none');
      const language = languageParam(req.languageMode);
      if (language) form.append('language_code', language);
      for (const term of opts.keyterms
        .filter((t) => t.length <= 50 && t.split(/\s+/).length <= 5)
        .slice(0, 100)) {
        form.append('keyterms', term);
      }
      const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
        method: 'POST',
        headers: { 'xi-api-key': opts.apiKey },
        body: form,
        signal: req.signal,
      });
      if (!res.ok) throw new AsrError(`ElevenLabs: ${res.status} ${await readErrorBody(res)}`, res.status);
      const json = (await res.json()) as { text?: string; language_code?: string };
      return { text: (json.text ?? '').trim(), language: normaliseLanguage(json.language_code) };
    },
  };
}

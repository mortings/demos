import { AsrError, languageParam, normaliseLanguage, readErrorBody, wavBlob, type Transcriber, type TranscribeRequest, type TranscribeResult } from './types';

export interface ElevenLabsOptions {
  apiKey: string;
  model: string;
}

/** ElevenLabs Scribe: very strong on Norwegian and other smaller languages. */
export function createElevenLabsTranscriber(opts: ElevenLabsOptions): Transcriber {
  return {
    name: 'ElevenLabs',
    async transcribe(req: TranscribeRequest): Promise<TranscribeResult> {
      const form = new FormData();
      form.append('file', wavBlob(req.wav), 'audio.wav');
      form.append('model_id', opts.model);
      form.append('tag_audio_events', 'false');
      form.append('diarize', 'false');
      const language = languageParam(req.languageMode);
      if (language) form.append('language_code', language);
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

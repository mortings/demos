import { AsrError, languageParam, normaliseLanguage, readErrorBody, type Transcriber, type TranscribeRequest, type TranscribeResult } from './types';

export interface DeepgramOptions {
  apiKey: string;
  model: string;
  /** Vocabulary boosted through Deepgram keyterms (nova-3) / keywords (nova-2). */
  keyterms: string[];
}

interface DeepgramResponse {
  results?: {
    channels?: {
      detected_language?: string;
      alternatives?: { transcript?: string }[];
    }[];
  };
}

export function createDeepgramTranscriber(opts: DeepgramOptions): Transcriber {
  return {
    name: 'Deepgram',
    origin: 'https://api.deepgram.com',
    async transcribe(req: TranscribeRequest): Promise<TranscribeResult> {
      const params = new URLSearchParams();
      params.set('model', opts.model);
      params.set('smart_format', 'true');
      params.set('punctuate', 'true');
      const language = languageParam(req.languageMode);
      if (language) params.set('language', language);
      else params.set('detect_language', 'true');
      const keyParam = /nova-3/i.test(opts.model) ? 'keyterm' : 'keywords';
      for (const term of opts.keyterms.slice(0, 50)) params.append(keyParam, term);

      const body = new Uint8Array(req.wav.byteLength);
      body.set(req.wav);
      const res = await fetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
        method: 'POST',
        headers: { Authorization: `Token ${opts.apiKey}`, 'Content-Type': 'audio/wav' },
        body,
        signal: req.signal,
      });
      if (!res.ok) throw new AsrError(`Deepgram: ${res.status} ${await readErrorBody(res)}`, res.status);
      const json = (await res.json()) as DeepgramResponse;
      const channel = json.results?.channels?.[0];
      return {
        text: (channel?.alternatives?.[0]?.transcript ?? '').trim(),
        language: normaliseLanguage(channel?.detected_language),
      };
    },
  };
}

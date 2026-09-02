import { countWords } from '../../../shared/util';

/**
 * A model asked to "clean up" text sometimes answers it, summarises it or
 * wraps it in quotes instead. The guard rejects those outputs so the user
 * gets their own words back rather than a chatbot reply in their document.
 */
export interface GuardResult {
  text: string;
  accepted: boolean;
  reason?: string;
}

const PREAMBLES =
  /^(?:here(?:'s| is)\b|sure[,!.]|certainly|of course|i(?:'m| am) (?:sorry|unable)|i can(?:'t|not)|as an ai|the cleaned|cleaned (?:text|transcript)|her er|selvfølgelig|beklager|jeg kan ikke|jeg kan dessverre)/i;

export function guardCleanup(raw: string, cleaned: string, opts: { allowGrowth?: boolean } = {}): GuardResult {
  let text = cleaned.replace(/^\s*```[a-z]*\s*|\s*```\s*$/g, '').trim();
  const rawTrimmed = raw.trim();

  if (!rawTrimmed) return { text: '', accepted: true };

  if (/<\/?(?:transcript|request|vocabulary|snippets|previous_text)>/i.test(text)) {
    return { text: rawTrimmed, accepted: false, reason: 'tags' };
  }

  // Strip wrapping quotes the model added.
  const wrapped = /^["“«'](.*)["”»']$/s.exec(text);
  if (wrapped && !/^["“«']/.test(rawTrimmed)) text = (wrapped[1] as string).trim();

  if (!text) {
    // Nothing left: legitimate only when the input was fillers/noise.
    return countWords(rawTrimmed) <= 3 ? { text: '', accepted: true } : { text: rawTrimmed, accepted: false, reason: 'empty' };
  }

  if (PREAMBLES.test(text) && !PREAMBLES.test(rawTrimmed)) {
    return { text: rawTrimmed, accepted: false, reason: 'preamble' };
  }

  const rawWords = countWords(rawTrimmed);
  const cleanWords = countWords(text);
  if (rawWords >= 12 && cleanWords < rawWords * 0.4) {
    return { text: rawTrimmed, accepted: false, reason: 'too-short' };
  }
  if (!opts.allowGrowth && cleanWords > rawWords * 2 + 8) {
    return { text: rawTrimmed, accepted: false, reason: 'too-long' };
  }
  return { text, accepted: true };
}

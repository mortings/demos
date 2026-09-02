import type { DictionaryEntry, Snippet, TextStyle } from '../../../shared/types';
import {
  capitaliseSentences,
  collapseWhitespace,
  endsWithPunctuation,
  fixPunctuationSpacing,
  phraseRegex,
} from './text-utils';

/**
 * Deterministic, offline cleanup. This is what the user gets when no language
 * model is configured or reachable, and it is also applied as a safety net on
 * top of the model output (dictionary spelling, whitespace, snippets).
 */
export interface RulesOptions {
  removeFillers: boolean;
  voiceCommands: boolean;
  style: TextStyle;
  dictionary: DictionaryEntry[];
  snippets: Snippet[];
  /** Apply capitalisation / terminal punctuation (off for the LLM safety-net pass). */
  finish: boolean;
}

// Vocal fillers that never carry meaning.
const VOCAL_FILLERS =
  /(?<![\p{L}\p{N}])(?:u+m+|u+h+m*|erm+|e+h+m*|ø+h+m*|æ+h+m*|hm+|m+h*m+|mhm|a+h+|e+r+)(?![\p{L}\p{N}'’])[,.]?\s*/giu;

// Discourse fillers we only strip when they are set off by punctuation, which is
// how recognisers usually render them when used as padding.
const DELIMITED_FILLERS =
  /(?:^|(?<=[,.;:!?]\s)|(?<=\s))(?:you know|i mean|sort of|kind of|liksom|altså|ikke sant|på en måte|sånn)[,]\s*/giu;

// A word or a short phrase (up to three words) said twice in a row: "the the",
// "I I think", "ship it ship it".
const REPEATS = /(?<![\p{L}\p{N}])((?:[\p{L}\p{N}'’-]+\s+){0,2}[\p{L}\p{N}'’-]+)(?:[,\s]+\1)+(?![\p{L}\p{N}])/giu;

const COMMANDS: { re: RegExp; out: string }[] = [
  { re: /[,.]?\s*(?<![\p{L}])(?:new paragraph|nytt avsnitt|ny paragraf)(?![\p{L}])[,.]?\s*/giu, out: '\n\n' },
  { re: /[,.]?\s*(?<![\p{L}])(?:new ?line|ny linje|linjeskift)(?![\p{L}])[,.]?\s*/giu, out: '\n' },
];

export function applyDictionary(text: string, dictionary: DictionaryEntry[]): string {
  let out = text;
  for (const entry of dictionary) {
    const term = entry.term.trim();
    if (!term) continue;
    const variants = [term, ...entry.aliases.map((a) => a.trim()).filter(Boolean)];
    for (const variant of variants) {
      out = out.replace(phraseRegex(variant), term);
    }
  }
  return out;
}

export function applySnippets(text: string, snippets: Snippet[]): { text: string; matched: boolean } {
  let out = text;
  let matched = false;
  for (const snippet of snippets) {
    const trigger = snippet.trigger.trim();
    if (!trigger) continue;
    const re = phraseRegex(trigger);
    if (re.test(out)) {
      matched = true;
      out = out.replace(new RegExp(`${re.source}[.,!?]?`, re.flags), snippet.expansion);
    }
  }
  return { text: out, matched };
}

export function removeFillers(text: string, opts: { collapseRepeats?: boolean } = {}): string {
  const out = text.replace(VOCAL_FILLERS, '').replace(DELIMITED_FILLERS, '');
  return opts.collapseRepeats === false ? out : out.replace(REPEATS, '$1');
}

export function applyVoiceCommands(text: string): string {
  let out = text;
  for (const { re, out: replacement } of COMMANDS) out = out.replace(re, replacement);
  return out;
}

export function applyRules(raw: string, opts: RulesOptions): string {
  let text = collapseWhitespace(raw);
  if (!text) return '';
  text = applyDictionary(text, opts.dictionary);
  text = applySnippets(text, opts.snippets).text;
  if (opts.voiceCommands) text = applyVoiceCommands(text);
  // "dash dash" or "foo foo" can be intentional in a terminal.
  if (opts.removeFillers) text = removeFillers(text, { collapseRepeats: opts.style !== 'code' });
  text = collapseWhitespace(text);
  if (opts.style !== 'code') text = fixPunctuationSpacing(text);
  // Leftover punctuation at the very start after a removed filler.
  text = text.replace(/^[,.;:]\s*/, '');
  if (opts.finish && opts.style !== 'code') {
    text = capitaliseSentences(text);
    if (opts.style !== 'casual' && !endsWithPunctuation(text) && text.split(/\s+/).length >= 3) {
      text += '.';
    }
  }
  return collapseWhitespace(text);
}

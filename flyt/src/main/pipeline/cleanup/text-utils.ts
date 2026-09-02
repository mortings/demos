/** Unicode-aware helpers shared by the rule based cleanup and the guard. */

const LETTER = '\\p{L}\\p{N}';

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Build a case-insensitive regex that matches `phrase` as whole words. */
export function phraseRegex(phrase: string, flags = 'giu'): RegExp {
  const words = phrase.trim().split(/\s+/).map(escapeRegExp);
  const body = words.join('[\\s-]+');
  return new RegExp(`(?<![${LETTER}])${body}(?![${LETTER}])`, flags);
}

export function collapseWhitespace(text: string): string {
  return text
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Remove spaces before punctuation and make sure there is one after. */
export function fixPunctuationSpacing(text: string): string {
  return (
    text
      .replace(/[ \t]+([,.!?;:])/g, '$1')
      // A space after , ; : ! ? when a letter follows; after a full stop only
      // before a capital, so e.g., URLs, e-mail addresses and decimals survive.
      .replace(/([,;:!?])(?=\p{L})/gu, '$1 ')
      .replace(/(\.)(?=\p{Lu})/gu, '$1 ')
      .replace(/([,.!?;:])[ \t]+\n/g, '$1\n')
      .replace(/\.{2}(?!\.)/g, '.')
      .replace(/,{2,}/g, ',')
      .replace(/[ \t]{2,}/g, ' ')
  );
}

const ABBREVIATIONS = new Set([
  'etc.', 'ca.', 'vs.', 'nr.', 'no.', 'mr.', 'mrs.', 'ms.', 'dr.', 'jr.', 'sr.', 'st.', 'ex.', 'approx.', 'incl.',
  'kl.', 'osv.', 'bl.a.', 'f.eks.', 'evt.', 'mfl.', 'dvs.', 'pga.', 'ifm.', 'iht.', 'jf.', 'mht.', 'mvh.', 'tlf.',
]);

function isAbbreviation(word: string): boolean {
  const w = word.toLowerCase();
  // "e.g.", "i.e.", "a.m.", single initials, and the known list above.
  return ABBREVIATIONS.has(w) || /^(?:\p{L}\.)+$/u.test(w) || /^\p{L}\.$/u.test(w) || /^\d+\.$/.test(w);
}

/** Capitalise the first letter of the text and of every sentence. */
export function capitaliseSentences(text: string): string {
  return text.replace(/(^|[.!?]\s+|\n+)(\p{Ll})/gu, (match: string, lead: string, ch: string, offset: number) => {
    if (lead.startsWith('.')) {
      const before = /(\S+)$/.exec(text.slice(0, offset + 1));
      if (before && isAbbreviation(before[1] as string)) return match;
    }
    return lead + ch.toUpperCase();
  });
}

export function endsWithPunctuation(text: string): boolean {
  return /[.!?…:;"”»)\]]$/.test(text.trim());
}

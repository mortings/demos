import { describe, expect, it } from 'vitest';
import { applyDictionary, applyRules, applySnippets, removeFillers } from '../src/main/pipeline/cleanup/rules';

const base = {
  removeFillers: true,
  voiceCommands: true,
  style: 'standard' as const,
  dictionary: [],
  snippets: [],
  finish: true,
};

describe('rules cleanup', () => {
  it('removes vocal fillers in English and Norwegian', () => {
    expect(removeFillers('um so uh we should, ehm, ship it')).toBe('so we should, ship it');
    expect(removeFillers('øh jeg tror eh at vi, ehm, bør dra')).toBe('jeg tror at vi, bør dra');
  });

  it('removes delimited discourse fillers but keeps meaningful uses', () => {
    expect(removeFillers('I mean, we could go')).toBe('we could go');
    expect(removeFillers('it is kind of blue')).toBe('it is kind of blue');
    expect(removeFillers('vi kan, liksom, dra nå')).toBe('vi kan, dra nå');
  });

  it('collapses immediate repetitions of words and short phrases', () => {
    expect(removeFillers('the the the report is is done')).toBe('the report is done');
    expect(removeFillers('det det var bra')).toBe('det var bra');
    expect(removeFillers('let us ship it ship it on tuesday')).toBe('let us ship it on tuesday');
    expect(removeFillers('I think we I think we should go')).toBe('I think we should go');
  });

  it('applies dictionary spellings from aliases and case variants', () => {
    const dict = [{ id: '1', term: 'Bluestone PIM', aliases: ['blue stone pim', 'bluestone p i m'] }];
    expect(applyDictionary('we demoed blue stone pim and Blue Stone PIM today', dict)).toBe('we demoed Bluestone PIM and Bluestone PIM today');
    expect(applyDictionary('bluestone pim rocks', dict)).toBe('Bluestone PIM rocks');
  });

  it('expands snippets and reports a match', () => {
    const snippets = [{ id: '1', trigger: 'insert my email', expansion: 'morten@example.com' }];
    const res = applySnippets('you can reach me at insert my email.', snippets);
    expect(res.matched).toBe(true);
    expect(res.text).toBe('you can reach me at morten@example.com');
    expect(applySnippets('nothing here', snippets).matched).toBe(false);
  });

  it('handles new line / new paragraph commands in both languages', () => {
    expect(applyRules('first point new line second point', base)).toBe('First point\nSecond point.');
    expect(applyRules('hei kari nytt avsnitt takk for sist', base)).toBe('Hei kari\n\nTakk for sist.');
  });

  it('finishes sentences for standard style but not casual or code', () => {
    expect(applyRules('see you there tomorrow', base)).toBe('See you there tomorrow.');
    expect(applyRules('see you there tomorrow', { ...base, style: 'casual' })).toBe('See you there tomorrow');
    expect(applyRules('git status dash dash short', { ...base, style: 'code' })).toBe('git status dash dash short');
  });

  it('fixes spacing around punctuation and capitalises sentences', () => {
    expect(applyRules('hello ,world . how are you ?fine', base)).toBe('Hello, world. How are you? Fine.');
  });

  it('leaves e-mail addresses, URLs, decimals and abbreviations alone', () => {
    expect(applyRules('mail me at john.doe@example.com, see flyt.app/docs, it is 3.5 percent e.g. now', base)).toBe(
      'Mail me at john.doe@example.com, see flyt.app/docs, it is 3.5 percent e.g. now.',
    );
  });

  it('returns empty for filler-only input', () => {
    expect(applyRules('um uh ehm', base)).toBe('');
  });
});

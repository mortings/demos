import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/shared/defaults';
import { buildCleanupUserMessage, joinWithPauseMarkers, resolveStyle, CLEANUP_SYSTEM_PROMPT } from '../src/main/pipeline/cleanup/prompt';

describe('prompt builder', () => {
  it('resolves per-app styles from the rules', () => {
    const rules = DEFAULT_SETTINGS.appStyles;
    expect(resolveStyle({ name: 'Slack', bundleId: 'com.tinyspeck.slackmacgap' }, rules, 'standard').style).toBe('casual');
    expect(resolveStyle({ name: 'Code', bundleId: 'com.microsoft.VSCode' }, rules, 'standard').style).toBe('standard');
    expect(resolveStyle({ name: 'Visual Studio Code', bundleId: null }, rules, 'standard').style).toBe('code');
    expect(resolveStyle(null, rules, 'formal').style).toBe('formal');
  });

  it('includes settings, vocabulary, snippets, previous text and transcript', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      dictionary: [{ id: '1', term: 'Bluestone PIM', aliases: ['blue stone pim'] }],
      snippets: [{ id: '1', trigger: 'insert my email', expansion: 'm@example.com' }],
      dictation: { ...DEFAULT_SETTINGS.dictation, languageMode: 'no' as const, translateTo: 'en' as const },
    };
    const msg = buildCleanupUserMessage('hei [pause 1.6s] verden', {
      settings,
      app: { name: 'Slack', bundleId: null },
      style: 'casual',
      appInstructions: 'no emoji',
      previousText: 'Previously inserted',
      detectedLanguage: 'no',
    });
    expect(msg).toContain('language_mode: Norwegian only');
    expect(msg).toContain('norwegian_variant: Bokmål');
    expect(msg).toContain('style: casual');
    expect(msg).toContain('app: Slack');
    expect(msg).toContain('app_instructions: no emoji');
    expect(msg).toContain('translate_to: English');
    expect(msg).toContain('Bluestone PIM (sounds like: blue stone pim)');
    expect(msg).toContain('"insert my email" → "m@example.com"');
    expect(msg).toContain('<previous_text>\nPreviously inserted\n</previous_text>');
    expect(msg).toContain('<transcript>\nhei [pause 1.6s] verden\n</transcript>');
    expect(msg.trim().endsWith('Output the cleaned text only.')).toBe(true);
  });

  it('joins chunks with pause markers only for long pauses', () => {
    const joined = joinWithPauseMarkers(
      [
        { text: 'first part', pauseBeforeMs: 0 },
        { text: 'second part', pauseBeforeMs: 600 },
        { text: '', pauseBeforeMs: 5000 },
        { text: 'third part', pauseBeforeMs: 2300 },
      ],
      1500,
    );
    expect(joined).toBe('first part second part [pause 2.3s] third part');
  });

  it('system prompt is stable and covers the key behaviours', () => {
    expect(CLEANUP_SYSTEM_PROMPT).toContain('Self-corrections');
    expect(CLEANUP_SYSTEM_PROMPT).toContain('Bokmål');
    expect(CLEANUP_SYSTEM_PROMPT).toContain('[pause');
    expect(CLEANUP_SYSTEM_PROMPT.length).toBeGreaterThan(3000);
  });
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SettingsStore } from '../src/main/settings-store';
import { DEFAULT_SETTINGS } from '../src/shared/defaults';

function tmpFile(): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'flyt-')), 'settings.json');
}

describe('SettingsStore', () => {
  it('starts from defaults and persists updates', () => {
    const file = tmpFile();
    const store = new SettingsStore(file);
    expect(store.get()).toEqual(DEFAULT_SETTINGS);
    store.update({ dictation: { languageMode: 'no' }, hotkeys: { tapThresholdMs: 300 } });
    const reloaded = new SettingsStore(file);
    expect(reloaded.get().dictation.languageMode).toBe('no');
    expect(reloaded.get().hotkeys.tapThresholdMs).toBe(300);
    expect(reloaded.get().general).toEqual(DEFAULT_SETTINGS.general);
  });

  it('upgrades deprecated recogniser model ids on load', () => {
    const file = tmpFile();
    fs.writeFileSync(
      file,
      JSON.stringify({
        asr: { models: { openai: 'gpt-4o-transcribe', elevenlabs: 'scribe_v1', groq: 'whisper-large-v3-turbo' } },
        llm: { models: { 'openai-compatible': 'gpt-4.1-mini' } },
      }),
    );
    const store = new SettingsStore(file);
    expect(store.get().asr.models.openai).toBe('gpt-transcribe');
    expect(store.get().asr.models.elevenlabs).toBe('scribe_v2');
    expect(store.get().asr.models.groq).toBe('whisper-large-v3-turbo');
    expect(store.get().llm.models['openai-compatible']).toBe('gpt-5.4-mini');
    expect(store.get().llm.models.anthropic).toBe('claude-opus-5');
  });

  it('rejects invalid updates and repairs a broken file section by section', () => {
    const file = tmpFile();
    fs.writeFileSync(file, JSON.stringify({ ...DEFAULT_SETTINGS, audio: { ...DEFAULT_SETTINGS.audio, preRollMs: 'lots' }, dictation: { ...DEFAULT_SETTINGS.dictation, pauseMs: 700 } }));
    const store = new SettingsStore(file);
    expect(store.get().audio.preRollMs).toBe(DEFAULT_SETTINGS.audio.preRollMs); // repaired
    expect(store.get().dictation.pauseMs).toBe(700); // kept
    expect(() => store.update({ dictation: { pauseMs: 5 } })).toThrow(/Invalid settings/);
  });
});

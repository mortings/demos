import type { AppStyleRule, SecretName, Settings } from './types';

// uiohook keycodes (see uiohook-napi UiohookKey)
export const KEYCODE_ALT_RIGHT = 3640;
export const KEYCODE_ESCAPE = 1;

export const DEFAULT_APP_STYLES: AppStyleRule[] = [
  { id: 'slack', appMatch: 'slack', style: 'casual', instructions: '' },
  { id: 'teams', appMatch: 'teams', style: 'casual', instructions: '' },
  { id: 'discord', appMatch: 'discord', style: 'casual', instructions: '' },
  { id: 'messages', appMatch: 'messages', style: 'casual', instructions: '' },
  { id: 'whatsapp', appMatch: 'whatsapp', style: 'casual', instructions: '' },
  { id: 'telegram', appMatch: 'telegram', style: 'casual', instructions: '' },
  { id: 'signal', appMatch: 'signal', style: 'casual', instructions: '' },
  { id: 'mail', appMatch: 'mail', style: 'formal', instructions: '' },
  { id: 'outlook', appMatch: 'outlook', style: 'formal', instructions: '' },
  { id: 'terminal', appMatch: 'terminal', style: 'code', instructions: '' },
  { id: 'iterm', appMatch: 'iterm', style: 'code', instructions: '' },
  { id: 'warp', appMatch: 'dev.warp', style: 'code', instructions: '' },
  { id: 'ghostty', appMatch: 'ghostty', style: 'code', instructions: '' },
  { id: 'vscode', appMatch: 'visual studio code', style: 'code', instructions: '' },
  { id: 'cursor', appMatch: 'cursor', style: 'code', instructions: '' },
  { id: 'zed', appMatch: 'zed', style: 'code', instructions: '' },
  { id: 'xcode', appMatch: 'xcode', style: 'code', instructions: '' },
  { id: 'jetbrains', appMatch: 'jetbrains', style: 'code', instructions: '' },
];

export const ASR_SECRET: Record<Settings['asr']['provider'], SecretName> = {
  openai: 'openai',
  groq: 'groq',
  deepgram: 'deepgram',
  elevenlabs: 'elevenlabs',
  custom: 'custom',
};

export const ASR_DEFAULT_MODELS: Record<Settings['asr']['provider'], string> = {
  openai: 'gpt-transcribe',
  groq: 'whisper-large-v3',
  deepgram: 'nova-3',
  elevenlabs: 'scribe_v2',
  custom: 'whisper-1',
};

export const ASR_MODEL_OPTIONS: Record<Settings['asr']['provider'], string[]> = {
  // gpt-4o-transcribe, gpt-4o-mini-transcribe and whisper-1 were deprecated by
  // OpenAI on 2026-08-26 and shut down on 2027-02-26; gpt-transcribe replaces them.
  openai: ['gpt-transcribe', 'gpt-4o-transcribe', 'gpt-4o-mini-transcribe', 'whisper-1'],
  groq: ['whisper-large-v3', 'whisper-large-v3-turbo'],
  deepgram: ['nova-3', 'nova-2'],
  elevenlabs: ['scribe_v2', 'scribe_v1'],
  custom: ['whisper-1'],
};

/** Stored model ids that should be upgraded when settings are loaded. */
export const ASR_MODEL_UPGRADES: Record<string, string> = {
  'gpt-4o-transcribe': 'gpt-transcribe',
  'gpt-4o-mini-transcribe': 'gpt-transcribe',
  scribe_v1: 'scribe_v2',
};

export const LLM_DEFAULT_MODELS = {
  anthropic: 'claude-opus-5',
  'openai-compatible': 'gpt-5.4-mini',
} as const;

/** Suggestions for the OpenAI-compatible cleanup model field. */
export const OPENAI_COMPAT_MODEL_OPTIONS: string[] = ['gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-5.4', 'mistral-small-latest', 'llama3.2', 'qwen3'];

export const LLM_MODEL_UPGRADES: Record<string, string> = {
  'gpt-4.1-mini': 'gpt-5.4-mini',
  'gpt-4.1-nano': 'gpt-5.4-nano',
  'gpt-4o-mini': 'gpt-5.4-mini',
};

export const ANTHROPIC_MODEL_OPTIONS: { id: string; label: string }[] = [
  { id: 'claude-opus-5', label: 'Claude Opus 5 (best quality, slowest: roughly 1.5–3 s per dictation)' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 (roughly 1–1.5 s)' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (fastest: roughly 0.5–1 s)' },
];

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  general: {
    launchAtLogin: false,
    showInDock: false,
    playSounds: true,
    overlayEnabled: true,
    overlayPosition: 'bottom',
    theme: 'system',
    keepHistory: true,
    historyLimit: 500,
  },
  hotkeys: {
    pushToTalk: { keycodes: [KEYCODE_ALT_RIGHT], label: 'Right ⌥' },
    tapForHandsFree: true,
    tapThresholdMs: 280,
    handsFreeToggle: null,
    cancelWithEscape: true,
  },
  audio: {
    deviceId: null,
    keepMicWarm: true,
    preRollMs: 400,
    postRollMs: 400,
    sensitivity: 'normal',
  },
  dictation: {
    languageMode: 'auto',
    norwegianVariant: 'nb',
    pauseMs: 900,
    paragraphPauseMs: 1800,
    handsFreeAutoStopMs: 0,
    removeFillers: true,
    applySelfCorrections: true,
    smartPunctuation: true,
    smartNumbers: true,
    voiceCommands: true,
    translateTo: 'off',
    defaultStyle: 'standard',
    leadingSpace: 'auto',
    rawMode: false,
    restoreClipboard: true,
  },
  asr: {
    provider: 'openai',
    models: { ...ASR_DEFAULT_MODELS },
    customBaseUrl: 'http://localhost:8080/v1',
    timeoutMs: 25000,
  },
  llm: {
    provider: 'anthropic',
    models: { ...LLM_DEFAULT_MODELS },
    effort: 'low',
    customBaseUrl: 'https://api.openai.com/v1',
    timeoutMs: 15000,
  },
  dictionary: [],
  snippets: [],
  appStyles: DEFAULT_APP_STYLES,
};

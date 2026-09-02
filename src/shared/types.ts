import { z } from 'zod';

// ---------------------------------------------------------------------------
// Settings schema (persisted as JSON in the user data directory)
// ---------------------------------------------------------------------------

export const KeyBindingSchema = z.object({
  /** uiohook keycodes that must all be held for the binding to fire. */
  keycodes: z.array(z.number().int()).min(1),
  /** Human readable label, e.g. "Right ⌥" or "⌃ Space". */
  label: z.string(),
});
export type KeyBinding = z.infer<typeof KeyBindingSchema>;

export const LanguageModeSchema = z.enum(['auto', 'en', 'no']);
export type LanguageMode = z.infer<typeof LanguageModeSchema>;

export const NorwegianVariantSchema = z.enum(['nb', 'nn']);
export type NorwegianVariant = z.infer<typeof NorwegianVariantSchema>;

export const AsrProviderSchema = z.enum(['openai', 'groq', 'deepgram', 'elevenlabs', 'custom']);
export type AsrProvider = z.infer<typeof AsrProviderSchema>;

export const LlmProviderSchema = z.enum(['anthropic', 'openai-compatible', 'none']);
export type LlmProvider = z.infer<typeof LlmProviderSchema>;

export const EffortSchema = z.enum(['low', 'medium', 'high']);
export type Effort = z.infer<typeof EffortSchema>;

export const TextStyleSchema = z.enum(['standard', 'casual', 'formal', 'code']);
export type TextStyle = z.infer<typeof TextStyleSchema>;

export const TranslateToSchema = z.enum(['off', 'en', 'no']);
export type TranslateTo = z.infer<typeof TranslateToSchema>;

export const LeadingSpaceSchema = z.enum(['auto', 'always', 'never']);
export type LeadingSpace = z.infer<typeof LeadingSpaceSchema>;

export const SensitivitySchema = z.enum(['low', 'normal', 'high']);
export type Sensitivity = z.infer<typeof SensitivitySchema>;

export const OverlayPositionSchema = z.enum(['bottom', 'top']);
export type OverlayPosition = z.infer<typeof OverlayPositionSchema>;

export const ThemeSchema = z.enum(['system', 'light', 'dark']);
export type Theme = z.infer<typeof ThemeSchema>;

export const DictionaryEntrySchema = z.object({
  id: z.string(),
  /** The exact spelling you want in the output, e.g. "Bluestone PIM". */
  term: z.string(),
  /** Phrases the recogniser tends to produce instead, e.g. ["blue stone pim"]. */
  aliases: z.array(z.string()),
});
export type DictionaryEntry = z.infer<typeof DictionaryEntrySchema>;

export const SnippetSchema = z.object({
  id: z.string(),
  /** Spoken trigger, e.g. "insert my email". */
  trigger: z.string(),
  /** Text that replaces the trigger. */
  expansion: z.string(),
});
export type Snippet = z.infer<typeof SnippetSchema>;

export const AppStyleRuleSchema = z.object({
  id: z.string(),
  /** Case-insensitive substring matched against the app name or bundle id. */
  appMatch: z.string(),
  style: TextStyleSchema,
  /** Free-form extra instructions for this app, may be empty. */
  instructions: z.string(),
});
export type AppStyleRule = z.infer<typeof AppStyleRuleSchema>;

export const SettingsSchema = z.object({
  version: z.literal(1),
  general: z.object({
    launchAtLogin: z.boolean(),
    showInDock: z.boolean(),
    playSounds: z.boolean(),
    overlayEnabled: z.boolean(),
    overlayPosition: OverlayPositionSchema,
    theme: ThemeSchema,
    keepHistory: z.boolean(),
    historyLimit: z.number().int().min(10).max(5000),
  }),
  hotkeys: z.object({
    /** Hold to dictate. */
    pushToTalk: KeyBindingSchema,
    /** A quick tap of the push-to-talk key toggles hands-free mode. */
    tapForHandsFree: z.boolean(),
    /** Presses shorter than this count as a tap. */
    tapThresholdMs: z.number().int().min(100).max(1000),
    /** Optional dedicated hands-free toggle. */
    handsFreeToggle: KeyBindingSchema.nullable(),
    cancelWithEscape: z.boolean(),
  }),
  audio: z.object({
    deviceId: z.string().nullable(),
    /** Keep the microphone open so the very first syllable is captured. */
    keepMicWarm: z.boolean(),
    preRollMs: z.number().int().min(0).max(1500),
    postRollMs: z.number().int().min(0).max(1500),
    sensitivity: SensitivitySchema,
  }),
  dictation: z.object({
    languageMode: LanguageModeSchema,
    norwegianVariant: NorwegianVariantSchema,
    /** Silence that ends a hands-free chunk. */
    pauseMs: z.number().int().min(400).max(3000),
    /** Pauses at least this long are shown to the cleanup model as paragraph hints. */
    paragraphPauseMs: z.number().int().min(800).max(6000),
    /** In hands-free mode, stop after this much silence. 0 = never. */
    handsFreeAutoStopMs: z.number().int().min(0).max(120000),
    removeFillers: z.boolean(),
    applySelfCorrections: z.boolean(),
    smartPunctuation: z.boolean(),
    smartNumbers: z.boolean(),
    voiceCommands: z.boolean(),
    translateTo: TranslateToSchema,
    defaultStyle: TextStyleSchema,
    leadingSpace: LeadingSpaceSchema,
    /** Skip the cleanup model entirely and insert the raw transcript. */
    rawMode: z.boolean(),
    restoreClipboard: z.boolean(),
  }),
  asr: z.object({
    provider: AsrProviderSchema,
    models: z.record(AsrProviderSchema, z.string()),
    customBaseUrl: z.string(),
    timeoutMs: z.number().int().min(3000).max(120000),
  }),
  llm: z.object({
    provider: LlmProviderSchema,
    models: z.record(z.enum(['anthropic', 'openai-compatible']), z.string()),
    effort: EffortSchema,
    customBaseUrl: z.string(),
    timeoutMs: z.number().int().min(2000).max(60000),
  }),
  dictionary: z.array(DictionaryEntrySchema),
  snippets: z.array(SnippetSchema),
  appStyles: z.array(AppStyleRuleSchema),
});
export type Settings = z.infer<typeof SettingsSchema>;

export type DeepPartial<T> = T extends (infer U)[]
  ? U[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

// ---------------------------------------------------------------------------
// Secrets (API keys) live outside the settings file, encrypted with safeStorage
// ---------------------------------------------------------------------------

export const SECRET_NAMES = [
  'openai',
  'groq',
  'deepgram',
  'elevenlabs',
  'custom',
  'anthropic',
  'openaiCompatible',
] as const;
export type SecretName = (typeof SECRET_NAMES)[number];
export type SecretStatus = Record<SecretName, boolean>;

// ---------------------------------------------------------------------------
// Runtime state shared over IPC
// ---------------------------------------------------------------------------

export type DictationMode = 'hold' | 'handsFree';

export type Phase =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'inserted'
  | 'empty'
  | 'cancelled'
  | 'error';

export interface OverlayState {
  visible: boolean;
  phase: Phase;
  mode: DictationMode;
  /** 0..1 microphone level for the waveform. */
  level: number;
  speech: boolean;
  elapsedMs: number;
  message: string | null;
  /** Detected or forced language code shown as a badge. */
  language: string | null;
  /** Number of chunks already handed to the recogniser (hands-free progress). */
  chunks: number;
}

export interface AppStatus {
  /** Running unpackaged (`electron .`): macOS shows the app as "Electron". */
  devMode: boolean;
  recording: boolean;
  mode: DictationMode | null;
  hotkeysActive: boolean;
  micOpen: boolean;
  asrConfigured: boolean;
  llmConfigured: boolean;
  lastError: string | null;
  lastLatencyMs: number | null;
}

export interface HistoryItem {
  id: string;
  ts: number;
  app: string | null;
  raw: string;
  text: string;
  audioMs: number;
  latencyMs: number;
  mode: DictationMode;
  language: string | null;
}

export interface AudioDevice {
  deviceId: string;
  label: string;
}

export interface ActiveApp {
  name: string;
  bundleId: string | null;
}

export type PermissionKind = 'microphone' | 'accessibility' | 'inputMonitoring' | 'automation';
export type PermissionState = 'granted' | 'denied' | 'restricted' | 'not-determined' | 'unknown' | 'not-applicable';
export type PermissionStatus = Record<PermissionKind, PermissionState>;

export interface KeyCaptureEvent {
  keycodes: number[];
  label: string;
  /** True once every captured key has been released. */
  complete: boolean;
}

export interface ProviderTestResult {
  ok: boolean;
  message: string;
  latencyMs?: number;
}

export type EngineCommand =
  | { type: 'configure'; deviceId: string | null; warm: boolean }
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'enumerate' }
  | { type: 'sound'; name: 'start' | 'stop' | 'error' | 'cancel' | 'done' };

export type EngineMessage =
  | { type: 'ready' }
  | { type: 'opened'; deviceId: string | null; sampleRate: number }
  | { type: 'closed' }
  | { type: 'devices'; devices: AudioDevice[] }
  | { type: 'error'; message: string };

// ---------------------------------------------------------------------------
// IPC channel names
// ---------------------------------------------------------------------------

export const IPC = {
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  settingsReset: 'settings:reset',
  settingsChanged: 'settings:changed',
  secretSet: 'secrets:set',
  secretStatus: 'secrets:status',
  providerTestAsr: 'providers:test-asr',
  providerTestLlm: 'providers:test-llm',
  permissionsGet: 'permissions:get',
  permissionsRequest: 'permissions:request',
  permissionsOpen: 'permissions:open',
  historyList: 'history:list',
  historyClear: 'history:clear',
  historyDelete: 'history:delete',
  historyChanged: 'history:changed',
  keyCaptureStart: 'keys:capture-start',
  keyCaptureStop: 'keys:capture-stop',
  keyCaptureEvent: 'keys:capture-event',
  activeApp: 'app:active',
  audioDevices: 'audio:devices',
  statusGet: 'status:get',
  statusChanged: 'status:changed',
  overlayState: 'overlay:state',
  engineMessage: 'engine:message',
  engineChunk: 'engine:chunk',
  engineCommand: 'engine:command',
  openExternal: 'shell:open-external',
  windowClose: 'window:close',
  dictationToggle: 'dictation:toggle',
  dictationCancel: 'dictation:cancel',
  appVersion: 'app:version',
} as const;

// ---------------------------------------------------------------------------
// The API exposed to renderer windows through the preload bridge
// ---------------------------------------------------------------------------

export type Unsubscribe = () => void;

export type Platform = 'darwin' | 'win32' | 'linux' | 'freebsd' | 'openbsd' | 'sunos' | 'aix' | 'android' | 'haiku' | 'cygwin' | 'netbsd';

export interface FlytApi {
  platform: Platform;
  getVersion(): Promise<string>;
  getSettings(): Promise<Settings>;
  updateSettings(patch: DeepPartial<Settings>): Promise<Settings>;
  resetSettings(): Promise<Settings>;
  onSettingsChanged(cb: (settings: Settings) => void): Unsubscribe;
  setSecret(name: SecretName, value: string): Promise<SecretStatus>;
  getSecretStatus(): Promise<SecretStatus>;
  testAsr(): Promise<ProviderTestResult>;
  testLlm(): Promise<ProviderTestResult>;
  getPermissions(): Promise<PermissionStatus>;
  requestPermission(kind: PermissionKind): Promise<PermissionStatus>;
  openPermissionSettings(kind: PermissionKind): Promise<void>;
  getHistory(): Promise<HistoryItem[]>;
  clearHistory(): Promise<void>;
  deleteHistoryItem(id: string): Promise<void>;
  onHistoryChanged(cb: (items: HistoryItem[]) => void): Unsubscribe;
  startKeyCapture(): Promise<void>;
  stopKeyCapture(): Promise<void>;
  onKeyCapture(cb: (ev: KeyCaptureEvent) => void): Unsubscribe;
  getActiveApp(): Promise<ActiveApp | null>;
  getAudioDevices(): Promise<AudioDevice[]>;
  onAudioDevices(cb: (devices: AudioDevice[]) => void): Unsubscribe;
  getStatus(): Promise<AppStatus>;
  onStatus(cb: (status: AppStatus) => void): Unsubscribe;
  toggleDictation(): Promise<void>;
  cancelDictation(): Promise<void>;
  openExternal(url: string): Promise<void>;
  closeWindow(): Promise<void>;
  // Overlay window only
  onOverlayState(cb: (state: OverlayState) => void): Unsubscribe;
  // Engine window only
  engine: {
    send(message: EngineMessage): void;
    sendChunk(pcm: ArrayBuffer): void;
    onCommand(cb: (command: EngineCommand) => void): Unsubscribe;
  };
}

declare global {
  interface Window {
    flyt: FlytApi;
  }
}

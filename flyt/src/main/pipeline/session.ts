import { EventEmitter } from 'node:events';
import type { ActiveApp, AppStatus, DictationMode, HistoryItem, OverlayState, Phase, SecretName, Settings } from '../../shared/types';
import { newId } from '../../shared/util';
import { buildAsrPrompt, createTranscriber, type TranscribeResult, type Transcriber } from './asr';
import { cleanupTranscript } from './cleanup';
import { joinWithPauseMarkers } from './cleanup/prompt';
import { Segmenter, type SegmenterEvent, type SegmenterOptions } from './segmenter';
import { SENSITIVITY_PRESETS, dbToLevel } from './vad';
import { encodeWav, pcmDurationMs } from './wav';

export interface ControllerDeps {
  settings: () => Settings;
  secret: (name: SecretName) => string | null;
  insert: (text: string) => Promise<void>;
  getActiveApp: () => Promise<ActiveApp | null>;
  openMic: () => void;
  closeMic: () => void;
  playSound: (name: 'start' | 'stop' | 'error' | 'cancel' | 'done') => void;
  log: (message: string, ...rest: unknown[]) => void;
}

interface Chunk {
  index: number;
  pauseBeforeMs: number;
  audioMs: number;
  promise: Promise<TranscribeResult>;
  result: TranscribeResult | null;
  error: string | null;
}

interface Session {
  id: string;
  mode: DictationMode;
  /** Hold session whose tap-vs-hold nature is not decided yet. */
  provisional: boolean;
  /** A key press arrived while hands-free was running: stop on release. */
  stopOnRelease: boolean;
  startedAt: number;
  transcriber: Transcriber;
  app: ActiveApp | null;
  appPromise: Promise<ActiveApp | null>;
  chunks: Chunk[];
  /** Everything inserted so far (hands-free). */
  inserted: string;
  lastTranscript: string;
  language: string | null;
  chain: Promise<void>;
  cancelled: boolean;
  totalAudioMs: number;
}

const SAMPLE_RATE = 16000;

/**
 * Owns the life of one dictation: hotkey → recording → recogniser → cleanup →
 * insertion. Audio frames come from the engine window, key events from the
 * hotkey manager, and it reports state for the overlay, tray and history.
 *
 * Events: 'overlay' (OverlayState), 'history' (HistoryItem), 'status' (Partial<AppStatus>)
 */
export class DictationController extends EventEmitter {
  private readonly segmenter: Segmenter;
  private session: Session | null = null;
  private frameCounter = 0;
  private hideTimer: NodeJS.Timeout | null = null;
  private overlay: OverlayState = {
    visible: false,
    phase: 'idle',
    mode: 'hold',
    level: 0,
    speech: false,
    elapsedMs: 0,
    message: null,
    language: null,
    chunks: 0,
  };

  constructor(private readonly deps: ControllerDeps) {
    super();
    this.segmenter = new Segmenter(this.segmenterOptions('hold'));
  }

  get active(): boolean {
    return this.session !== null;
  }

  get mode(): DictationMode | null {
    return this.session?.mode ?? null;
  }

  applySettings(): void {
    if (this.session) this.segmenter.setOptions(this.segmenterOptions(this.session.mode));
    else this.segmenter.setOptions(this.segmenterOptions('hold'));
  }

  private segmenterOptions(mode: DictationMode): Partial<SegmenterOptions> {
    const s = this.deps.settings();
    const preset = SENSITIVITY_PRESETS[s.audio.sensitivity];
    return {
      preRollMs: s.audio.keepMicWarm ? s.audio.preRollMs : 0,
      postRollMs: s.audio.postRollMs,
      pauseMs: mode === 'handsFree' ? s.dictation.pauseMs : Math.max(1200, s.dictation.pauseMs),
      // Hold mode prefers long chunks (better recogniser context); hands-free
      // prefers responsiveness.
      minSegmentMs: mode === 'handsFree' ? 1500 : 8000,
      maxSegmentMs: mode === 'handsFree' ? 30000 : 45000,
      vad: { thresholdDb: preset.thresholdDb, minSpeechDb: preset.minSpeechDb },
    };
  }

  // ------------------------------------------------------------------ input

  /** 16-bit PCM, 16 kHz mono, one 20 ms frame. */
  pushAudio(pcm: Int16Array): void {
    const events = this.segmenter.push(pcm);
    for (const event of events) this.handleSegmenterEvent(event);
  }

  pttDown(): void {
    if (!this.session) {
      this.startSession('hold', true);
      return;
    }
    if (this.session.mode === 'handsFree') this.session.stopOnRelease = true;
  }

  pttUp(heldMs: number): void {
    const session = this.session;
    if (!session) return;
    const s = this.deps.settings();
    if (session.mode === 'hold' && session.provisional) {
      session.provisional = false;
      if (s.hotkeys.tapForHandsFree && heldMs < s.hotkeys.tapThresholdMs) {
        this.switchToHandsFree(session);
        return;
      }
      this.stopSession();
      return;
    }
    if (session.mode === 'handsFree' && session.stopOnRelease) this.stopSession();
  }

  toggleHandsFree(): void {
    if (this.session) this.stopSession();
    else this.startSession('handsFree', false);
  }

  cancel(): void {
    const session = this.session;
    if (!session) return;
    session.cancelled = true;
    this.segmenter.cancel();
    this.session = null;
    this.deps.playSound('cancel');
    this.setOverlay({ phase: 'cancelled', message: 'Cancelled', level: 0, speech: false }, 900);
    this.emitStatus();
    this.releaseMic();
  }

  // --------------------------------------------------------------- lifecycle

  private startSession(mode: DictationMode, provisional: boolean): void {
    const settings = this.deps.settings();
    const transcriber = createTranscriber(settings, this.deps.secret);
    if (!transcriber) {
      this.deps.playSound('error');
      this.setOverlay({ phase: 'error', message: 'Add a speech-to-text API key in Settings → Providers', mode }, 3500);
      this.emit('open-settings', 'providers');
      return;
    }
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    const session: Session = {
      id: newId(),
      mode,
      provisional,
      stopOnRelease: false,
      startedAt: Date.now(),
      transcriber,
      app: null,
      appPromise: this.deps.getActiveApp().catch(() => null),
      chunks: [],
      inserted: '',
      lastTranscript: '',
      language: settings.dictation.languageMode === 'auto' ? null : settings.dictation.languageMode,
      chain: Promise.resolve(),
      cancelled: false,
      totalAudioMs: 0,
    };
    void session.appPromise.then((app) => {
      session.app = app;
    });
    this.session = session;
    this.frameCounter = 0;
    this.deps.openMic();
    this.segmenter.setOptions(this.segmenterOptions(mode));
    this.segmenter.start();
    this.deps.playSound('start');
    this.setOverlay({ visible: true, phase: 'listening', mode, level: 0, speech: false, elapsedMs: 0, message: null, language: session.language, chunks: 0 });
    this.emitStatus();
  }

  private switchToHandsFree(session: Session): void {
    session.mode = 'handsFree';
    this.segmenter.setOptions(this.segmenterOptions('handsFree'));
    this.setOverlay({ mode: 'handsFree' });
    this.emitStatus();
  }

  private stopSession(): void {
    if (!this.session) return;
    this.segmenter.stop();
    this.deps.playSound('stop');
    this.setOverlay({ phase: 'processing', message: null });
  }

  private handleSegmenterEvent(event: SegmenterEvent): void {
    const session = this.session;
    switch (event.type) {
      case 'level': {
        if (!session) return;
        this.frameCounter++;
        if (this.frameCounter % 2 === 0) {
          this.setOverlay({ level: dbToLevel(event.db), speech: event.speech, elapsedMs: event.recordingMs });
        }
        const autoStop = this.deps.settings().dictation.handsFreeAutoStopMs;
        if (
          session.mode === 'handsFree' &&
          autoStop > 0 &&
          this.segmenter.state === 'recording' &&
          event.silenceMs >= autoStop &&
          session.chunks.length > 0
        ) {
          this.deps.log('hands-free auto stop after silence');
          this.stopSession();
        }
        return;
      }
      case 'segment': {
        if (!session) return;
        this.handleSegment(session, event);
        return;
      }
      case 'stopped': {
        if (!session) return;
        void this.finishSession(session, event.segments);
        return;
      }
    }
  }

  private handleSegment(session: Session, event: Extract<SegmenterEvent, { type: 'segment' }>): void {
    const settings = this.deps.settings();
    const wav = encodeWav(event.pcm, SAMPLE_RATE);
    const audioMs = pcmDurationMs(event.pcm.length, SAMPLE_RATE);
    session.totalAudioMs += audioMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), settings.asr.timeoutMs);
    const prompt = buildAsrPrompt(settings.dictionary, session.lastTranscript || null);
    const chunk: Chunk = {
      index: event.index,
      pauseBeforeMs: event.pauseBeforeMs,
      audioMs,
      result: null,
      error: null,
      promise: session.transcriber
        .transcribe({ wav, languageMode: settings.dictation.languageMode, prompt, signal: controller.signal })
        .finally(() => clearTimeout(timer)),
    };
    chunk.promise.then(
      (result) => {
        chunk.result = result;
        if (result.text) session.lastTranscript = result.text;
        if (result.language && !session.language) {
          session.language = result.language;
          if (this.session === session) this.setOverlay({ language: result.language });
        }
      },
      (err: unknown) => {
        chunk.error = err instanceof Error ? err.message : String(err);
        this.deps.log('transcription failed', chunk.error);
      },
    );
    session.chunks.push(chunk);
    this.setOverlay({ chunks: session.chunks.length });

    if (session.mode === 'handsFree') {
      // Insert progressively, strictly in order.
      session.chain = session.chain.then(() => this.insertHandsFreeChunk(session, chunk)).catch((err: unknown) => {
        this.deps.log('hands-free chunk failed', err);
      });
    }
  }

  private async insertHandsFreeChunk(session: Session, chunk: Chunk): Promise<void> {
    await chunk.promise.catch(() => null);
    if (session.cancelled) return;
    const raw = chunk.result?.text ?? '';
    if (!raw.trim()) return;
    const settings = this.deps.settings();
    const app = session.app ?? (await session.appPromise);
    const cleaned = await cleanupTranscript(raw, {
      settings,
      secret: this.deps.secret,
      app,
      previousText: session.inserted || null,
      detectedLanguage: chunk.result?.language ?? session.language,
    });
    if (session.cancelled || !cleaned.text) return;
    const text = withLeadingSpace(cleaned.text, session.inserted, settings.dictation.leadingSpace);
    await this.deps.insert(text);
    session.inserted += text;
    if (cleaned.note) this.emitStatus({ lastError: cleaned.note });
  }

  private async finishSession(session: Session, segments: number): Promise<void> {
    const settings = this.deps.settings();
    try {
      if (segments === 0 && session.chunks.length === 0) {
        this.deps.playSound('cancel');
        this.setOverlay({ phase: 'empty', message: "Didn't catch that", level: 0, speech: false }, 1400);
        return;
      }
      if (session.mode === 'handsFree') {
        await session.chain;
        if (session.cancelled) return;
        const raw = session.chunks.map((c) => c.result?.text ?? '').filter(Boolean).join(' ');
        this.recordHistory(session, raw, session.inserted);
        if (!session.inserted.trim()) {
          const failed = session.chunks.find((c) => c.error);
          if (failed) throw new Error(failed.error as string);
          this.setOverlay({ phase: 'empty', message: "Didn't catch that", level: 0, speech: false }, 1400);
        } else {
          this.deps.playSound('done');
          this.setOverlay({ phase: 'inserted', message: 'Inserted', level: 0, speech: false }, 1000);
        }
        return;
      }

      // Hold mode: gather every chunk, clean once, insert once.
      await Promise.allSettled(session.chunks.map((c) => c.promise));
      if (session.cancelled) return;
      const raw = joinWithPauseMarkers(
        session.chunks.map((c) => ({ text: c.result?.text ?? '', pauseBeforeMs: c.pauseBeforeMs })),
        settings.dictation.paragraphPauseMs,
      );
      if (!raw.trim()) {
        const failed = session.chunks.find((c) => c.error);
        if (failed) throw new Error(failed.error as string);
        this.deps.playSound('cancel');
        this.setOverlay({ phase: 'empty', message: "Didn't catch that", level: 0, speech: false }, 1400);
        return;
      }
      const app = session.app ?? (await session.appPromise);
      const cleaned = await cleanupTranscript(raw, {
        settings,
        secret: this.deps.secret,
        app,
        previousText: null,
        detectedLanguage: session.language,
      });
      if (session.cancelled) return;
      if (!cleaned.text) {
        this.setOverlay({ phase: 'empty', message: 'Nothing to insert', level: 0, speech: false }, 1400);
        return;
      }
      const text = withLeadingSpace(cleaned.text, '', settings.dictation.leadingSpace);
      await this.deps.insert(text);
      const latencyMs = Date.now() - session.startedAt - session.totalAudioMs;
      this.recordHistory(session, raw.replace(/\s*\[pause [\d.]+s\]\s*/g, ' '), text, Math.max(0, latencyMs));
      this.deps.playSound('done');
      this.emitStatus({ lastLatencyMs: Math.max(0, latencyMs), lastError: cleaned.note ?? null });
      this.setOverlay({ phase: 'inserted', message: cleaned.note ? 'Inserted (offline cleanup)' : 'Inserted', level: 0, speech: false }, 1000);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.deps.log('dictation failed', message);
      this.deps.playSound('error');
      this.emitStatus({ lastError: message });
      this.setOverlay({ phase: 'error', message: shorten(message, 90), level: 0, speech: false }, 4000);
    } finally {
      if (this.session === session) this.session = null;
      this.emitStatus();
      this.releaseMic();
    }
  }

  private recordHistory(session: Session, raw: string, text: string, latencyMs?: number): void {
    if (!this.deps.settings().general.keepHistory) return;
    const item: HistoryItem = {
      id: session.id,
      ts: session.startedAt,
      app: session.app?.name ?? null,
      raw: raw.trim(),
      text: text.trim(),
      audioMs: session.totalAudioMs,
      latencyMs: latencyMs ?? 0,
      mode: session.mode,
      language: session.language,
    };
    this.emit('history', item);
  }

  private releaseMic(): void {
    if (!this.deps.settings().audio.keepMicWarm && !this.session) this.deps.closeMic();
  }

  // ------------------------------------------------------------------ output

  private setOverlay(patch: Partial<OverlayState>, hideAfterMs?: number): void {
    this.overlay = { ...this.overlay, ...patch, visible: patch.visible ?? true };
    this.emit('overlay', this.overlay);
    if (hideAfterMs !== undefined) {
      if (this.hideTimer) clearTimeout(this.hideTimer);
      this.hideTimer = setTimeout(() => {
        this.hideTimer = null;
        if (this.session) return;
        this.overlay = { ...this.overlay, visible: false, phase: 'idle' as Phase, level: 0, speech: false, message: null, chunks: 0 };
        this.emit('overlay', this.overlay);
      }, hideAfterMs);
    }
  }

  private emitStatus(patch: Partial<AppStatus> = {}): void {
    this.emit('status', { recording: this.session !== null, mode: this.session?.mode ?? null, ...patch });
  }
}

/** Decide whether the inserted text needs a leading space. */
export function withLeadingSpace(text: string, previous: string, mode: Settings['dictation']['leadingSpace']): string {
  if (!text) return text;
  if (/^[\n\r]/.test(text) || /^[,.;:!?)\]}»”]/.test(text)) return text;
  if (mode === 'never') return text;
  if (mode === 'always') return ' ' + text;
  if (previous && !/\s$/.test(previous)) return ' ' + text;
  return text;
}

function shorten(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

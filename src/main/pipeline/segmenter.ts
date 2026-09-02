import { EnergyVad, frameDb, type VadOptions } from './vad';
import { concatPcm } from './wav';

/**
 * Turns a stream of fixed-size PCM frames into dictation segments.
 *
 *  - While idle it keeps a small pre-roll ring buffer so a dictation that
 *    starts a hair before the key press still gets its first syllable.
 *  - While recording it tracks speech/silence and cuts a segment when the
 *    speaker pauses long enough (hands-free chunking) or when a segment grows
 *    too long (keeps recogniser latency predictable on long dictations).
 *  - stop() enters a short post-roll so the tail of the last word survives a
 *    key released a little too early, then flushes the final segment.
 *
 * The class is pure: no timers, no I/O. Time advances one frame per push().
 */
export interface SegmenterOptions {
  sampleRate: number;
  frameMs: number;
  preRollMs: number;
  postRollMs: number;
  /** Silence that cuts a segment (once the segment is long enough). */
  pauseMs: number;
  /** Never cut before a segment has this much audio. */
  minSegmentMs: number;
  /** Force a cut at this length; prefer a short pause after 75 % of it. */
  maxSegmentMs: number;
  /** Segments with less speech than this are dropped as noise. */
  minSpeechMs: number;
  /** Silence kept after the last speech when trimming a segment. */
  tailKeepMs: number;
  vad: Partial<VadOptions>;
}

export const DEFAULT_SEGMENTER: SegmenterOptions = {
  sampleRate: 16000,
  frameMs: 20,
  preRollMs: 400,
  postRollMs: 400,
  pauseMs: 900,
  minSegmentMs: 1500,
  maxSegmentMs: 45000,
  minSpeechMs: 250,
  tailKeepMs: 200,
  vad: {},
};

export type SegmenterState = 'idle' | 'recording' | 'draining';

export type SegmenterEvent =
  | {
      type: 'level';
      db: number;
      speech: boolean;
      /** Silence since the last speech frame (0 while idle). */
      silenceMs: number;
      recordingMs: number;
    }
  | {
      type: 'segment';
      index: number;
      pcm: Int16Array;
      startMs: number;
      endMs: number;
      speechMs: number;
      /** Silence between the previous segment's last word and this one's first. */
      pauseBeforeMs: number;
      final: boolean;
    }
  | { type: 'stopped'; segments: number; totalSpeechMs: number };

interface RingEntry {
  frame: Int16Array;
  speech: boolean;
}

export class Segmenter {
  private opts: SegmenterOptions;
  private readonly vad: EnergyVad;
  private clockMs = 0;
  private stateValue: SegmenterState = 'idle';

  private ring: RingEntry[] = [];
  private ringMs = 0;

  private segFrames: Int16Array[] = [];
  private segStartMs = 0;
  private segSpeechMs = 0;
  private segFirstSpeechMs: number | null = null;
  private silenceRunMs = 0;
  private lastSpeechMs: number | null = null;
  /** Clock of the last frame that was actually above the gate (no hangover). */
  private lastLoudMs: number | null = null;
  private prevSegLastLoudMs: number | null = null;
  private recordingStartMs = 0;
  private drainMs = 0;
  private index = 0;
  private totalSpeechMs = 0;

  constructor(opts: Partial<SegmenterOptions> = {}) {
    this.opts = { ...DEFAULT_SEGMENTER, ...opts, vad: { ...(opts.vad ?? {}) } };
    this.vad = new EnergyVad(this.opts.vad, this.opts.frameMs);
  }

  get state(): SegmenterState {
    return this.stateValue;
  }

  get nowMs(): number {
    return this.clockMs;
  }

  setOptions(opts: Partial<SegmenterOptions>): void {
    this.opts = { ...this.opts, ...opts, vad: { ...this.opts.vad, ...(opts.vad ?? {}) } };
    this.vad.setOptions(this.opts.vad);
  }

  /** Begin a dictation, pulling in whatever pre-roll the ring buffer holds. */
  start(): void {
    if (this.stateValue !== 'idle') return;
    this.stateValue = 'recording';
    this.vad.resetSpeech();
    this.segFrames = this.ring.map((e) => e.frame);
    this.segSpeechMs = this.ring.reduce((ms, e) => ms + (e.speech ? this.opts.frameMs : 0), 0);
    this.segStartMs = this.clockMs - this.ringMs;
    this.segFirstSpeechMs = this.segSpeechMs > 0 ? this.segStartMs : null;
    this.recordingStartMs = this.clockMs;
    this.silenceRunMs = 0;
    this.lastSpeechMs = this.segSpeechMs > 0 ? this.clockMs : null;
    this.lastLoudMs = this.lastSpeechMs;
    this.prevSegLastLoudMs = null;
    this.drainMs = 0;
    this.index = 0;
    this.totalSpeechMs = 0;
    this.ring = [];
    this.ringMs = 0;
  }

  /** Stop after the post-roll; the final segment is emitted from push(). */
  stop(): void {
    if (this.stateValue !== 'recording') return;
    this.stateValue = 'draining';
    this.drainMs = 0;
  }

  /** Discard everything recorded so far and return to idle. */
  cancel(): void {
    this.stateValue = 'idle';
    this.segFrames = [];
    this.ring = [];
    this.ringMs = 0;
  }

  /** Feed one frame of 16-bit PCM. Frames must be `frameMs` long. */
  push(frame: Int16Array): SegmenterEvent[] {
    const { frameMs } = this.opts;
    const events: SegmenterEvent[] = [];
    const db = frameDb(frame);
    const speech = this.vad.update(db);
    const loud = this.vad.loud;
    this.clockMs += frameMs;

    if (this.stateValue === 'idle') {
      if (this.opts.preRollMs > 0) {
        this.ring.push({ frame, speech });
        this.ringMs += frameMs;
        while (this.ringMs > this.opts.preRollMs && this.ring.length > 0) {
          this.ring.shift();
          this.ringMs -= frameMs;
        }
      }
      events.push({ type: 'level', db, speech, silenceMs: 0, recordingMs: 0 });
      return events;
    }

    this.segFrames.push(frame);
    if (speech) {
      this.segSpeechMs += frameMs;
      this.totalSpeechMs += frameMs;
      this.silenceRunMs = 0;
      this.lastSpeechMs = this.clockMs;
      if (loud) this.lastLoudMs = this.clockMs;
      if (this.segFirstSpeechMs === null) this.segFirstSpeechMs = this.clockMs - frameMs;
    } else {
      this.silenceRunMs += frameMs;
    }

    const segDurationMs = this.segFrames.length * frameMs;
    const silenceMs = this.lastSpeechMs === null ? this.clockMs - this.recordingStartMs : this.clockMs - this.lastSpeechMs;
    events.push({ type: 'level', db, speech, silenceMs, recordingMs: this.clockMs - this.recordingStartMs });

    if (this.stateValue === 'recording') {
      const hasSpeech = this.segSpeechMs >= this.opts.minSpeechMs;
      const longEnough = segDurationMs >= this.opts.minSegmentMs;
      const pausedLongEnough = this.silenceRunMs >= this.opts.pauseMs;
      const nearMax = segDurationMs >= this.opts.maxSegmentMs * 0.75 && this.silenceRunMs >= 350;
      if (hasSpeech && ((longEnough && pausedLongEnough) || nearMax)) {
        events.push(this.cut(false));
      } else if (segDurationMs >= this.opts.maxSegmentMs) {
        if (hasSpeech) events.push(this.cut(false));
        else this.trimLeadingSilence();
      } else if (this.segSpeechMs === 0 && segDurationMs > this.opts.preRollMs + this.opts.pauseMs) {
        // Nobody has spoken yet in this segment: keep only a rolling pre-roll
        // so a long hands-free wait does not grow into a huge silent upload.
        this.trimLeadingSilence();
      }
    } else if (this.stateValue === 'draining') {
      this.drainMs += frameMs;
      // The post-roll exists to catch the tail of a word cut off by an early
      // key release. If the speaker already went quiet before releasing,
      // there is nothing to wait for: finish on the next frame or two.
      const sinceLastLoud = this.lastLoudMs === null ? Number.POSITIVE_INFINITY : this.clockMs - this.lastLoudMs;
      const done = this.drainMs >= this.opts.postRollMs || (this.drainMs >= 2 * frameMs && sinceLastLoud >= this.opts.postRollMs);
      if (done) {
        if (this.segSpeechMs >= this.opts.minSpeechMs) events.push(this.cut(true));
        events.push({ type: 'stopped', segments: this.index, totalSpeechMs: this.totalSpeechMs });
        this.stateValue = 'idle';
        this.segFrames = [];
      }
    }
    return events;
  }

  private trimLeadingSilence(): void {
    const keepFrames = Math.ceil(this.opts.preRollMs / this.opts.frameMs);
    if (this.segFrames.length > keepFrames) {
      const dropped = this.segFrames.length - keepFrames;
      this.segFrames = this.segFrames.slice(dropped);
      this.segStartMs += dropped * this.opts.frameMs;
    }
  }

  private cut(final: boolean): SegmenterEvent {
    const { frameMs, tailKeepMs } = this.opts;
    // Trim trailing silence down to tailKeepMs, but never below the frames we have.
    const trailingSilenceFrames = Math.floor(this.silenceRunMs / frameMs);
    const keepTailFrames = Math.ceil(tailKeepMs / frameMs);
    const dropFrames = Math.max(0, trailingSilenceFrames - keepTailFrames);
    const kept = dropFrames > 0 ? this.segFrames.slice(0, this.segFrames.length - dropFrames) : this.segFrames;
    const pcm = concatPcm(kept);
    const endMs = this.segStartMs + kept.length * frameMs;
    const pauseBeforeMs =
      this.prevSegLastLoudMs !== null && this.segFirstSpeechMs !== null
        ? Math.max(0, this.segFirstSpeechMs - this.prevSegLastLoudMs)
        : 0;
    const event: SegmenterEvent = {
      type: 'segment',
      index: this.index,
      pcm,
      startMs: this.segStartMs,
      endMs,
      speechMs: this.segSpeechMs,
      pauseBeforeMs,
      final,
    };
    this.index++;
    this.prevSegLastLoudMs = this.lastLoudMs;
    // Start the next segment from the silence we did not keep.
    this.segFrames = dropFrames > 0 ? this.segFrames.slice(this.segFrames.length - dropFrames) : [];
    this.segStartMs = endMs;
    this.segSpeechMs = 0;
    this.segFirstSpeechMs = null;
    return event;
  }
}

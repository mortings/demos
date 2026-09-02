/**
 * Energy based voice activity detection with an adaptive noise floor.
 *
 * It is deliberately simple: the user controls start/stop with the hotkey, so
 * the detector only has to be good at two things - telling "someone is talking"
 * from "the room is quiet" so we can spot pauses, and not flickering on short
 * consonant gaps. It adapts the noise floor downwards quickly and upwards
 * slowly, and only while nobody is speaking, so it never learns speech as noise.
 */
export interface VadOptions {
  /** Speech must exceed the noise floor by this many dB. */
  thresholdDb: number;
  /** Length of the window used to estimate the noise floor. */
  noiseWindowMs: number;
  /** Percentile of the window that is taken as the room noise level. */
  noisePercentile: number;
  /** Absolute floor: frames quieter than this are never speech. */
  minSpeechDb: number;
  /** Keep reporting speech this long after the last loud frame. */
  hangoverMs: number;
  /** Consecutive loud frames needed before speech starts (filters clicks). */
  onsetFrames: number;
  initialNoiseDb: number;
}

export const DEFAULT_VAD: VadOptions = {
  thresholdDb: 8,
  noiseWindowMs: 4000,
  noisePercentile: 0.1,
  minSpeechDb: -55,
  hangoverMs: 240,
  onsetFrames: 2,
  initialNoiseDb: -60,
};

export const SENSITIVITY_PRESETS = {
  low: { thresholdDb: 12, minSpeechDb: -48 },
  normal: { thresholdDb: 8, minSpeechDb: -55 },
  high: { thresholdDb: 5, minSpeechDb: -62 },
} as const;

/** RMS level of a 16-bit PCM frame in dBFS, floored at -100. */
export function frameDb(frame: Int16Array): number {
  if (frame.length === 0) return -100;
  let sum = 0;
  for (let i = 0; i < frame.length; i++) {
    const s = (frame[i] as number) / 32768;
    sum += s * s;
  }
  const rms = Math.sqrt(sum / frame.length);
  if (rms <= 1e-5) return -100;
  return Math.max(-100, 20 * Math.log10(rms));
}

/** Map dBFS to a 0..1 meter value that looks good on a waveform. */
export function dbToLevel(db: number): number {
  const level = (db + 60) / 60; // -60 dB -> 0, 0 dB -> 1
  return Math.min(1, Math.max(0, level));
}

export class EnergyVad {
  /** Estimated room noise level in dBFS. */
  noiseDb: number;
  /** Speech state including the hangover. */
  speech = false;
  /** Whether the most recent frame was above the gate (no hangover). */
  loud = false;
  private candidate = 0;
  private hangRemainingMs = 0;
  private readonly frameMs: number;
  private opts: VadOptions;
  private window: number[] = [];
  private windowFrames: number;

  constructor(opts: Partial<VadOptions> = {}, frameMs = 20) {
    this.opts = { ...DEFAULT_VAD, ...opts };
    this.frameMs = frameMs;
    this.noiseDb = this.opts.initialNoiseDb;
    this.windowFrames = Math.max(10, Math.round(this.opts.noiseWindowMs / frameMs));
  }

  setOptions(opts: Partial<VadOptions>): void {
    this.opts = { ...this.opts, ...opts };
    this.windowFrames = Math.max(10, Math.round(this.opts.noiseWindowMs / this.frameMs));
  }

  /** Reset the speech state but keep the learned noise floor. */
  resetSpeech(): void {
    this.speech = false;
    this.loud = false;
    this.candidate = 0;
    this.hangRemainingMs = 0;
  }

  get gateDb(): number {
    return Math.max(this.opts.minSpeechDb, this.noiseDb + this.opts.thresholdDb);
  }

  /** Feed one frame's level; returns whether the frame counts as speech. */
  update(db: number): boolean {
    this.trackNoise(db);
    const loud = db > this.gateDb;
    this.loud = loud;
    if (loud) {
      this.candidate++;
      if (this.speech || this.candidate >= this.opts.onsetFrames) {
        this.speech = true;
        this.hangRemainingMs = this.opts.hangoverMs;
      }
    } else {
      this.candidate = 0;
      if (this.speech) {
        this.hangRemainingMs -= this.frameMs;
        if (this.hangRemainingMs <= 0) this.speech = false;
      }
    }
    return this.speech;
  }

  /**
   * The noise floor is a low percentile of recent frame levels. Speech always
   * has short dips between syllables and words, so the percentile stays at the
   * room level while somebody talks, yet it follows a fan or air-conditioner
   * that switches on. A little smoothing keeps it from jumping frame to frame.
   */
  private trackNoise(db: number): void {
    this.window.push(db);
    if (this.window.length > this.windowFrames) this.window.shift();
    if (this.window.length < 5) {
      this.noiseDb = Math.min(this.noiseDb, db);
      return;
    }
    const sorted = [...this.window].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * this.opts.noisePercentile));
    const estimate = sorted[idx] as number;
    const rate = estimate < this.noiseDb ? 0.5 : 0.08;
    this.noiseDb += (estimate - this.noiseDb) * rate;
    this.noiseDb = Math.min(-30, Math.max(-95, this.noiseDb));
  }
}

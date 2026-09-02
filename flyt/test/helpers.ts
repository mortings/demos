/** Deterministic PRNG so audio tests are reproducible. */
export function makeRng(seed = 1234): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

const FRAME_MS = 20;
const SAMPLE_RATE = 16000;
export const FRAME_SAMPLES = (SAMPLE_RATE * FRAME_MS) / 1000;

/** White noise frame at roughly the requested dBFS RMS level. */
export function noiseFrame(rng: () => number, dbfs: number): Int16Array {
  const rms = 32768 * Math.pow(10, dbfs / 20);
  const amplitude = rms * Math.sqrt(3); // uniform noise: rms = A / sqrt(3)
  const frame = new Int16Array(FRAME_SAMPLES);
  for (let i = 0; i < frame.length; i++) {
    frame[i] = Math.round((rng() * 2 - 1) * amplitude);
  }
  return frame;
}

export const silence = (rng: () => number) => noiseFrame(rng, -75);

/**
 * Speech-like frames: a 260 ms syllable cycle with loud vowels, softer
 * consonants and a short near-silent gap, so the noise tracker sees dips the
 * way it does with a real voice.
 */
let syllablePhase = 0;
export function speech(rng: () => number): Int16Array {
  const phase = syllablePhase++ % 13;
  const db = phase < 8 ? -25 + (rng() * 4 - 2) : phase < 11 ? -36 : -68;
  return noiseFrame(rng, db);
}

export function framesFor(ms: number): number {
  return Math.round(ms / FRAME_MS);
}

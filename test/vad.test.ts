import { describe, expect, it } from 'vitest';
import { EnergyVad, dbToLevel, frameDb } from '../src/main/pipeline/vad';
import { makeRng, noiseFrame, silence, speech } from './helpers';

describe('frameDb', () => {
  it('measures synthetic levels within a couple of dB', () => {
    const rng = makeRng();
    expect(frameDb(noiseFrame(rng, -25))).toBeGreaterThan(-28);
    expect(frameDb(noiseFrame(rng, -25))).toBeLessThan(-22);
    expect(frameDb(noiseFrame(rng, -75))).toBeLessThan(-70);
    expect(frameDb(new Int16Array(320))).toBe(-100);
  });

  it('maps db to a 0..1 level', () => {
    expect(dbToLevel(-100)).toBe(0);
    expect(dbToLevel(0)).toBe(1);
    expect(dbToLevel(-30)).toBeCloseTo(0.5);
  });
});

describe('EnergyVad', () => {
  it('detects speech after onset and releases after the hangover', () => {
    const rng = makeRng(7);
    const vad = new EnergyVad({ hangoverMs: 200, onsetFrames: 2 }, 20);
    for (let i = 0; i < 25; i++) expect(vad.update(frameDb(silence(rng)))).toBe(false);
    // Noise floor should have moved down towards the -75 dB room.
    expect(vad.noiseDb).toBeLessThan(-65);

    expect(vad.update(frameDb(noiseFrame(rng, -25)))).toBe(false); // first loud frame: candidate only
    expect(vad.update(frameDb(noiseFrame(rng, -25)))).toBe(true);
    for (let i = 0; i < 40; i++) expect(vad.update(frameDb(speech(rng)))).toBe(true);

    // Hangover: 200 ms = 10 frames of silence still count as speech.
    for (let i = 0; i < 9; i++) expect(vad.update(frameDb(silence(rng)))).toBe(true);
    expect(vad.update(frameDb(silence(rng)))).toBe(false);
  });

  it('does not learn speech as noise', () => {
    const rng = makeRng(3);
    const vad = new EnergyVad({}, 20);
    for (let i = 0; i < 50; i++) vad.update(frameDb(silence(rng)));
    for (let i = 0; i < 600; i++) vad.update(frameDb(speech(rng)));
    // Twelve seconds of talking: the floor follows the syllable gaps, not the vowels.
    expect(vad.noiseDb).toBeLessThan(-58);
    expect(vad.speech).toBe(true);
  });

  it('adapts upwards slowly to a noisier room', () => {
    const rng = makeRng(9);
    const vad = new EnergyVad({}, 20);
    for (let i = 0; i < 50; i++) vad.update(frameDb(silence(rng)));
    for (let i = 0; i < 400; i++) vad.update(frameDb(noiseFrame(rng, -50)));
    expect(vad.noiseDb).toBeGreaterThan(-54);
    expect(vad.noiseDb).toBeLessThan(-46);
    // Once adapted, the fan itself is no longer speech...
    expect(vad.update(frameDb(noiseFrame(rng, -50)))).toBe(false);
    // ...but a -25 dB voice still is.
    vad.update(frameDb(noiseFrame(rng, -25)));
    expect(vad.update(frameDb(noiseFrame(rng, -25)))).toBe(true);
  });
});

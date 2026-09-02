import { describe, expect, it } from 'vitest';
import { concatPcm, encodeWav, pcmDurationMs } from '../src/main/pipeline/wav';

describe('wav', () => {
  it('writes a valid 16 kHz mono header', () => {
    const pcm = new Int16Array([0, 1000, -1000, 32767, -32768]);
    const wav = encodeWav(pcm, 16000);
    const view = new DataView(wav.buffer);
    const ascii = (o: number, n: number) => String.fromCharCode(...wav.slice(o, o + n));
    expect(ascii(0, 4)).toBe('RIFF');
    expect(ascii(8, 4)).toBe('WAVE');
    expect(ascii(12, 4)).toBe('fmt ');
    expect(ascii(36, 4)).toBe('data');
    expect(view.getUint32(4, true)).toBe(36 + pcm.length * 2);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint32(28, true)).toBe(32000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(pcm.length * 2);
    expect(view.getInt16(44 + 2, true)).toBe(1000);
    expect(view.getInt16(44 + 8, true)).toBe(-32768);
    expect(wav.length).toBe(44 + pcm.length * 2);
  });

  it('concatenates pcm and reports duration', () => {
    const out = concatPcm([new Int16Array([1, 2]), new Int16Array([]), new Int16Array([3])]);
    expect(Array.from(out)).toEqual([1, 2, 3]);
    expect(pcmDurationMs(16000, 16000)).toBe(1000);
    expect(pcmDurationMs(320, 16000)).toBe(20);
  });
});

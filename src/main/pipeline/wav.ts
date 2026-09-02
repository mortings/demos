/** Concatenate PCM buffers into one. */
export function concatPcm(parts: Int16Array[]): Int16Array {
  let total = 0;
  for (const part of parts) total += part.length;
  const out = new Int16Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function pcmDurationMs(samples: number, sampleRate: number): number {
  return Math.round((samples / sampleRate) * 1000);
}

/** Encode 16-bit PCM as a RIFF/WAVE file. */
export function encodeWav(pcm: Int16Array, sampleRate: number, channels = 1): Uint8Array {
  const bytesPerSample = 2;
  const dataBytes = pcm.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, dataBytes, true);
  let offset = 44;
  for (let i = 0; i < pcm.length; i++) {
    view.setInt16(offset, pcm[i] as number, true);
    offset += 2;
  }
  return new Uint8Array(buffer);
}

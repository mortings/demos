import type { AudioDevice, EngineCommand } from '../../shared/types';

/**
 * Hidden window that owns the microphone. It captures audio through an
 * AudioWorklet, converts it to 16 kHz 16-bit mono in 20 ms frames and streams
 * the frames to the main process, which does voice activity detection and
 * everything else. It also plays the small UI sounds.
 */

const TARGET_RATE = 16000;
const FRAME = 320; // 20 ms at 16 kHz

const WORKLET_SOURCE = `
class FlytCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / ${TARGET_RATE};
    this.pos = 0;          // fractional read position into the current input block chain
    this.prev = 0;         // last sample of the previous block (for interpolation)
    this.buf = new Int16Array(${FRAME});
    this.n = 0;
  }
  push(sample) {
    const s = sample < -1 ? -1 : sample > 1 ? 1 : sample;
    this.buf[this.n++] = s < 0 ? s * 32768 : s * 32767;
    if (this.n === ${FRAME}) {
      this.port.postMessage(this.buf.buffer, [this.buf.buffer]);
      this.buf = new Int16Array(${FRAME});
      this.n = 0;
    }
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    if (this.ratio === 1) {
      for (let i = 0; i < ch.length; i++) this.push(ch[i]);
      return true;
    }
    // Linear-interpolation resampler for contexts that ignore the requested rate.
    let pos = this.pos;
    while (pos < ch.length) {
      const i = Math.floor(pos);
      const frac = pos - i;
      const a = i === 0 ? this.prev : ch[i - 1];
      const b = ch[i];
      this.push(a + (b - a) * frac);
      pos += this.ratio;
    }
    this.pos = pos - ch.length;
    this.prev = ch[ch.length - 1];
    return true;
  }
}
registerProcessor('flyt-capture', FlytCapture);
`;

const api = window.flyt;
let deviceId: string | null = null;
let warm = false;
let ctx: AudioContext | null = null;
let stream: MediaStream | null = null;
let opening: Promise<void> | null = null;
let workletUrl: string | null = null;

function workletModuleUrl(): string {
  if (!workletUrl) workletUrl = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' }));
  return workletUrl;
}

async function enumerate(): Promise<void> {
  try {
    // Labels are only available after permission has been granted once.
    const devices = await navigator.mediaDevices.enumerateDevices();
    const list: AudioDevice[] = devices
      .filter((d) => d.kind === 'audioinput' && d.deviceId)
      .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Microphone ${i + 1}` }));
    api.engine.send({ type: 'devices', devices: list });
  } catch (err) {
    api.engine.send({ type: 'error', message: `Could not list microphones: ${String(err)}` });
  }
}

async function open(): Promise<void> {
  if (ctx) return;
  if (opening) return opening;
  opening = (async () => {
    try {
      const constraints: MediaTrackConstraints = {
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: true,
        sampleRate: TARGET_RATE,
      };
      if (deviceId) constraints.deviceId = { exact: deviceId };
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: constraints });
      } catch (err) {
        if (deviceId) {
          // The saved device may be unplugged: fall back to the default input.
          stream = await navigator.mediaDevices.getUserMedia({ audio: { ...constraints, deviceId: undefined } });
        } else {
          throw err;
        }
      }
      const audioContext = new AudioContext({ sampleRate: TARGET_RATE, latencyHint: 'interactive' });
      await audioContext.audioWorklet.addModule(workletModuleUrl());
      const source = audioContext.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(audioContext, 'flyt-capture', { numberOfInputs: 1, numberOfOutputs: 0 });
      node.port.onmessage = (event: MessageEvent<ArrayBuffer>) => api.engine.sendChunk(event.data);
      source.connect(node);
      if (audioContext.state !== 'running') await audioContext.resume();
      ctx = audioContext;
      api.engine.send({ type: 'opened', deviceId, sampleRate: audioContext.sampleRate });
      void enumerate();
    } catch (err) {
      const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      api.engine.send({ type: 'error', message: `Microphone unavailable (${message})` });
      await close();
    } finally {
      opening = null;
    }
  })();
  return opening;
}

async function close(): Promise<void> {
  if (stream) {
    for (const track of stream.getTracks()) track.stop();
    stream = null;
  }
  if (ctx) {
    const c = ctx;
    ctx = null;
    await c.close().catch(() => undefined);
    api.engine.send({ type: 'closed' });
  }
}

// ------------------------------------------------------------------- sounds

let soundCtx: AudioContext | null = null;

function tone(context: AudioContext, at: number, freq: number, duration: number, gain = 0.12, type: OscillatorType = 'sine'): void {
  const osc = context.createOscillator();
  const amp = context.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  amp.gain.setValueAtTime(0, at);
  amp.gain.linearRampToValueAtTime(gain, at + 0.008);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(amp).connect(context.destination);
  osc.start(at);
  osc.stop(at + duration + 0.02);
}

function playSound(name: 'start' | 'stop' | 'error' | 'cancel' | 'done'): void {
  soundCtx ??= new AudioContext();
  const c = soundCtx;
  const t = c.currentTime + 0.01;
  switch (name) {
    case 'start':
      tone(c, t, 660, 0.09);
      tone(c, t + 0.07, 880, 0.12);
      break;
    case 'stop':
      tone(c, t, 880, 0.08);
      tone(c, t + 0.06, 660, 0.12);
      break;
    case 'done':
      tone(c, t, 1046, 0.09, 0.09);
      break;
    case 'cancel':
      tone(c, t, 440, 0.12, 0.08, 'triangle');
      break;
    case 'error':
      tone(c, t, 220, 0.18, 0.1, 'square');
      tone(c, t + 0.16, 196, 0.22, 0.1, 'square');
      break;
  }
}

// ----------------------------------------------------------------- commands

api.engine.onCommand((command: EngineCommand) => {
  switch (command.type) {
    case 'configure': {
      const deviceChanged = command.deviceId !== deviceId;
      deviceId = command.deviceId;
      warm = command.warm;
      if (deviceChanged && ctx) {
        void close().then(() => (warm ? open() : undefined));
      } else if (warm && !ctx) {
        void open();
      } else if (!warm && ctx) {
        // Main will ask us to open again when a dictation starts.
        void close();
      }
      break;
    }
    case 'open':
      void open();
      break;
    case 'close':
      void close();
      break;
    case 'enumerate':
      void enumerate();
      break;
    case 'sound':
      playSound(command.name);
      break;
  }
});

navigator.mediaDevices.addEventListener('devicechange', () => void enumerate());
api.engine.send({ type: 'ready' });

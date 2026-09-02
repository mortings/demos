import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DictationController } from '../src/main/pipeline/session';
import { DEFAULT_SETTINGS } from '../src/shared/defaults';
import type { HistoryItem, OverlayState, Settings } from '../src/shared/types';
import { makeRng, silence, speech } from './helpers';

/**
 * End-to-end run of the controller against a mock speech-to-text server that
 * speaks the OpenAI protocol. The cleanup model is disabled so the offline
 * rules are exercised; the point is the orchestration: hotkey semantics,
 * segmentation, transcription, insertion, history.
 */

let server: http.Server;
let baseUrl = '';
let requests = 0;
const replies: string[] = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url?.endsWith('/audio/transcriptions')) {
      requests++;
      const text = replies.shift() ?? 'um hello hello world';
      // Drain the body, then reply.
      req.on('data', () => undefined);
      req.on('end', () => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ text, language: 'english' }));
      });
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});

afterAll(() => {
  server.close();
});

function makeController(overrides: Partial<Settings['dictation']> = {}) {
  const settings: Settings = structuredClone(DEFAULT_SETTINGS);
  settings.asr.provider = 'custom';
  settings.asr.customBaseUrl = baseUrl;
  settings.llm.provider = 'none';
  settings.audio.keepMicWarm = true;
  settings.dictation = { ...settings.dictation, ...overrides };
  const inserted: string[] = [];
  const history: HistoryItem[] = [];
  const overlays: OverlayState[] = [];
  const sounds: string[] = [];
  const controller = new DictationController({
    settings: () => settings,
    secret: () => null,
    insert: async (text) => {
      inserted.push(text);
    },
    getActiveApp: async () => ({ name: 'Slack', bundleId: 'com.tinyspeck.slackmacgap' }),
    openMic: () => undefined,
    closeMic: () => undefined,
    playSound: (name) => sounds.push(name),
    log: () => undefined,
  });
  controller.on('history', (item: HistoryItem) => history.push(item));
  controller.on('overlay', (state: OverlayState) => overlays.push(state));
  return { controller, inserted, history, overlays, sounds, settings };
}

function feed(controller: DictationController, rng: () => number, ms: number, kind: 'speech' | 'silence') {
  for (let i = 0; i < Math.round(ms / 20); i++) controller.pushAudio(kind === 'speech' ? speech(rng) : silence(rng));
}

function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - started > timeoutMs) return reject(new Error('timed out waiting'));
      setTimeout(tick, 10);
    };
    tick();
  });
}

describe('DictationController', () => {
  it('hold-to-talk: records, transcribes, cleans with rules and inserts once', async () => {
    const rng = makeRng(11);
    const { controller, inserted, history, overlays, sounds } = makeController();
    replies.push('um so let us ship it ship it on tuesday');
    const before = requests;

    feed(controller, rng, 600, 'silence'); // warm mic
    controller.pttDown();
    expect(controller.active).toBe(true);
    expect(controller.mode).toBe('hold');
    feed(controller, rng, 2500, 'speech');
    controller.pttUp(2500);
    feed(controller, rng, 600, 'silence'); // post-roll

    await waitFor(() => history.length === 1);
    expect(requests - before).toBe(1);
    expect(inserted).toEqual(['So let us ship it on tuesday']); // casual style (Slack): no trailing full stop
    expect(history[0]!.raw).toBe('um so let us ship it ship it on tuesday');
    expect(history[0]!.app).toBe('Slack');
    expect(history[0]!.mode).toBe('hold');
    expect(controller.active).toBe(false);
    expect(overlays.some((o) => o.phase === 'listening')).toBe(true);
    expect(overlays.some((o) => o.phase === 'processing')).toBe(true);
    expect(overlays.at(-1)?.phase).toBe('inserted');
    expect(sounds).toEqual(['start', 'stop', 'done']);
  });

  it('a quick tap switches to hands-free and inserts chunk by chunk', async () => {
    const rng = makeRng(12);
    const { controller, inserted, history } = makeController({ pauseMs: 700 });
    replies.push('first sentence here', 'and then the second one');

    controller.pttDown();
    controller.pttUp(120); // tap
    expect(controller.mode).toBe('handsFree');
    feed(controller, rng, 2000, 'speech');
    feed(controller, rng, 1500, 'silence'); // pause cuts chunk 1
    await waitFor(() => inserted.length === 1);
    expect(inserted[0]).toBe('First sentence here'); // casual style in Slack

    feed(controller, rng, 2000, 'speech');
    controller.toggleHandsFree(); // stop
    feed(controller, rng, 600, 'silence');
    await waitFor(() => history.length === 1);
    expect(inserted).toEqual(['First sentence here', ' And then the second one']);
    expect(history[0]!.mode).toBe('handsFree');
    expect(controller.active).toBe(false);
  });

  it('reports "didn\'t catch that" when nothing was said', async () => {
    const rng = makeRng(13);
    const { controller, inserted, overlays } = makeController();
    controller.pttDown();
    feed(controller, rng, 800, 'silence');
    controller.pttUp(800);
    feed(controller, rng, 600, 'silence');
    await waitFor(() => overlays.some((o) => o.phase === 'empty'));
    expect(inserted).toEqual([]);
    expect(controller.active).toBe(false);
  });

  it('escape cancels without inserting', async () => {
    const rng = makeRng(14);
    const { controller, inserted, overlays } = makeController();
    controller.pttDown();
    feed(controller, rng, 1500, 'speech');
    controller.cancel();
    feed(controller, rng, 600, 'silence');
    await new Promise((r) => setTimeout(r, 50));
    expect(inserted).toEqual([]);
    expect(overlays.at(-1)?.phase).toBe('cancelled');
    expect(controller.active).toBe(false);
  });

  it('shows an error when the recogniser fails', async () => {
    const rng = makeRng(15);
    const { controller, inserted, overlays, settings } = makeController();
    settings.asr.customBaseUrl = 'http://127.0.0.1:9/v1'; // nothing listens here
    controller.pttDown();
    feed(controller, rng, 1500, 'speech');
    controller.pttUp(1500);
    feed(controller, rng, 600, 'silence');
    await waitFor(() => overlays.some((o) => o.phase === 'error'));
    expect(inserted).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { Segmenter, type SegmenterEvent, type SegmenterOptions } from '../src/main/pipeline/segmenter';
import { framesFor, makeRng, silence, speech } from './helpers';

type Kind = 'silence' | 'speech';

function feed(seg: Segmenter, rng: () => number, ms: number, kind: Kind, sink: SegmenterEvent[]): void {
  for (let i = 0; i < framesFor(ms); i++) {
    sink.push(...seg.push(kind === 'speech' ? speech(rng) : silence(rng)));
  }
}

const segmentsOf = (events: SegmenterEvent[]) =>
  events.filter((e): e is Extract<SegmenterEvent, { type: 'segment' }> => e.type === 'segment');
const stoppedOf = (events: SegmenterEvent[]) =>
  events.find((e): e is Extract<SegmenterEvent, { type: 'stopped' }> => e.type === 'stopped');

const durationMs = (pcm: Int16Array) => (pcm.length / 16000) * 1000;

const handsFree: Partial<SegmenterOptions> = { pauseMs: 900, minSegmentMs: 1500, preRollMs: 400, postRollMs: 400 };
const hold: Partial<SegmenterOptions> = { pauseMs: 1200, minSegmentMs: 8000, preRollMs: 400, postRollMs: 400 };

describe('Segmenter', () => {
  it('cuts at a pause in hands-free configuration and reports the pause length', () => {
    const rng = makeRng(1);
    const seg = new Segmenter(handsFree);
    const ev: SegmenterEvent[] = [];
    feed(seg, rng, 1000, 'silence', ev); // warm, idle
    seg.start();
    feed(seg, rng, 2000, 'speech', ev);
    feed(seg, rng, 1500, 'silence', ev);
    feed(seg, rng, 2000, 'speech', ev);
    seg.stop();
    feed(seg, rng, 600, 'silence', ev);

    const segments = segmentsOf(ev);
    expect(segments).toHaveLength(2);
    expect(segments[0]!.final).toBe(false);
    expect(segments[1]!.final).toBe(true);
    // First segment: pre-roll (400) + 2000 speech + ~200 tail (+ hangover slack)
    expect(durationMs(segments[0]!.pcm)).toBeGreaterThan(2400);
    expect(durationMs(segments[0]!.pcm)).toBeLessThan(3000);
    expect(segments[0]!.speechMs).toBeGreaterThan(1900);
    // The pause between the two spoken parts is about 1.5 s.
    expect(segments[1]!.pauseBeforeMs).toBeGreaterThan(1300);
    expect(segments[1]!.pauseBeforeMs).toBeLessThan(1700);
    const stopped = stoppedOf(ev);
    expect(stopped?.segments).toBe(2);
    expect(seg.state).toBe('idle');
  });

  it('keeps a pause inside one segment in hold configuration', () => {
    const rng = makeRng(2);
    const seg = new Segmenter(hold);
    const ev: SegmenterEvent[] = [];
    feed(seg, rng, 1000, 'silence', ev);
    seg.start();
    feed(seg, rng, 2000, 'speech', ev);
    feed(seg, rng, 1500, 'silence', ev);
    feed(seg, rng, 2000, 'speech', ev);
    seg.stop();
    feed(seg, rng, 600, 'silence', ev);

    const segments = segmentsOf(ev);
    expect(segments).toHaveLength(1);
    expect(segments[0]!.final).toBe(true);
    // 400 pre-roll + 2000 + 1500 + 2000 + ~200 tail; trailing post-roll trimmed.
    const ms = durationMs(segments[0]!.pcm);
    expect(ms).toBeGreaterThan(5900);
    expect(ms).toBeLessThan(6500);
  });

  it('includes pre-roll audio spoken just before start()', () => {
    const rng = makeRng(3);
    const seg = new Segmenter({ ...hold, preRollMs: 400 });
    const ev: SegmenterEvent[] = [];
    feed(seg, rng, 1000, 'silence', ev);
    feed(seg, rng, 300, 'speech', ev); // user starts talking before pressing
    seg.start();
    feed(seg, rng, 1000, 'speech', ev);
    seg.stop();
    feed(seg, rng, 600, 'silence', ev);
    const [segment] = segmentsOf(ev);
    expect(segment).toBeDefined();
    expect(segment!.startMs).toBeLessThan(1300);
    expect(durationMs(segment!.pcm)).toBeGreaterThan(1500); // 400 pre-roll + 1000 + tail
    expect(segment!.speechMs).toBeGreaterThan(1150);
  });

  it('reports nothing when the user did not speak', () => {
    const rng = makeRng(4);
    const seg = new Segmenter(handsFree);
    const ev: SegmenterEvent[] = [];
    feed(seg, rng, 500, 'silence', ev);
    seg.start();
    feed(seg, rng, 1200, 'silence', ev);
    seg.stop();
    feed(seg, rng, 600, 'silence', ev);
    expect(segmentsOf(ev)).toHaveLength(0);
    expect(stoppedOf(ev)?.segments).toBe(0);
  });

  it('splits very long uninterrupted speech at the maximum length', () => {
    const rng = makeRng(5);
    const seg = new Segmenter({ ...hold, maxSegmentMs: 10000 });
    const ev: SegmenterEvent[] = [];
    seg.start();
    feed(seg, rng, 32000, 'speech', ev);
    seg.stop();
    feed(seg, rng, 600, 'silence', ev);
    const segments = segmentsOf(ev);
    expect(segments.length).toBeGreaterThanOrEqual(3);
    for (const s of segments) expect(durationMs(s.pcm)).toBeLessThanOrEqual(10000 + 1);
    expect(segments.at(-1)!.final).toBe(true);
  });

  it('does not accumulate a huge silent segment while waiting in hands-free', () => {
    const rng = makeRng(6);
    const seg = new Segmenter(handsFree);
    const ev: SegmenterEvent[] = [];
    seg.start();
    feed(seg, rng, 20000, 'silence', ev);
    feed(seg, rng, 1500, 'speech', ev);
    seg.stop();
    feed(seg, rng, 600, 'silence', ev);
    const [segment] = segmentsOf(ev);
    expect(segment).toBeDefined();
    expect(durationMs(segment!.pcm)).toBeLessThan(3000);
    expect(segment!.startMs).toBeGreaterThan(18000);
  });

  it('cancel() discards the recording', () => {
    const rng = makeRng(8);
    const seg = new Segmenter(handsFree);
    const ev: SegmenterEvent[] = [];
    seg.start();
    feed(seg, rng, 2000, 'speech', ev);
    seg.cancel();
    feed(seg, rng, 600, 'silence', ev);
    expect(segmentsOf(ev)).toHaveLength(0);
    expect(seg.state).toBe('idle');
  });

  it('level events expose silence duration for auto-stop logic', () => {
    const rng = makeRng(9);
    const seg = new Segmenter(handsFree);
    const ev: SegmenterEvent[] = [];
    seg.start();
    feed(seg, rng, 1000, 'speech', ev);
    feed(seg, rng, 3000, 'silence', ev);
    const last = ev.filter((e) => e.type === 'level').at(-1);
    expect(last?.type === 'level' && last.silenceMs).toBeGreaterThan(2500);
  });
});

describe('Segmenter post-roll', () => {
  it('finishes right away when the speaker went quiet before releasing', () => {
    const rng = makeRng(21);
    const seg = new Segmenter({ ...hold, postRollMs: 400 });
    const ev: SegmenterEvent[] = [];
    seg.start();
    feed(seg, rng, 1500, 'speech', ev);
    feed(seg, rng, 600, 'silence', ev); // stopped talking, key still held
    seg.stop();
    const before = ev.length;
    feed(seg, rng, 400, 'silence', ev);
    const stoppedIndex = ev.findIndex((e, i) => i >= before && e.type === 'stopped');
    // Emitted within the first couple of frames instead of after the full post-roll.
    expect(stoppedIndex).toBeGreaterThanOrEqual(0);
    expect(stoppedIndex - before).toBeLessThan(6);
    expect(segmentsOf(ev)).toHaveLength(1);
  });

  it('waits the full post-roll when the key is released mid-word', () => {
    const rng = makeRng(22);
    const seg = new Segmenter({ ...hold, postRollMs: 400 });
    const ev: SegmenterEvent[] = [];
    seg.start();
    feed(seg, rng, 1500, 'speech', ev);
    seg.stop();
    feed(seg, rng, 200, 'speech', ev); // tail of the word after release
    expect(stoppedOf(ev)).toBeUndefined();
    feed(seg, rng, 400, 'silence', ev);
    expect(stoppedOf(ev)).toBeDefined();
    // The tail spoken after release is part of the segment.
    expect(segmentsOf(ev)[0]!.speechMs).toBeGreaterThan(1600);
  });
});

import { describe, expect, it } from 'vitest';
import { guardCleanup } from '../src/main/pipeline/cleanup/guard';

const raw = 'so um I think we should probably move the meeting to tuesday because monday is a holiday and nobody will be there';

describe('guardCleanup', () => {
  it('accepts a faithful cleanup', () => {
    const r = guardCleanup(raw, 'I think we should probably move the meeting to Tuesday because Monday is a holiday and nobody will be there.');
    expect(r.accepted).toBe(true);
  });

  it('rejects chatbot preambles', () => {
    const r = guardCleanup(raw, "Sure! Here's the cleaned text: We should move the meeting.");
    expect(r.accepted).toBe(false);
    expect(r.text).toBe(raw);
  });

  it('rejects summaries that drop most of the words', () => {
    const r = guardCleanup(raw, 'Move meeting to Tuesday.');
    expect(r.accepted).toBe(false);
    expect(r.reason).toBe('too-short');
  });

  it('rejects answers that add a lot of content unless growth is allowed', () => {
    const answer = 'Tuesday works well. Here are three reasons why Tuesday is better than Monday: first, everyone is back; second, the office is open; third, the client is available. Let me know if you want me to send invites.';
    expect(guardCleanup('what about tuesday', answer).accepted).toBe(false);
    expect(guardCleanup('what about tuesday', answer, { allowGrowth: true }).accepted).toBe(true);
  });

  it('strips wrapping quotes and code fences', () => {
    expect(guardCleanup('hello there', '"Hello there."').text).toBe('Hello there.');
    expect(guardCleanup('hello there', '```\nHello there.\n```').text).toBe('Hello there.');
  });

  it('allows empty output for filler-only input but not for real speech', () => {
    expect(guardCleanup('um uh', '').accepted).toBe(true);
    const r = guardCleanup(raw, '');
    expect(r.accepted).toBe(false);
    expect(r.text).toBe(raw);
  });

  it('rejects leaked tags', () => {
    expect(guardCleanup(raw, '<transcript>hi</transcript>').accepted).toBe(false);
  });
});

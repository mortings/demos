import { useState } from 'react';
import type { PaneProps } from '../App';
import { useHistory } from '../hooks';
import { Badge, Button, Row, Section, Toggle } from '../ui';

const api = window.flyt;

function formatWhen(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return sameDay ? time : `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ${time}`;
}

export function HistoryPane({ settings, update }: PaneProps) {
  const items = useHistory();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (id: string, text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1200);
    });
  };

  return (
    <>
      <h1>History</h1>
      <p className="lede">Everything you dictated recently, with the raw transcript for comparison. Stored only on this computer.</p>

      <Section title="Settings">
        <Row label="Keep history">
          <Toggle checked={settings.general.keepHistory} onChange={(v) => void update({ general: { keepHistory: v } })} />
        </Row>
        <Row label="Clear history" hint={`${items.length} items`}>
          <Button kind="danger" small disabled={items.length === 0} onClick={() => void api.clearHistory()}>
            Clear all
          </Button>
        </Row>
      </Section>

      <Section title="Recent dictations">
        <div className="list">
          {items.length === 0 && <div className="empty">Nothing yet. Hold {settings.hotkeys.pushToTalk.label} and say something.</div>}
          {items.map((item) => (
            <div className="history-item" key={item.id}>
              <div className="history-meta">
                <span>{formatWhen(item.ts)}</span>
                {item.app && <Badge tone="muted">{item.app}</Badge>}
                {item.language && <Badge tone="muted">{item.language.toUpperCase()}</Badge>}
                {item.mode === 'handsFree' && <Badge tone="muted">hands-free</Badge>}
                <span>{(item.audioMs / 1000).toFixed(1)} s audio</span>
                {item.latencyMs > 0 && <span>{(item.latencyMs / 1000).toFixed(1)} s to insert</span>}
                <div className="history-actions">
                  <Button small kind="ghost" onClick={() => setExpanded(expanded === item.id ? null : item.id)}>
                    {expanded === item.id ? 'Hide raw' : 'Show raw'}
                  </Button>
                  <Button small kind="ghost" onClick={() => copy(item.id, item.text)}>
                    {copied === item.id ? 'Copied' : 'Copy'}
                  </Button>
                  <Button small kind="ghost" onClick={() => void api.deleteHistoryItem(item.id)}>
                    Delete
                  </Button>
                </div>
              </div>
              <div className="history-text">{item.text || <em style={{ color: 'var(--muted)' }}>(nothing inserted)</em>}</div>
              {expanded === item.id && <div className="history-raw">Raw: {item.raw}</div>}
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

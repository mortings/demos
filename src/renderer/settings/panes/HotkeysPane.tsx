import { useEffect, useState } from 'react';
import type { KeyBinding } from '../../../shared/types';
import type { PaneProps } from '../App';
import { useStatus } from '../hooks';
import { Badge, Button, Kbd, Row, Section, Slider, Toggle } from '../ui';

const api = window.flyt;

function KeyCapture({ value, onChange, allowClear }: { value: KeyBinding | null; onChange: (b: KeyBinding | null) => void; allowClear?: boolean }) {
  const [capturing, setCapturing] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!capturing) return;
    void api.startKeyCapture();
    const off = api.onKeyCapture((ev) => {
      setPreview(ev.label);
      if (ev.complete && ev.keycodes.length > 0) {
        // Escape alone is reserved for cancelling a dictation.
        if (!(ev.keycodes.length === 1 && ev.keycodes[0] === 1)) onChange({ keycodes: ev.keycodes, label: ev.label });
        setCapturing(false);
        setPreview(null);
      }
    });
    return () => {
      off();
      void api.stopKeyCapture();
    };
  }, [capturing, onChange]);

  return (
    <div className="capture">
      {capturing ? (
        <>
          <span className="listening">{preview ?? 'Press the key or combination…'}</span>
          <Button small kind="ghost" onClick={() => setCapturing(false)}>
            Cancel
          </Button>
        </>
      ) : (
        <>
          {value ? <Kbd>{value.label}</Kbd> : <span style={{ color: 'var(--muted)' }}>Not set</span>}
          <Button small onClick={() => setCapturing(true)}>
            {value ? 'Change…' : 'Set…'}
          </Button>
          {allowClear && value && (
            <Button small kind="ghost" onClick={() => onChange(null)}>
              Clear
            </Button>
          )}
        </>
      )}
    </div>
  );
}

export function HotkeysPane({ settings, update }: PaneProps) {
  const h = settings.hotkeys;
  const status = useStatus();
  const mac = api.platform === 'darwin';
  return (
    <>
      <h1>Hotkeys</h1>
      <p className="lede">
        One key does everything: hold it to dictate, tap it for hands-free. Any key or combination works, including a lone modifier such as the right
        Option key. {mac && 'Flyt needs Input Monitoring and Accessibility permission for global keys.'}
      </p>

      <Section title="Dictation key">
        <Row
          label="Hold to dictate"
          hint={`Recording starts the instant you press and stops when you let go.${mac ? ' If pressing keys while capturing shows nothing, macOS is blocking Input Monitoring for Flyt.' : ''}`}
        >
          <KeyCapture value={h.pushToTalk} onChange={(b) => b && void update({ hotkeys: { pushToTalk: b } })} />
        </Row>
        <Row label="Tap for hands-free" hint="A quick tap starts hands-free dictation; tap again to stop. Holding still works as usual.">
          <Toggle checked={h.tapForHandsFree} onChange={(v) => void update({ hotkeys: { tapForHandsFree: v } })} />
        </Row>
        <Row label="Tap threshold" hint="Presses shorter than this count as a tap.">
          <Slider value={h.tapThresholdMs} min={120} max={600} step={10} onChange={(v) => void update({ hotkeys: { tapThresholdMs: v } })} format={(v) => `${v} ms`} />
        </Row>
      </Section>

      <Section title="Extra keys">
        <Row label="Dedicated hands-free toggle" hint="Optional second shortcut that starts and stops hands-free mode.">
          <KeyCapture value={h.handsFreeToggle} onChange={(b) => void update({ hotkeys: { handsFreeToggle: b } })} allowClear />
        </Row>
        <Row label="Escape cancels" hint="Press Esc while recording to discard it.">
          <Toggle checked={h.cancelWithEscape} onChange={(v) => void update({ hotkeys: { cancelWithEscape: v } })} />
        </Row>
      </Section>

      <Section title="Status">
        <Row label="Global keyboard hook" hint={status?.hotkeysActive ? 'Flyt sees your keys in every app.' : status?.lastError ?? 'Not running.'}>
          <Badge tone={status?.hotkeysActive ? 'ok' : 'bad'}>{status?.hotkeysActive ? 'Active' : 'Unavailable'}</Badge>
        </Row>
      </Section>
    </>
  );
}

import type { PaneProps } from '../App';
import { Button, Row, Section, Select, Slider, Toggle } from '../ui';

export function GeneralPane({ settings, update, reset }: PaneProps & { reset: () => Promise<void> }) {
  const g = settings.general;
  const mac = window.flyt.platform === 'darwin';
  return (
    <>
      <h1>General</h1>
      <p className="lede">Flyt lives in the menu bar and stays out of the way.</p>

      <Section title="Startup">
        <Row label="Launch at login" hint="Start Flyt when you sign in so the hotkey is always ready.">
          <Toggle checked={g.launchAtLogin} onChange={(v) => void update({ general: { launchAtLogin: v } })} />
        </Row>
        {mac && (
          <Row label="Show in Dock" hint="Off keeps Flyt as a menu-bar-only app.">
            <Toggle checked={g.showInDock} onChange={(v) => void update({ general: { showInDock: v } })} />
          </Row>
        )}
      </Section>

      <Section title="Feedback">
        <Row label="Sounds" hint="Short tones when recording starts, stops and when text is inserted.">
          <Toggle checked={g.playSounds} onChange={(v) => void update({ general: { playSounds: v } })} />
        </Row>
        <Row label="Recording indicator" hint="The floating pill with the live waveform.">
          <Toggle checked={g.overlayEnabled} onChange={(v) => void update({ general: { overlayEnabled: v } })} />
        </Row>
        <Row label="Indicator position">
          <Select
            value={g.overlayPosition}
            options={[
              { value: 'bottom', label: 'Bottom of screen' },
              { value: 'top', label: 'Top of screen' },
            ]}
            onChange={(v) => void update({ general: { overlayPosition: v } })}
          />
        </Row>
        <Row label="Appearance">
          <Select
            value={g.theme}
            options={[
              { value: 'system', label: 'Match system' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
            onChange={(v) => void update({ general: { theme: v } })}
          />
        </Row>
      </Section>

      <Section title="Privacy">
        <Row label="Keep dictation history" hint="Stored only on this computer. Turn off to keep nothing.">
          <Toggle checked={g.keepHistory} onChange={(v) => void update({ general: { keepHistory: v } })} />
        </Row>
        <Row label="History size">
          <Slider value={g.historyLimit} min={10} max={2000} step={10} onChange={(v) => void update({ general: { historyLimit: v } })} format={(v) => `${v} items`} />
        </Row>
      </Section>

      <Section title="Reset">
        <Row label="Reset all settings" hint="Restores defaults. API keys and history are kept.">
          <Button kind="danger" onClick={() => void reset()}>
            Reset settings
          </Button>
        </Row>
      </Section>
    </>
  );
}

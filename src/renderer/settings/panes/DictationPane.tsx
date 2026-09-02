import type { PaneProps } from '../App';
import { useAudioDevices } from '../hooks';
import { Row, Section, Select, Slider, Toggle } from '../ui';

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

export function DictationPane({ settings, update }: PaneProps) {
  const d = settings.dictation;
  const a = settings.audio;
  const devices = useAudioDevices();

  return (
    <>
      <h1>Dictation</h1>
      <p className="lede">How Flyt listens, and how it turns what you said into what you meant.</p>

      <Section title="Language">
        <Row label="Spoken language" hint="Auto detects English and Norwegian, even mixed. Force one if detection ever guesses wrong.">
          <Select
            value={d.languageMode}
            options={[
              { value: 'auto', label: 'Auto (English & Norwegian)' },
              { value: 'en', label: 'English' },
              { value: 'no', label: 'Norwegian' },
            ]}
            onChange={(v) => void update({ dictation: { languageMode: v } })}
          />
        </Row>
        <Row label="Norwegian variant" hint="Recognisers drift into Danish, Swedish or Nynorsk; the cleanup pass normalises to this.">
          <Select
            value={d.norwegianVariant}
            options={[
              { value: 'nb', label: 'Bokmål' },
              { value: 'nn', label: 'Nynorsk' },
            ]}
            onChange={(v) => void update({ dictation: { norwegianVariant: v } })}
          />
        </Row>
        <Row label="Translate output" hint="Speak one language, insert the other. Off keeps the language you spoke.">
          <Select
            value={d.translateTo}
            options={[
              { value: 'off', label: 'Off' },
              { value: 'en', label: 'Always insert English' },
              { value: 'no', label: 'Always insert Norwegian' },
            ]}
            onChange={(v) => void update({ dictation: { translateTo: v } })}
          />
        </Row>
      </Section>

      <Section title="Microphone">
        <Row label="Input device">
          <Select
            value={a.deviceId ?? ''}
            options={[{ value: '', label: 'System default' }, ...devices.map((dev) => ({ value: dev.deviceId, label: dev.label }))]}
            onChange={(v) => void update({ audio: { deviceId: v || null } })}
          />
        </Row>
        <Row
          label="Instant start"
          hint="Keeps the microphone open so nothing is lost when you start talking as you press the key. The system mic indicator stays on. Audio is only kept for the pre-roll below and never leaves your computer until you dictate."
        >
          <Toggle checked={a.keepMicWarm} onChange={(v) => void update({ audio: { keepMicWarm: v } })} />
        </Row>
        <Row label="Pre-roll" hint="Audio from just before the key press that is included in the dictation.">
          <Slider value={a.preRollMs} min={0} max={1000} step={50} onChange={(v) => void update({ audio: { preRollMs: v } })} format={(v) => `${v} ms`} />
        </Row>
        <Row label="Post-roll" hint="Keeps listening briefly after you release so the last word is not clipped.">
          <Slider value={a.postRollMs} min={0} max={1000} step={50} onChange={(v) => void update({ audio: { postRollMs: v } })} format={(v) => `${v} ms`} />
        </Row>
        <Row label="Sensitivity" hint="How easily speech is told apart from room noise. Raise it for a quiet voice, lower it in a noisy room.">
          <Select
            value={a.sensitivity}
            options={[
              { value: 'low', label: 'Low (noisy room)' },
              { value: 'normal', label: 'Normal' },
              { value: 'high', label: 'High (quiet voice)' },
            ]}
            onChange={(v) => void update({ audio: { sensitivity: v } })}
          />
        </Row>
      </Section>

      <Section title="Pauses" description="Pausing never ends a dictation while you hold the key. These settings tune how pauses are interpreted.">
        <Row label="Hands-free chunk pause" hint="In hands-free mode, a pause this long sends what you said so far. Shorter feels snappier; longer gives better context.">
          <Slider value={d.pauseMs} min={500} max={2500} step={50} onChange={(v) => void update({ dictation: { pauseMs: v } })} format={seconds} />
        </Row>
        <Row label="Paragraph pause" hint="A pause at least this long is offered to the cleanup model as a possible sentence or paragraph break.">
          <Slider value={d.paragraphPauseMs} min={1000} max={5000} step={100} onChange={(v) => void update({ dictation: { paragraphPauseMs: v } })} format={seconds} />
        </Row>
        <Row label="Hands-free auto-stop" hint="Stop hands-free mode after this much silence. 0 keeps listening until you tap again.">
          <Slider
            value={d.handsFreeAutoStopMs}
            min={0}
            max={60000}
            step={1000}
            onChange={(v) => void update({ dictation: { handsFreeAutoStopMs: v } })}
            format={(v) => (v === 0 ? 'Never' : `${v / 1000} s`)}
          />
        </Row>
      </Section>

      <Section title="Cleanup" description="Applied by the cleanup model (see Providers). The offline fallback handles the first two only.">
        <Row label="Remove fillers" hint="um, uh, eh, øh, liksom, you know…">
          <Toggle checked={d.removeFillers} onChange={(v) => void update({ dictation: { removeFillers: v } })} />
        </Row>
        <Row label="Apply self-corrections" hint='"Send it Monday, no wait, Tuesday" becomes "Send it Tuesday". "Scratch that" removes the last sentence.'>
          <Toggle checked={d.applySelfCorrections} onChange={(v) => void update({ dictation: { applySelfCorrections: v } })} />
        </Row>
        <Row label="Smart punctuation" hint="Sentence punctuation and capitalisation. Off keeps it minimal.">
          <Toggle checked={d.smartPunctuation} onChange={(v) => void update({ dictation: { smartPunctuation: v } })} />
        </Row>
        <Row label="Smart numbers" hint="Dates, amounts, percentages, phone numbers and e-mail addresses written as digits and symbols.">
          <Toggle checked={d.smartNumbers} onChange={(v) => void update({ dictation: { smartNumbers: v } })} />
        </Row>
        <Row label="Voice commands" hint='"new line", "new paragraph", "ny linje", "nytt avsnitt", spoken punctuation, "all caps"…'>
          <Toggle checked={d.voiceCommands} onChange={(v) => void update({ dictation: { voiceCommands: v } })} />
        </Row>
        <Row label="Default style" hint="Used when no App style rule matches the app you are typing in.">
          <Select
            value={d.defaultStyle}
            options={[
              { value: 'standard', label: 'Standard' },
              { value: 'casual', label: 'Casual (chat)' },
              { value: 'formal', label: 'Formal' },
              { value: 'code', label: 'Code / terminal' },
            ]}
            onChange={(v) => void update({ dictation: { defaultStyle: v } })}
          />
        </Row>
        <Row label="Raw mode" hint="Skip cleanup entirely and insert exactly what the recogniser heard.">
          <Toggle checked={d.rawMode} onChange={(v) => void update({ dictation: { rawMode: v } })} />
        </Row>
      </Section>

      <Section title="Insertion">
        <Row label="Leading space" hint="Whether inserted text starts with a space. Auto adds one between hands-free chunks only.">
          <Select
            value={d.leadingSpace}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'always', label: 'Always' },
              { value: 'never', label: 'Never' },
            ]}
            onChange={(v) => void update({ dictation: { leadingSpace: v } })}
          />
        </Row>
        <Row label="Restore clipboard" hint="Flyt pastes through the clipboard and puts your previous clipboard contents back afterwards.">
          <Toggle checked={d.restoreClipboard} onChange={(v) => void update({ dictation: { restoreClipboard: v } })} />
        </Row>
      </Section>
    </>
  );
}

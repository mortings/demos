import type { PermissionKind, PermissionState } from '../../../shared/types';
import type { PaneProps } from '../App';
import { usePermissions, useSecrets, useStatus } from '../hooks';
import { Badge, Button, Kbd, Section } from '../ui';

const api = window.flyt;

const PERMISSIONS: { kind: PermissionKind; title: string; hint: string; request: string }[] = [
  {
    kind: 'microphone',
    title: 'Microphone',
    hint: 'Needed to hear you. Flyt only records while you hold the key or in hands-free mode.',
    request: 'Allow',
  },
  {
    kind: 'accessibility',
    title: 'Accessibility',
    hint: 'Lets Flyt see the dictation key in every app and paste the text at your cursor. Flyt picks it up within a few seconds of you granting it.',
    request: 'Allow',
  },
  {
    kind: 'inputMonitoring',
    title: 'Input Monitoring',
    hint: 'macOS may also ask for this the first time the hotkey hook starts. If holding the key does nothing, check it here.',
    request: 'Open settings',
  },
];

function tone(state: PermissionState): 'ok' | 'warn' | 'bad' | 'muted' {
  switch (state) {
    case 'granted':
      return 'ok';
    case 'denied':
    case 'restricted':
      return 'bad';
    case 'not-determined':
      return 'warn';
    default:
      return 'muted';
  }
}

function label(state: PermissionState): string {
  switch (state) {
    case 'granted':
      return 'Granted';
    case 'denied':
      return 'Denied';
    case 'restricted':
      return 'Restricted';
    case 'not-determined':
      return 'Not asked yet';
    case 'not-applicable':
      return 'n/a';
    default:
      return 'Unknown';
  }
}

export function SetupPane({ settings, navigate }: PaneProps) {
  const { permissions, refresh } = usePermissions();
  const { secrets } = useSecrets();
  const status = useStatus();
  const mac = api.platform === 'darwin';
  const hotkey = settings.hotkeys.pushToTalk.label;

  return (
    <>
      <h1>Welcome to Flyt</h1>
      <p className="lede">
        Hold <Kbd>{hotkey}</Kbd>, talk, let go. Your words land at the cursor in any app, cleaned up: fillers gone, self-corrections
        applied, punctuation added, in English or Norwegian. Tap the key instead of holding it for hands-free mode.
      </p>

      {(mac || api.platform === 'win32') && (
        <Section
          title="Permissions"
          description={
            mac
              ? `macOS needs your OK for each of these. Flyt re-checks them every few seconds.${
                  status?.devMode ? ' You are running from source, so macOS lists the app as “Electron” in these panes; the packaged app shows up as “Flyt”.' : ''
                }`
              : 'Windows needs microphone access.'
          }
        >
          <div className="checklist">
            {PERMISSIONS.filter((p) => mac || p.kind === 'microphone').map((p) => {
              const state = permissions?.[p.kind] ?? 'unknown';
              return (
                <div className="check-item" key={p.kind}>
                  <Badge tone={tone(state)}>{label(state)}</Badge>
                  <div className="check-text">
                    <div className="check-title">{p.title}</div>
                    <div className="check-hint">{p.hint}</div>
                  </div>
                  {state !== 'granted' && (
                    <Button small onClick={() => void api.requestPermission(p.kind).then(() => refresh())}>
                      {p.request}
                    </Button>
                  )}
                  <Button small kind="ghost" onClick={() => void api.openPermissionSettings(p.kind)}>
                    System Settings
                  </Button>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      <Section title="Services" description="Flyt uses a speech-to-text service for recognition and Claude for the cleanup pass.">
        <div className="checklist">
          <div className="check-item">
            <Badge tone={status?.asrConfigured ? 'ok' : 'bad'}>{status?.asrConfigured ? 'Ready' : 'Missing key'}</Badge>
            <div className="check-text">
              <div className="check-title">Speech-to-text ({settings.asr.provider})</div>
              <div className="check-hint">Required. Add an API key under Providers.</div>
            </div>
            <Button small onClick={() => navigate('providers')}>
              Providers
            </Button>
          </div>
          <div className="check-item">
            <Badge tone={status?.llmConfigured ? 'ok' : settings.llm.provider === 'none' ? 'muted' : 'warn'}>
              {status?.llmConfigured ? 'Ready' : settings.llm.provider === 'none' ? 'Off' : 'Missing key'}
            </Badge>
            <div className="check-text">
              <div className="check-title">Cleanup model ({settings.llm.provider})</div>
              <div className="check-hint">
                Recommended. Without it Flyt falls back to simple offline cleanup (filler removal, capitalisation) and cannot apply self-corrections.
              </div>
            </div>
            <Button small onClick={() => navigate('providers')}>
              Providers
            </Button>
          </div>
          <div className="check-item">
            <Badge tone={status?.hotkeysActive ? 'ok' : 'bad'}>{status?.hotkeysActive ? 'Active' : 'Unavailable'}</Badge>
            <div className="check-text">
              <div className="check-title">Global hotkey</div>
              <div className="check-hint">{status?.hotkeysActive ? `Hold ${hotkey} anywhere to dictate.` : status?.lastError ?? 'The keyboard hook could not start.'}</div>
            </div>
            <Button small onClick={() => navigate('hotkeys')}>
              Hotkeys
            </Button>
          </div>
          {secrets && !secrets.anthropic && settings.llm.provider === 'anthropic' && (
            <div className="note">Tip: the Anthropic key is what makes dictation forgiving. It powers filler removal, "no wait, Tuesday" corrections and paragraphing from pauses.</div>
          )}
        </div>
      </Section>

      <Section title="How to dictate">
        <ol className="steps">
          <li>
            Put the cursor where the text should go, hold <Kbd>{hotkey}</Kbd> and speak. Pauses are fine; take your time.
          </li>
          <li>Let go when you are done. The text is inserted about a second later.</li>
          <li>
            Tap <Kbd>{hotkey}</Kbd> briefly for hands-free mode: text appears as you pause. Tap again to stop.
          </li>
          <li>
            Press <Kbd>Esc</Kbd> while recording to throw the recording away.
          </li>
          <li>Correct yourself naturally ("send it Monday, no, Tuesday") and skip the ums. Flyt writes what you meant.</li>
        </ol>
      </Section>
    </>
  );
}

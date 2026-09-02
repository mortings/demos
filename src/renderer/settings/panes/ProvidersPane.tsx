import { useState } from 'react';
import { ANTHROPIC_MODEL_OPTIONS, ASR_MODEL_OPTIONS, ASR_SECRET, OPENAI_COMPAT_MODEL_OPTIONS } from '../../../shared/defaults';
import type { AsrProvider, LlmProvider, ProviderTestResult, SecretName } from '../../../shared/types';
import type { PaneProps } from '../App';
import { useSecrets } from '../hooks';
import { Badge, Button, DraftInput, Row, Section, Select, Slider } from '../ui';

const api = window.flyt;

const ASR_INFO: Record<AsrProvider, { label: string; hint: string; keyUrl: string | null }> = {
  openai: {
    label: 'OpenAI',
    hint: 'gpt-transcribe is OpenAI\'s current model: strong in English and Norwegian, accepts vocabulary hints. The older gpt-4o-transcribe and whisper-1 shut down on 26 Feb 2027.',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  groq: {
    label: 'Groq',
    hint: 'Whisper large-v3 served extremely fast (a few hundred milliseconds). Weaker on Norwegian than Scribe v2 or gpt-transcribe.',
    keyUrl: 'https://console.groq.com/keys',
  },
  deepgram: {
    label: 'Deepgram',
    hint: 'Nova-3 is the fastest hosted option (hundreds of times real time) and excellent for English; Norwegian is supported but less proven than Scribe v2.',
    keyUrl: 'https://console.deepgram.com/',
  },
  elevenlabs: {
    label: 'ElevenLabs Scribe',
    hint: 'Scribe v2 is the most accurate choice for Norwegian (about 3 % word error rate versus about 10 % for Whisper) and top-tier in English, at roughly the same speed as OpenAI. Your vocabulary is passed as keyterms.',
    keyUrl: 'https://elevenlabs.io/app/settings/api-keys',
  },
  custom: {
    label: 'Custom (OpenAI-compatible)',
    hint: 'Any server with the OpenAI /audio/transcriptions API: whisper.cpp server, Speaches, faster-whisper-server, LocalAI for fully offline use, or Mistral Voxtral (base URL https://api.mistral.ai/v1, model voxtral-mini-latest; note Voxtral does not cover Norwegian).',
    keyUrl: null,
  },
};

function KeyField({ name, saved, onSaved }: { name: SecretName; saved: boolean; onSaved: (value: string) => Promise<void> }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="row-control" style={{ flexWrap: 'wrap' }}>
      <Badge tone={saved ? 'ok' : 'warn'}>{saved ? 'Key saved' : 'No key'}</Badge>
      <input
        className="input"
        type="password"
        autoComplete="off"
        placeholder={saved ? 'Paste a new key to replace' : 'Paste API key'}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        style={{ minWidth: 260 }}
      />
      <Button
        small
        kind="primary"
        disabled={!value.trim() || busy}
        onClick={() => {
          setBusy(true);
          void onSaved(value).then(() => {
            setValue('');
            setBusy(false);
          });
        }}
      >
        Save
      </Button>
      {saved && (
        <Button small kind="ghost" onClick={() => void onSaved('')} disabled={busy}>
          Remove
        </Button>
      )}
      <span style={{ display: 'none' }}>{name}</span>
    </div>
  );
}

function TestResult({ result }: { result: ProviderTestResult | null }) {
  if (!result) return null;
  return (
    <div className={`test-result ${result.ok ? 'ok' : 'bad'}`}>
      {result.ok ? '✓ ' : '✕ '}
      {result.message}
      {result.latencyMs !== undefined && ` (${result.latencyMs} ms)`}
    </div>
  );
}

export function ProvidersPane({ settings, update }: PaneProps) {
  const { secrets, setSecret } = useSecrets();
  const [asrTest, setAsrTest] = useState<ProviderTestResult | null>(null);
  const [llmTest, setLlmTest] = useState<ProviderTestResult | null>(null);
  const [testing, setTesting] = useState<'asr' | 'llm' | null>(null);
  const asr = settings.asr;
  const llm = settings.llm;
  const asrInfo = ASR_INFO[asr.provider];
  const asrModel = asr.models[asr.provider] ?? '';

  const runTest = (kind: 'asr' | 'llm') => {
    setTesting(kind);
    const promise = kind === 'asr' ? api.testAsr() : api.testLlm();
    void promise.then((r) => {
      if (kind === 'asr') setAsrTest(r);
      else setLlmTest(r);
      setTesting(null);
    });
  };

  return (
    <>
      <h1>Providers</h1>
      <p className="lede">
        Two services do the work: a speech-to-text service turns audio into a rough transcript, and Claude turns that transcript into the text you
        meant. Keys are stored encrypted in your OS keychain and never leave this computer except to call the service you chose.
      </p>

      <Section title="Speech-to-text" description="Pick the service that hears you best. You can switch at any time; all keys are kept.">
        <Row label="Service">
          <Select
            value={asr.provider}
            options={(Object.keys(ASR_INFO) as AsrProvider[]).map((p) => ({ value: p, label: ASR_INFO[p].label }))}
            onChange={(v) => {
              setAsrTest(null);
              void update({ asr: { provider: v } });
            }}
          />
        </Row>
        <div className="note">{asrInfo.hint}</div>
        <Row label="Model">
          <DraftInput value={asrModel} list="asr-models" onCommit={(v) => void update({ asr: { models: { [asr.provider]: v } } })} />
          <datalist id="asr-models">
            {ASR_MODEL_OPTIONS[asr.provider].map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </Row>
        {asr.provider === 'custom' && (
          <Row label="Base URL" hint="Up to and including /v1. Example: http://localhost:8080/v1">
            <DraftInput value={asr.customBaseUrl} className="wide" onCommit={(v) => void update({ asr: { customBaseUrl: v } })} />
          </Row>
        )}
        <Row label="API key" hint={asrInfo.keyUrl ? 'Get one from the provider console.' : 'Optional for local servers.'}>
          <KeyField name={ASR_SECRET[asr.provider]} saved={secrets?.[ASR_SECRET[asr.provider]] ?? false} onSaved={(v) => setSecret(ASR_SECRET[asr.provider], v)} />
        </Row>
        {asrInfo.keyUrl && (
          <Row label="Console">
            <Button small kind="ghost" onClick={() => void api.openExternal(asrInfo.keyUrl as string)}>
              Open {asrInfo.label} console ↗
            </Button>
          </Row>
        )}
        <Row label="Timeout">
          <Slider value={asr.timeoutMs} min={5000} max={60000} step={1000} onChange={(v) => void update({ asr: { timeoutMs: v } })} format={(v) => `${v / 1000} s`} />
        </Row>
        <Row label="Connection test" hint="Sends one second of near-silence to verify the key and model." stacked>
          <Button onClick={() => runTest('asr')} disabled={testing !== null}>
            {testing === 'asr' ? 'Testing…' : 'Test speech-to-text'}
          </Button>
          <TestResult result={asrTest} />
        </Row>
      </Section>

      <Section
        title="Cleanup model"
        description="This is what makes dictation forgiving: fillers, self-corrections, punctuation, Norwegian spelling, numbers and per-app style. Claude Opus 5 at low effort is the default; Sonnet 5 and Haiku 4.5 are faster options."
      >
        <Row label="Service">
          <Select<LlmProvider>
            value={llm.provider}
            options={[
              { value: 'anthropic', label: 'Anthropic (Claude)' },
              { value: 'openai-compatible', label: 'OpenAI-compatible endpoint' },
              { value: 'none', label: 'None (offline rules only)' },
            ]}
            onChange={(v) => {
              setLlmTest(null);
              void update({ llm: { provider: v } });
            }}
          />
        </Row>
        {llm.provider === 'anthropic' && (
          <>
            <Row label="Model" hint="All three handle the cleanup well, so this is mostly a speed choice. Haiku 4.5 gets closest to instant; Opus 5 is the most careful with messy, long dictations.">
              <Select
                value={ANTHROPIC_MODEL_OPTIONS.some((m) => m.id === llm.models.anthropic) ? (llm.models.anthropic as string) : 'custom'}
                options={[...ANTHROPIC_MODEL_OPTIONS.map((m) => ({ value: m.id, label: m.label })), { value: 'custom', label: 'Custom model id…' }]}
                onChange={(v) => {
                  if (v !== 'custom') void update({ llm: { models: { anthropic: v } } });
                }}
              />
              {!ANTHROPIC_MODEL_OPTIONS.some((m) => m.id === llm.models.anthropic) && (
                <DraftInput value={llm.models.anthropic ?? ''} placeholder="claude-…" onCommit={(v) => void update({ llm: { models: { anthropic: v } } })} />
              )}
            </Row>
            <Row label="Effort" hint="Low is recommended for dictation: fastest, and plenty for cleanup. Raise it if long, messy dictations come out wrong.">
              <Select
                value={llm.effort}
                options={[
                  { value: 'low', label: 'Low (fastest)' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'high', label: 'High' },
                ]}
                onChange={(v) => void update({ llm: { effort: v } })}
              />
            </Row>
            <Row label="API key" hint="From console.anthropic.com. Refusal fallbacks are enabled, so a declined request is retried on Anthropic's recommended substitute model.">
              <KeyField name="anthropic" saved={secrets?.anthropic ?? false} onSaved={(v) => setSecret('anthropic', v)} />
            </Row>
            <Row label="Console">
              <Button small kind="ghost" onClick={() => void api.openExternal('https://console.anthropic.com/settings/keys')}>
                Open Anthropic console ↗
              </Button>
            </Row>
          </>
        )}
        {llm.provider === 'openai-compatible' && (
          <>
            <Row label="Base URL" hint="Up to and including /v1. Works with OpenAI, Mistral, Ollama (http://localhost:11434/v1), LM Studio…">
              <DraftInput value={llm.customBaseUrl} className="wide" onCommit={(v) => void update({ llm: { customBaseUrl: v } })} />
            </Row>
            <Row label="Model" hint="gpt-5.4-mini is a good fit for OpenAI; reasoning effort is set to low automatically for gpt-5 models.">
              <DraftInput value={llm.models['openai-compatible'] ?? ''} list="llm-models" onCommit={(v) => void update({ llm: { models: { 'openai-compatible': v } } })} />
              <datalist id="llm-models">
                {OPENAI_COMPAT_MODEL_OPTIONS.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </Row>
            <Row label="API key" hint="Leave empty for local servers.">
              <KeyField name="openaiCompatible" saved={secrets?.openaiCompatible ?? false} onSaved={(v) => setSecret('openaiCompatible', v)} />
            </Row>
          </>
        )}
        {llm.provider !== 'none' && (
          <>
            <Row label="Timeout" hint="If the model is slower than this, Flyt inserts the offline-cleaned transcript instead of waiting.">
              <Slider value={llm.timeoutMs} min={3000} max={40000} step={1000} onChange={(v) => void update({ llm: { timeoutMs: v } })} format={(v) => `${v / 1000} s`} />
            </Row>
            <Row label="Connection test" hint="Cleans a sample sentence with fillers and a self-correction." stacked>
              <Button onClick={() => runTest('llm')} disabled={testing !== null}>
                {testing === 'llm' ? 'Testing…' : 'Test cleanup model'}
              </Button>
              <TestResult result={llmTest} />
            </Row>
          </>
        )}
      </Section>
    </>
  );
}

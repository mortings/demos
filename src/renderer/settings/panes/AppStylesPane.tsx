import { DEFAULT_APP_STYLES } from '../../../shared/defaults';
import { newId } from '../../../shared/util';
import type { PaneProps } from '../App';
import { Button, DraftInput, Section, Select } from '../ui';

const STYLE_OPTIONS = [
  { value: 'standard', label: 'Standard' },
  { value: 'casual', label: 'Casual' },
  { value: 'formal', label: 'Formal' },
  { value: 'code', label: 'Code' },
] as const;

export function AppStylesPane({ settings, update }: PaneProps) {
  const rules = settings.appStyles;
  const commit = (next: typeof rules) => void update({ appStyles: next });

  return (
    <>
      <h1>App styles</h1>
      <p className="lede">
        Flyt notices which app you are dictating into and adapts: chat apps get a lighter touch, mail gets full sentences, terminals and editors get
        your words verbatim. Match on part of the app name or bundle id. The first matching rule wins.
      </p>
      <Section title="Rules" description="Extra instructions are passed to the cleanup model, e.g. “always end with a smiley” or “British spelling”.">
        <div className="list">
          {rules.map((rule, i) => (
            <div className="list-item appstyle" key={rule.id}>
              <DraftInput value={rule.appMatch} placeholder="App name contains…" onCommit={(v) => commit(rules.map((r, j) => (j === i ? { ...r, appMatch: v } : r)))} />
              <Select value={rule.style} options={[...STYLE_OPTIONS]} onChange={(v) => commit(rules.map((r, j) => (j === i ? { ...r, style: v } : r)))} />
              <DraftInput value={rule.instructions} placeholder="Extra instructions (optional)" onCommit={(v) => commit(rules.map((r, j) => (j === i ? { ...r, instructions: v } : r)))} />
              <Button small kind="ghost" onClick={() => commit(rules.filter((_, j) => j !== i))}>
                Remove
              </Button>
            </div>
          ))}
          <div className="list-footer">
            <span>
              {rules.length} rules ·{' '}
              <Button small kind="ghost" onClick={() => commit(DEFAULT_APP_STYLES)}>
                Restore defaults
              </Button>
            </span>
            <Button small onClick={() => commit([...rules, { id: newId(), appMatch: '', style: 'standard', instructions: '' }])}>
              Add rule
            </Button>
          </div>
        </div>
      </Section>
    </>
  );
}

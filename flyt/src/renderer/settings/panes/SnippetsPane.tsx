import { newId } from '../../../shared/util';
import type { PaneProps } from '../App';
import { Button, DraftInput, Section } from '../ui';

export function SnippetsPane({ settings, update }: PaneProps) {
  const snippets = settings.snippets;
  const commit = (next: typeof snippets) => void update({ snippets: next });

  return (
    <>
      <h1>Snippets</h1>
      <p className="lede">Say a short phrase, insert a longer text. Handy for e-mail addresses, sign-offs, meeting links and addresses.</p>
      <Section title="Snippets" description="Example: say “insert my signature” to get your full sign-off.">
        <div className="list">
          {snippets.length === 0 && <div className="empty">No snippets yet.</div>}
          {snippets.map((snippet, i) => (
            <div className="list-item snippet" key={snippet.id}>
              <DraftInput value={snippet.trigger} placeholder="Spoken phrase" onCommit={(v) => commit(snippets.map((s, j) => (j === i ? { ...s, trigger: v } : s)))} />
              <DraftInput value={snippet.expansion} placeholder="Text to insert" onCommit={(v) => commit(snippets.map((s, j) => (j === i ? { ...s, expansion: v } : s)))} />
              <Button small kind="ghost" onClick={() => commit(snippets.filter((_, j) => j !== i))}>
                Remove
              </Button>
            </div>
          ))}
          <div className="list-footer">
            <span>{snippets.length} snippets</span>
            <Button small onClick={() => commit([...snippets, { id: newId(), trigger: '', expansion: '' }])}>
              Add snippet
            </Button>
          </div>
        </div>
      </Section>
    </>
  );
}

import { newId } from '../../../shared/util';
import type { PaneProps } from '../App';
import { Button, DraftInput, Section } from '../ui';

export function VocabularyPane({ settings, update }: PaneProps) {
  const entries = settings.dictionary;
  const commit = (next: typeof entries) => void update({ dictionary: next });

  return (
    <>
      <h1>Vocabulary</h1>
      <p className="lede">
        Names, products and jargon the recogniser gets wrong. Flyt passes them to the speech service as hints and makes the cleanup pass use the
        exact spelling. Add the misheard versions under "sounds like" so they are always corrected.
      </p>
      <Section title="Words" description="Example: term “Bluestone PIM”, sounds like “blue stone pim, bluestone p i m”.">
        <div className="list">
          {entries.length === 0 && <div className="empty">No custom words yet.</div>}
          {entries.map((entry, i) => (
            <div className="list-item dictionary" key={entry.id}>
              <DraftInput value={entry.term} placeholder="Correct spelling" onCommit={(v) => commit(entries.map((e, j) => (j === i ? { ...e, term: v } : e)))} />
              <DraftInput
                value={entry.aliases.join(', ')}
                placeholder="Sounds like (comma separated, optional)"
                onCommit={(v) =>
                  commit(
                    entries.map((e, j) =>
                      j === i
                        ? {
                            ...e,
                            aliases: v
                              .split(',')
                              .map((a) => a.trim())
                              .filter(Boolean),
                          }
                        : e,
                    ),
                  )
                }
              />
              <Button small kind="ghost" onClick={() => commit(entries.filter((_, j) => j !== i))}>
                Remove
              </Button>
            </div>
          ))}
          <div className="list-footer">
            <span>{entries.length} words</span>
            <Button small onClick={() => commit([...entries, { id: newId(), term: '', aliases: [] }])}>
              Add word
            </Button>
          </div>
        </div>
      </Section>
    </>
  );
}

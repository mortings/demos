import { useEffect, useState } from 'react';
import type { DeepPartial, Settings } from '../../shared/types';
import { useSettings, useStatus } from './hooks';
import { AppStylesPane } from './panes/AppStylesPane';
import { DictationPane } from './panes/DictationPane';
import { GeneralPane } from './panes/GeneralPane';
import { HistoryPane } from './panes/HistoryPane';
import { HotkeysPane } from './panes/HotkeysPane';
import { ProvidersPane } from './panes/ProvidersPane';
import { SetupPane } from './panes/SetupPane';
import { SnippetsPane } from './panes/SnippetsPane';
import { VocabularyPane } from './panes/VocabularyPane';

export interface PaneProps {
  settings: Settings;
  update: (patch: DeepPartial<Settings>) => Promise<Settings>;
  navigate: (pane: PaneId) => void;
}

const PANES = [
  { id: 'setup', label: 'Setup', icon: '✓' },
  { id: 'general', label: 'General', icon: '⚙' },
  { id: 'hotkeys', label: 'Hotkeys', icon: '⌨' },
  { id: 'dictation', label: 'Dictation', icon: '◉' },
  { id: 'vocabulary', label: 'Vocabulary', icon: 'Aa' },
  { id: 'snippets', label: 'Snippets', icon: '¶' },
  { id: 'apps', label: 'App styles', icon: '▣' },
  { id: 'providers', label: 'Providers', icon: '☁' },
  { id: 'history', label: 'History', icon: '≡' },
] as const;

export type PaneId = (typeof PANES)[number]['id'];

function isPane(id: string): id is PaneId {
  return PANES.some((p) => p.id === id);
}

export function App() {
  const { settings, update, reset } = useSettings();
  const status = useStatus();
  const [pane, setPane] = useState<PaneId>(() => {
    const hash = window.location.hash.replace('#', '');
    return isPane(hash) ? hash : 'setup';
  });

  useEffect(
    () =>
      window.flytNavigate?.onNavigate((next) => {
        if (isPane(next)) setPane(next);
      }),
    [],
  );

  useEffect(() => {
    if (window.flyt.platform === 'darwin') document.documentElement.classList.add('mac');
  }, []);

  useEffect(() => {
    const theme = settings?.general.theme ?? 'system';
    if (theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
  }, [settings?.general.theme]);

  if (!settings) return <div className="app" />;

  const props: PaneProps = { settings, update, navigate: setPane };
  const hotkeyLabel = settings.hotkeys.pushToTalk.label;

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="brand">
          <span className="logo" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <rect x="5.5" y="1" width="5" height="8" rx="2.5" />
              <path d="M3.5 7.5a4.5 4.5 0 0 0 9 0" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 12v2.5M5.5 14.5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </span>
          Flyt
        </div>
        {PANES.map((p) => (
          <button key={p.id} type="button" className={`nav-item${pane === p.id ? ' active' : ''}`} onClick={() => setPane(p.id)}>
            <span className="nav-icon" aria-hidden="true">
              {p.icon}
            </span>
            {p.label}
          </button>
        ))}
        <div className="sidebar-footer">
          <div className="status-line">
            <span className={`status-dot${status?.recording ? ' recording' : status?.hotkeysActive ? '' : ' bad'}`} />
            {status?.recording ? 'Listening…' : status?.hotkeysActive ? `Hold ${hotkeyLabel}` : 'Hotkeys off'}
          </div>
          <div className="status-line">
            <span className={`status-dot${status?.asrConfigured ? '' : ' bad'}`} />
            {status?.asrConfigured ? 'Speech-to-text ready' : 'Add a speech key'}
          </div>
        </div>
      </nav>
      <main className="content">
        {pane === 'setup' && <SetupPane {...props} />}
        {pane === 'general' && <GeneralPane {...props} reset={reset} />}
        {pane === 'hotkeys' && <HotkeysPane {...props} />}
        {pane === 'dictation' && <DictationPane {...props} />}
        {pane === 'vocabulary' && <VocabularyPane {...props} />}
        {pane === 'snippets' && <SnippetsPane {...props} />}
        {pane === 'apps' && <AppStylesPane {...props} />}
        {pane === 'providers' && <ProvidersPane {...props} />}
        {pane === 'history' && <HistoryPane {...props} />}
      </main>
    </div>
  );
}

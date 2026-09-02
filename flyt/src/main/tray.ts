import { Menu, Tray, app } from 'electron';
import type { DictationMode } from '../shared/types';
import { trayIcon } from './icon';

export interface TrayState {
  recording: boolean;
  mode: DictationMode | null;
  paused: boolean;
  hotkeyLabel: string;
  hotkeysOk: boolean;
}

export interface TrayHandlers {
  openSettings(pane?: string): void;
  toggleHandsFree(): void;
  cancel(): void;
  togglePaused(): void;
}

export class TrayController {
  private tray: Tray;
  private idleIcon = trayIcon(false);
  private recordingIcon = trayIcon(true);
  private state: TrayState = { recording: false, mode: null, paused: false, hotkeyLabel: '', hotkeysOk: true };

  constructor(private readonly handlers: TrayHandlers) {
    this.tray = new Tray(this.idleIcon);
    this.tray.setToolTip('Flyt');
    this.render();
    if (process.platform !== 'darwin') {
      this.tray.on('double-click', () => this.handlers.openSettings());
    }
  }

  update(patch: Partial<TrayState>): void {
    this.state = { ...this.state, ...patch };
    this.render();
  }

  private render(): void {
    const s = this.state;
    this.tray.setImage(s.recording ? this.recordingIcon : this.idleIcon);
    const status = s.paused
      ? 'Hotkeys paused'
      : s.recording
        ? s.mode === 'handsFree'
          ? 'Listening (hands-free)…'
          : 'Listening…'
        : s.hotkeysOk
          ? `Hold ${s.hotkeyLabel} to dictate`
          : 'Hotkeys unavailable – check permissions';
    this.tray.setToolTip(`Flyt · ${status}`);
    const menu = Menu.buildFromTemplate([
      { label: status, enabled: false },
      { type: 'separator' },
      s.recording
        ? { label: 'Stop dictation', click: () => this.handlers.toggleHandsFree() }
        : { label: 'Start hands-free dictation', click: () => this.handlers.toggleHandsFree(), enabled: !s.paused },
      { label: 'Cancel dictation', click: () => this.handlers.cancel(), visible: s.recording },
      { type: 'separator' },
      { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: () => this.handlers.openSettings() },
      { label: 'Dictation history', click: () => this.handlers.openSettings('history') },
      { type: 'separator' },
      { label: s.paused ? 'Resume hotkeys' : 'Pause hotkeys', click: () => this.handlers.togglePaused() },
      { type: 'separator' },
      { label: `Flyt ${app.getVersion()}`, enabled: false },
      { label: 'Quit Flyt', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() },
    ]);
    this.tray.setContextMenu(menu);
  }
}

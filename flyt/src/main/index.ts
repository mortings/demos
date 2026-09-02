import path from 'node:path';
import { BrowserWindow, app, ipcMain, safeStorage, session, shell, systemPreferences } from 'electron';
import { Agent, setGlobalDispatcher } from 'undici';
import { DEFAULT_SETTINGS } from '../shared/defaults';
import {
  IPC,
  type AppStatus,
  type AudioDevice,
  type DeepPartial,
  type EngineMessage,
  type HistoryItem,
  type KeyCaptureEvent,
  type OverlayState,
  type PermissionKind,
  type SecretName,
  type Settings,
} from '../shared/types';
import { getActiveApp } from './active-app';
import { HistoryStore } from './history';
import { HotkeyManager } from './hotkeys';
import { appIcon } from './icon';
import { insertText } from './inserter';
import { getPermissionStatus, openPermissionSettings, reportAutomation, reportInputMonitoring, requestPermission } from './permissions';
import { createTranscriber, probeWav } from './pipeline/asr';
import { llmConfigured, testCleanup } from './pipeline/cleanup';
import { DictationController } from './pipeline/session';
import { SecretStore } from './secrets';
import { SettingsStore } from './settings-store';
import { TrayController } from './tray';
import { WindowManager } from './windows';

const log = (message: string, ...rest: unknown[]) => console.log(`[flyt] ${message}`, ...rest);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  void main();
}

async function main(): Promise<void> {
  app.setName('Flyt');
  // Keep HTTPS connections to the speech and cleanup APIs open between
  // dictations so each request skips DNS + TCP + TLS (a few hundred ms).
  setGlobalDispatcher(new Agent({ keepAliveTimeout: 90_000, keepAliveMaxTimeout: 600_000, connect: { timeout: 10_000 } }));
  await app.whenReady();

  const userData = app.getPath('userData');
  const settingsStore = new SettingsStore(path.join(userData, 'settings.json'));
  const secrets = new SecretStore(path.join(userData, 'secrets.json'), {
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    encrypt: (plain) => safeStorage.encryptString(plain),
    decrypt: (cipher) => safeStorage.decryptString(cipher),
  });
  const history = new HistoryStore(path.join(userData, 'history.json'), settingsStore.get().general.historyLimit);
  const settings = () => settingsStore.get();
  const secret = (name: SecretName) => secrets.get(name);

  // Renderer windows may use the microphone without a Chromium prompt.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'media'));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'media');

  const rendererDir = path.join(__dirname, '..', '..', 'renderer');
  const preloadPath = path.join(__dirname, '..', 'preload', 'index.js');
  const windows = new WindowManager(rendererDir, preloadPath, appIcon());
  windows.setOverlayPosition(settings().general.overlayPosition);

  let audioDevices: AudioDevice[] = [];
  let micOpen = false;
  let hotkeysPaused = false;
  let status: AppStatus = {
    devMode: !app.isPackaged,
    recording: false,
    mode: null,
    hotkeysActive: false,
    micOpen: false,
    asrConfigured: createTranscriber(settings(), secret) !== null,
    llmConfigured: llmConfigured(settings(), secret),
    lastError: null,
    lastLatencyMs: null,
  };
  const setStatus = (patch: Partial<AppStatus>) => {
    const wasRecording = status.recording;
    status = { ...status, ...patch };
    windows.broadcast(IPC.statusChanged, status);
    tray.update({ recording: status.recording, mode: status.mode });
    if (wasRecording && !status.recording && engineConfigPending) {
      engineConfigPending = false;
      configureEngine();
    }
  };
  let engineConfigPending = false;

  // --------------------------------------------------------------------- tray
  const tray = new TrayController({
    openSettings: (pane) => windows.openSettings(pane),
    toggleHandsFree: () => controller.toggleHandsFree(),
    cancel: () => controller.cancel(),
    togglePaused: () => {
      hotkeysPaused = !hotkeysPaused;
      tray.update({ paused: hotkeysPaused });
    },
  });

  const controller = new DictationController({
    settings,
    secret,
    insert: async (text) => {
      try {
        const method = await insertText(text, {
          restoreClipboard: settings().dictation.restoreClipboard,
          keyTap: () => hotkeys.pasteKeystroke(),
        });
        if (process.platform === 'darwin' && method === 'os') reportAutomation(true);
      } catch (err) {
        if (process.platform === 'darwin') reportAutomation(false);
        throw new Error(
          `Could not paste into the active app (${err instanceof Error ? err.message : String(err)}). Check the Accessibility permission in Settings → Setup.`,
        );
      }
    },
    getActiveApp,
    openMic: () => {
      if (!micOpen) windows.sendToEngine({ type: 'open' });
    },
    closeMic: () => windows.sendToEngine({ type: 'close' }),
    playSound: (name) => {
      if (settings().general.playSounds) windows.sendToEngine({ type: 'sound', name });
    },
    log,
  });

  controller.on('overlay', (state: OverlayState) => {
    if (settings().general.overlayEnabled || !state.visible) windows.updateOverlay(state);
  });
  controller.on('history', (item: HistoryItem) => history.add(item));
  controller.on('status', (patch: Partial<AppStatus>) => setStatus(patch));
  controller.on('open-settings', (pane: string) => windows.openSettings(pane));
  history.on('change', (items: HistoryItem[]) => windows.broadcast(IPC.historyChanged, items));

  // ------------------------------------------------------------------ hotkeys
  const hotkeys = new HotkeyManager();
  hotkeys.on('ptt-down', () => {
    if (!hotkeysPaused) controller.pttDown();
  });
  hotkeys.on('ptt-up', (heldMs: number) => {
    if (!hotkeysPaused) controller.pttUp(heldMs);
  });
  hotkeys.on('toggle', () => {
    if (!hotkeysPaused) controller.toggleHandsFree();
  });
  hotkeys.on('escape', () => {
    if (settings().hotkeys.cancelWithEscape && controller.active) controller.cancel();
  });
  hotkeys.on('capture', (event: KeyCaptureEvent) => windows.sendToSettings(IPC.keyCaptureEvent, event));
  hotkeys.on('error', (err: Error) => {
    log('hotkey hook failed', err.message);
    reportInputMonitoring(false);
    const who = app.isPackaged ? 'Flyt' : '"Electron" (Flyt running from source)';
    setStatus({
      hotkeysActive: false,
      lastError: `Global hotkeys unavailable. On macOS grant Accessibility and Input Monitoring to ${who}; Flyt retries automatically.`,
    });
  });

  const applyHotkeys = () => {
    const h = settings().hotkeys;
    hotkeys.setBindings(h.pushToTalk, h.handsFreeToggle);
    tray.update({ hotkeyLabel: h.pushToTalk.label });
  };

  applyHotkeys();
  const startHook = (): boolean => {
    const ok = hotkeys.start();
    reportInputMonitoring(ok);
    setStatus({ hotkeysActive: ok, ...(ok ? { lastError: null } : {}) });
    tray.update({ hotkeysOk: ok });
    return ok;
  };
  const accessibilityTrusted = () => process.platform !== 'darwin' || systemPreferences.isTrustedAccessibilityClient(false);
  if (!accessibilityTrusted()) {
    // Shows the system dialog that leads straight to the Accessibility pane.
    systemPreferences.isTrustedAccessibilityClient(true);
  }
  if (!startHook()) {
    // Keep trying: on macOS the hook can be created as soon as the user
    // grants Accessibility, no restart needed.
    let attempts = 0;
    const retry = setInterval(() => {
      if (hotkeys.isRunning) return clearInterval(retry);
      if (!accessibilityTrusted()) return;
      if (process.platform !== 'darwin' && ++attempts > 10) return clearInterval(retry);
      if (startHook()) {
        clearInterval(retry);
        log('hotkey hook started after permission was granted');
      }
    }, 3000);
  }

  // ------------------------------------------------------------------- engine
  const configureEngine = () => {
    if (controller.active) {
      // Never reconfigure the microphone in the middle of a dictation.
      engineConfigPending = true;
      return;
    }
    const a = settings().audio;
    windows.sendToEngine({ type: 'configure', deviceId: a.deviceId, warm: a.keepMicWarm });
  };
  windows.ensureEngine();
  windows.ensureOverlay();

  ipcMain.on(IPC.engineMessage, (_event, message: EngineMessage) => {
    switch (message.type) {
      case 'ready':
        configureEngine();
        windows.sendToEngine({ type: 'enumerate' });
        break;
      case 'opened':
        micOpen = true;
        setStatus({ micOpen: true });
        break;
      case 'closed':
        micOpen = false;
        setStatus({ micOpen: false });
        break;
      case 'devices':
        audioDevices = message.devices;
        windows.broadcast(IPC.audioDevices, audioDevices);
        break;
      case 'error':
        log('engine error', message.message);
        setStatus({ lastError: message.message });
        break;
    }
  });
  ipcMain.on(IPC.engineChunk, (_event, data: unknown) => {
    const pcm = toInt16(data);
    if (pcm) controller.pushAudio(pcm);
  });

  // --------------------------------------------------------------- app-level
  const applyGeneral = () => {
    const g = settings().general;
    if (process.platform === 'darwin') {
      if (g.showInDock) app.dock?.show();
      else app.dock?.hide();
    }
    // Login items need a real app bundle; skip when running from source.
    if (process.platform !== 'linux' && app.isPackaged) {
      try {
        if (app.getLoginItemSettings().openAtLogin !== g.launchAtLogin) {
          app.setLoginItemSettings({ openAtLogin: g.launchAtLogin });
        }
      } catch (err) {
        log('login item failed', err);
      }
    }
    windows.setOverlayPosition(g.overlayPosition);
    history.setLimit(g.historyLimit);
  };
  applyGeneral();

  settingsStore.on('change', (next: Settings) => {
    applyGeneral();
    applyHotkeys();
    configureEngine();
    controller.applySettings();
    setStatus({ asrConfigured: createTranscriber(next, secret) !== null, llmConfigured: llmConfigured(next, secret) });
    windows.broadcast(IPC.settingsChanged, next);
  });

  // ---------------------------------------------------------------------- IPC
  ipcMain.handle(IPC.appVersion, () => app.getVersion());
  ipcMain.handle(IPC.settingsGet, () => settings());
  ipcMain.handle(IPC.settingsUpdate, (_e, patch: DeepPartial<Settings>) => settingsStore.update(patch));
  ipcMain.handle(IPC.settingsReset, () => settingsStore.reset());
  ipcMain.handle(IPC.secretSet, (_e, name: SecretName, value: string) => {
    const result = secrets.set(name, value);
    setStatus({ asrConfigured: createTranscriber(settings(), secret) !== null, llmConfigured: llmConfigured(settings(), secret) });
    return result;
  });
  ipcMain.handle(IPC.secretStatus, () => secrets.status());
  ipcMain.handle(IPC.providerTestAsr, async () => {
    const transcriber = createTranscriber(settings(), secret);
    if (!transcriber) return { ok: false, message: 'No API key configured for the selected speech-to-text provider.' };
    const started = Date.now();
    try {
      const result = await transcriber.transcribe({ wav: probeWav(), languageMode: 'en' });
      return { ok: true, message: `${transcriber.name} responded (${result.text ? `"${result.text}"` : 'empty transcript for a silent probe, which is expected'}).`, latencyMs: Date.now() - started };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : String(err), latencyMs: Date.now() - started };
    }
  });
  ipcMain.handle(IPC.providerTestLlm, () => testCleanup(settings(), secret));
  ipcMain.handle(IPC.permissionsGet, () => getPermissionStatus());
  ipcMain.handle(IPC.permissionsRequest, (_e, kind: PermissionKind) => requestPermission(kind));
  ipcMain.handle(IPC.permissionsOpen, (_e, kind: PermissionKind) => openPermissionSettings(kind));
  ipcMain.handle(IPC.historyList, () => history.list());
  ipcMain.handle(IPC.historyClear, () => history.clear());
  ipcMain.handle(IPC.historyDelete, (_e, id: string) => history.delete(id));
  ipcMain.handle(IPC.keyCaptureStart, () => hotkeys.startCapture());
  ipcMain.handle(IPC.keyCaptureStop, () => hotkeys.stopCapture());
  ipcMain.handle(IPC.activeApp, () => getActiveApp());
  ipcMain.handle(IPC.audioDevices, () => {
    windows.sendToEngine({ type: 'enumerate' });
    return audioDevices;
  });
  ipcMain.handle(IPC.statusGet, () => status);
  ipcMain.handle(IPC.dictationToggle, () => controller.toggleHandsFree());
  ipcMain.handle(IPC.dictationCancel, () => controller.cancel());
  ipcMain.handle(IPC.openExternal, (_e, url: string) => {
    if (/^https?:\/\//.test(url)) return shell.openExternal(url);
    return Promise.resolve();
  });
  ipcMain.handle(IPC.windowClose, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });

  // ---------------------------------------------------------------- startup
  const firstRun = !status.asrConfigured;
  if (firstRun) windows.openSettings('setup');

  app.on('second-instance', () => windows.openSettings());
  app.on('activate', () => windows.openSettings());
  app.on('window-all-closed', () => {
    /* menubar app: keep running */
  });
  app.on('before-quit', () => {
    hotkeys.stop();
    windows.destroyAll();
  });

  log(`ready · settings in ${userData} · defaults v${DEFAULT_SETTINGS.version}`);
}

function toInt16(data: unknown): Int16Array | null {
  if (data instanceof ArrayBuffer) return new Int16Array(data);
  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView;
    return new Int16Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength - (view.byteLength % 2)));
  }
  return null;
}

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC, type FlytApi, type Platform } from '../shared/types';

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.off(channel, handler);
}

const api: FlytApi = {
  platform: process.platform as Platform,
  getVersion: () => ipcRenderer.invoke(IPC.appVersion),
  getSettings: () => ipcRenderer.invoke(IPC.settingsGet),
  updateSettings: (patch) => ipcRenderer.invoke(IPC.settingsUpdate, patch),
  resetSettings: () => ipcRenderer.invoke(IPC.settingsReset),
  onSettingsChanged: (cb) => subscribe(IPC.settingsChanged, cb),
  setSecret: (name, value) => ipcRenderer.invoke(IPC.secretSet, name, value),
  getSecretStatus: () => ipcRenderer.invoke(IPC.secretStatus),
  testAsr: () => ipcRenderer.invoke(IPC.providerTestAsr),
  testLlm: () => ipcRenderer.invoke(IPC.providerTestLlm),
  getPermissions: () => ipcRenderer.invoke(IPC.permissionsGet),
  requestPermission: (kind) => ipcRenderer.invoke(IPC.permissionsRequest, kind),
  openPermissionSettings: (kind) => ipcRenderer.invoke(IPC.permissionsOpen, kind),
  getHistory: () => ipcRenderer.invoke(IPC.historyList),
  clearHistory: () => ipcRenderer.invoke(IPC.historyClear),
  deleteHistoryItem: (id) => ipcRenderer.invoke(IPC.historyDelete, id),
  onHistoryChanged: (cb) => subscribe(IPC.historyChanged, cb),
  startKeyCapture: () => ipcRenderer.invoke(IPC.keyCaptureStart),
  stopKeyCapture: () => ipcRenderer.invoke(IPC.keyCaptureStop),
  onKeyCapture: (cb) => subscribe(IPC.keyCaptureEvent, cb),
  getActiveApp: () => ipcRenderer.invoke(IPC.activeApp),
  getAudioDevices: () => ipcRenderer.invoke(IPC.audioDevices),
  onAudioDevices: (cb) => subscribe(IPC.audioDevices, cb),
  getStatus: () => ipcRenderer.invoke(IPC.statusGet),
  onStatus: (cb) => subscribe(IPC.statusChanged, cb),
  toggleDictation: () => ipcRenderer.invoke(IPC.dictationToggle),
  cancelDictation: () => ipcRenderer.invoke(IPC.dictationCancel),
  openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url),
  closeWindow: () => ipcRenderer.invoke(IPC.windowClose),
  onOverlayState: (cb) => subscribe(IPC.overlayState, cb),
  engine: {
    send: (message) => ipcRenderer.send(IPC.engineMessage, message),
    sendChunk: (pcm) => ipcRenderer.send(IPC.engineChunk, pcm),
    onCommand: (cb) => subscribe(IPC.engineCommand, cb),
  },
};

contextBridge.exposeInMainWorld('flyt', api);
contextBridge.exposeInMainWorld('flytNavigate', {
  onNavigate: (cb: (pane: string) => void) => subscribe<string>('settings:navigate', cb),
});

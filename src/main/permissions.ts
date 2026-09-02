import { execFile } from 'node:child_process';
import { shell, systemPreferences } from 'electron';
import type { PermissionKind, PermissionState, PermissionStatus } from '../shared/types';

const MAC = process.platform === 'darwin';

/** Filled in by the hotkey manager: did the input hook start successfully? */
let inputMonitoringState: PermissionState = 'unknown';
let automationState: PermissionState = 'unknown';

export function reportInputMonitoring(ok: boolean): void {
  inputMonitoringState = ok ? 'granted' : 'denied';
}

export function reportAutomation(ok: boolean): void {
  automationState = ok ? 'granted' : 'denied';
}

export function getPermissionStatus(): PermissionStatus {
  const microphone: PermissionState =
    MAC || process.platform === 'win32' ? (systemPreferences.getMediaAccessStatus('microphone') as PermissionState) : 'not-applicable';
  return {
    microphone,
    accessibility: MAC ? (systemPreferences.isTrustedAccessibilityClient(false) ? 'granted' : 'denied') : 'not-applicable',
    inputMonitoring: MAC ? inputMonitoringState : 'not-applicable',
    automation: MAC ? automationState : 'not-applicable',
  };
}

export async function requestPermission(kind: PermissionKind): Promise<PermissionStatus> {
  switch (kind) {
    case 'microphone':
      if (MAC || process.platform === 'win32') await systemPreferences.askForMediaAccess('microphone');
      break;
    case 'accessibility':
      if (MAC) systemPreferences.isTrustedAccessibilityClient(true);
      break;
    case 'automation':
      if (MAC) {
        await new Promise<void>((resolve) => {
          execFile('osascript', ['-e', 'tell application "System Events" to return name'], { timeout: 15000 }, (err) => {
            reportAutomation(!err);
            resolve();
          });
        });
      }
      break;
    case 'inputMonitoring':
      await openPermissionSettings(kind);
      break;
  }
  return getPermissionStatus();
}

const MAC_PANES: Record<PermissionKind, string> = {
  microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
  accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
  inputMonitoring: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent',
  automation: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Automation',
};

export async function openPermissionSettings(kind: PermissionKind): Promise<void> {
  if (MAC) {
    await shell.openExternal(MAC_PANES[kind]);
  } else if (process.platform === 'win32' && kind === 'microphone') {
    await shell.openExternal('ms-settings:privacy-microphone');
  }
}

import { useCallback, useEffect, useState } from 'react';
import type { AppStatus, AudioDevice, DeepPartial, HistoryItem, PermissionStatus, SecretName, SecretStatus, Settings } from '../../shared/types';

const api = window.flyt;

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    void api.getSettings().then(setSettings);
    return api.onSettingsChanged(setSettings);
  }, []);
  const update = useCallback(async (patch: DeepPartial<Settings>) => {
    const next = await api.updateSettings(patch);
    setSettings(next);
    return next;
  }, []);
  const reset = useCallback(async () => setSettings(await api.resetSettings()), []);
  return { settings, update, reset };
}

export function useStatus(): AppStatus | null {
  const [status, setStatus] = useState<AppStatus | null>(null);
  useEffect(() => {
    void api.getStatus().then(setStatus);
    return api.onStatus(setStatus);
  }, []);
  return status;
}

export function useSecrets() {
  const [status, setStatus] = useState<SecretStatus | null>(null);
  useEffect(() => {
    void api.getSecretStatus().then(setStatus);
  }, []);
  const setSecret = useCallback(async (name: SecretName, value: string) => {
    setStatus(await api.setSecret(name, value));
  }, []);
  return { secrets: status, setSecret };
}

export function usePermissions() {
  const [status, setStatus] = useState<PermissionStatus | null>(null);
  const refresh = useCallback(() => api.getPermissions().then(setStatus), []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 2500);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);
  return { permissions: status, refresh };
}

export function useHistory() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  useEffect(() => {
    void api.getHistory().then(setItems);
    return api.onHistoryChanged(setItems);
  }, []);
  return items;
}

export function useAudioDevices(): AudioDevice[] {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  useEffect(() => {
    void api.getAudioDevices().then(setDevices);
    return api.onAudioDevices(setDevices);
  }, []);
  return devices;
}

/** Local draft of a value that is committed explicitly (on blur / enter). */
export function useDraft<T>(value: T): [T, (v: T) => void] {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return [draft, setDraft];
}

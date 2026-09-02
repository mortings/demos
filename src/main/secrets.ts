import fs from 'node:fs';
import { SECRET_NAMES, type SecretName, type SecretStatus } from '../shared/types';
import { writeJsonAtomic } from './settings-store';

export interface SecretCipher {
  isAvailable(): boolean;
  encrypt(plain: string): Buffer;
  decrypt(cipher: Buffer): string;
}

/**
 * API keys, encrypted at rest with Electron's safeStorage (Keychain on macOS,
 * DPAPI on Windows, libsecret on Linux). Falls back to obfuscated storage when
 * no OS keystore is available, and says so.
 */
export class SecretStore {
  private values: Partial<Record<SecretName, string>> = {};

  constructor(
    private readonly filePath: string,
    private readonly cipher: SecretCipher,
  ) {
    this.load();
  }

  get(name: SecretName): string | null {
    return this.values[name] ?? null;
  }

  set(name: SecretName, value: string): SecretStatus {
    const trimmed = value.trim();
    if (trimmed) this.values[name] = trimmed;
    else delete this.values[name];
    this.save();
    return this.status();
  }

  status(): SecretStatus {
    const out = {} as SecretStatus;
    for (const name of SECRET_NAMES) out[name] = Boolean(this.values[name]);
    return out;
  }

  get encrypted(): boolean {
    return this.cipher.isAvailable();
  }

  private load(): void {
    if (!fs.existsSync(this.filePath)) return;
    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as Record<string, string>;
      for (const name of SECRET_NAMES) {
        const stored = raw[name];
        if (!stored) continue;
        if (stored.startsWith('plain:')) {
          this.values[name] = Buffer.from(stored.slice(6), 'base64').toString('utf8');
        } else if (this.cipher.isAvailable()) {
          this.values[name] = this.cipher.decrypt(Buffer.from(stored, 'base64'));
        }
      }
    } catch (err) {
      console.warn('[secrets] could not read secrets file', err);
    }
  }

  private save(): void {
    const out: Record<string, string> = {};
    for (const name of SECRET_NAMES) {
      const value = this.values[name];
      if (!value) continue;
      out[name] = this.cipher.isAvailable()
        ? this.cipher.encrypt(value).toString('base64')
        : `plain:${Buffer.from(value, 'utf8').toString('base64')}`;
    }
    writeJsonAtomic(this.filePath, out);
  }
}

import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_SETTINGS } from '../shared/defaults';
import { SettingsSchema, type DeepPartial, type Settings } from '../shared/types';
import { deepMerge } from '../shared/util';

/** JSON settings file with schema validation and atomic writes. */
export class SettingsStore extends EventEmitter {
  private settings: Settings;

  constructor(private readonly filePath: string) {
    super();
    this.settings = this.load();
  }

  get(): Settings {
    return this.settings;
  }

  update(patch: DeepPartial<Settings>): Settings {
    const merged = deepMerge<Settings>(this.settings, patch);
    const parsed = SettingsSchema.safeParse(merged);
    if (!parsed.success) {
      throw new Error(`Invalid settings: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
    }
    this.settings = parsed.data;
    this.save();
    this.emit('change', this.settings);
    return this.settings;
  }

  reset(): Settings {
    this.settings = structuredClone(DEFAULT_SETTINGS);
    this.save();
    this.emit('change', this.settings);
    return this.settings;
  }

  private load(): Settings {
    let stored: unknown = {};
    try {
      if (fs.existsSync(this.filePath)) stored = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    } catch (err) {
      console.warn('[settings] could not read settings file, using defaults', err);
      this.backupCorrupt();
    }
    const merged = deepMerge<Settings>(structuredClone(DEFAULT_SETTINGS), stored);
    const parsed = SettingsSchema.safeParse(merged);
    if (parsed.success) return parsed.data;
    console.warn('[settings] stored settings failed validation, repairing section by section', parsed.error.issues);
    // Repair: keep every top-level section that validates on its own.
    const repaired = structuredClone(DEFAULT_SETTINGS) as Record<string, unknown>;
    const mergedRecord = merged as unknown as Record<string, unknown>;
    for (const key of Object.keys(repaired)) {
      const candidate = { ...repaired, [key]: mergedRecord[key] };
      if (SettingsSchema.safeParse(candidate).success) repaired[key] = mergedRecord[key];
    }
    return SettingsSchema.parse(repaired);
  }

  private backupCorrupt(): void {
    try {
      if (fs.existsSync(this.filePath)) fs.copyFileSync(this.filePath, `${this.filePath}.corrupt-${Date.now()}`);
    } catch {
      /* ignore */
    }
  }

  private save(): void {
    writeJsonAtomic(this.filePath, this.settings);
  }
}

export function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

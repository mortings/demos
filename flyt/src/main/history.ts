import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import type { HistoryItem } from '../shared/types';
import { writeJsonAtomic } from './settings-store';

export class HistoryStore extends EventEmitter {
  private items: HistoryItem[] = [];

  constructor(
    private readonly filePath: string,
    private limit: number,
  ) {
    super();
    try {
      if (fs.existsSync(filePath)) this.items = JSON.parse(fs.readFileSync(filePath, 'utf8')) as HistoryItem[];
    } catch (err) {
      console.warn('[history] could not read history', err);
    }
  }

  list(): HistoryItem[] {
    return this.items;
  }

  setLimit(limit: number): void {
    this.limit = limit;
    this.trim();
  }

  add(item: HistoryItem): void {
    this.items.unshift(item);
    this.trim();
    this.save();
  }

  delete(id: string): void {
    this.items = this.items.filter((i) => i.id !== id);
    this.save();
  }

  clear(): void {
    this.items = [];
    this.save();
  }

  private trim(): void {
    if (this.items.length > this.limit) this.items = this.items.slice(0, this.limit);
  }

  private save(): void {
    writeJsonAtomic(this.filePath, this.items);
    this.emit('change', this.items);
  }
}

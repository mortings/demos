import { EventEmitter } from 'node:events';
import { UiohookKey, uIOhook, type UiohookKeyboardEvent } from 'uiohook-napi';
import type { KeyBinding, KeyCaptureEvent } from '../shared/types';

const MAC = process.platform === 'darwin';

/**
 * Global hotkeys with real key-down / key-up semantics (Electron's own
 * globalShortcut only fires on press, which is useless for push-to-talk).
 *
 * Events:
 *  - 'ptt-down'            the push-to-talk binding became fully pressed
 *  - 'ptt-up'  (heldMs)    it was released
 *  - 'toggle'              the dedicated hands-free binding was pressed
 *  - 'escape'              Escape was pressed
 *  - 'capture' (KeyCaptureEvent) while capturing a new binding
 *  - 'error'   (Error)     the hook could not be started (permissions)
 */
export class HotkeyManager extends EventEmitter {
  private pressed = new Set<number>();
  private pttBinding: KeyBinding | null = null;
  private toggleBinding: KeyBinding | null = null;
  private pttActive = false;
  private pttDownAt = 0;
  private toggleActive = false;
  private capturing = false;
  private captured = new Set<number>();
  private running = false;
  /** Ignore our own synthetic paste keystroke until this time. */
  private suppressUntil = 0;
  private static readonly SYNTHETIC_KEYS = new Set<number>([UiohookKey.V, UiohookKey.Meta, UiohookKey.Ctrl]);

  setBindings(ptt: KeyBinding, toggle: KeyBinding | null): void {
    this.pttBinding = ptt;
    this.toggleBinding = toggle;
  }

  start(): boolean {
    if (this.running) return true;
    try {
      uIOhook.on('keydown', this.onKeyDown);
      uIOhook.on('keyup', this.onKeyUp);
      uIOhook.start();
      this.running = true;
      return true;
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
      return false;
    }
  }

  stop(): void {
    if (!this.running) return;
    try {
      uIOhook.off('keydown', this.onKeyDown);
      uIOhook.off('keyup', this.onKeyUp);
      uIOhook.stop();
    } catch {
      /* ignore */
    }
    this.running = false;
    this.pressed.clear();
    this.pttActive = false;
    this.toggleActive = false;
  }

  get isRunning(): boolean {
    return this.running;
  }

  /**
   * Post a paste keystroke (⌘V on macOS, Ctrl+V elsewhere) through the same
   * input hook. Needs only the Accessibility permission we already have for
   * listening, so no AppleScript / Automation prompt is involved.
   */
  pasteKeystroke(): boolean {
    if (!this.running) return false;
    try {
      this.suppressUntil = Date.now() + 250;
      uIOhook.keyTap(UiohookKey.V, [MAC ? UiohookKey.Meta : UiohookKey.Ctrl]);
      return true;
    } catch (err) {
      console.warn('[hotkeys] synthetic paste failed', err);
      return false;
    }
  }

  private isSynthetic(e: UiohookKeyboardEvent): boolean {
    return Date.now() < this.suppressUntil && HotkeyManager.SYNTHETIC_KEYS.has(e.keycode);
  }

  startCapture(): void {
    this.capturing = true;
    this.captured.clear();
  }

  stopCapture(): void {
    this.capturing = false;
    this.captured.clear();
  }

  private onKeyDown = (e: UiohookKeyboardEvent): void => {
    if (this.isSynthetic(e)) return;
    this.pressed.add(e.keycode);
    if (this.capturing) {
      this.captured.add(e.keycode);
      this.emitCapture(false);
      return;
    }
    if (e.keycode === UiohookKey.Escape) this.emit('escape');

    if (this.pttBinding && !this.pttActive && this.isSatisfied(this.pttBinding)) {
      this.pttActive = true;
      this.pttDownAt = Date.now();
      this.emit('ptt-down');
    }
    if (this.toggleBinding && !this.toggleActive && this.isSatisfied(this.toggleBinding)) {
      this.toggleActive = true;
      this.emit('toggle');
    }
  };

  private onKeyUp = (e: UiohookKeyboardEvent): void => {
    if (this.isSynthetic(e)) return;
    this.pressed.delete(e.keycode);
    if (this.capturing) {
      if (this.captured.size > 0 && [...this.captured].every((k) => !this.pressed.has(k))) {
        this.emitCapture(true);
        this.captured.clear();
      }
      return;
    }
    if (this.pttActive && this.pttBinding && !this.isSatisfied(this.pttBinding)) {
      this.pttActive = false;
      this.emit('ptt-up', Date.now() - this.pttDownAt);
    }
    if (this.toggleActive && this.toggleBinding && !this.isSatisfied(this.toggleBinding)) {
      this.toggleActive = false;
    }
  };

  private isSatisfied(binding: KeyBinding): boolean {
    return binding.keycodes.every((k) => this.pressed.has(k));
  }

  private emitCapture(complete: boolean): void {
    const keycodes = [...this.captured];
    const event: KeyCaptureEvent = { keycodes, label: describeBinding(keycodes), complete };
    this.emit('capture', event);
  }
}

const SPECIAL_LABELS: Record<number, string> = {
  [UiohookKey.Alt]: MAC ? '⌥' : 'Alt',
  [UiohookKey.AltRight]: MAC ? 'Right ⌥' : 'Right Alt',
  [UiohookKey.Ctrl]: MAC ? '⌃' : 'Ctrl',
  [UiohookKey.CtrlRight]: MAC ? 'Right ⌃' : 'Right Ctrl',
  [UiohookKey.Shift]: MAC ? '⇧' : 'Shift',
  [UiohookKey.ShiftRight]: MAC ? 'Right ⇧' : 'Right Shift',
  [UiohookKey.Meta]: MAC ? '⌘' : 'Win',
  [UiohookKey.MetaRight]: MAC ? 'Right ⌘' : 'Right Win',
  [UiohookKey.Space]: 'Space',
  [UiohookKey.Escape]: 'Esc',
  [UiohookKey.Enter]: MAC ? '↩' : 'Enter',
  [UiohookKey.Tab]: MAC ? '⇥' : 'Tab',
  [UiohookKey.Backspace]: MAC ? '⌫' : 'Backspace',
  [UiohookKey.CapsLock]: 'Caps Lock',
  [UiohookKey.ArrowUp]: '↑',
  [UiohookKey.ArrowDown]: '↓',
  [UiohookKey.ArrowLeft]: '←',
  [UiohookKey.ArrowRight]: '→',
  [UiohookKey.Backquote]: '`',
  [UiohookKey.Minus]: '-',
  [UiohookKey.Equal]: '=',
  [UiohookKey.BracketLeft]: '[',
  [UiohookKey.BracketRight]: ']',
  [UiohookKey.Backslash]: '\\',
  [UiohookKey.Semicolon]: ';',
  [UiohookKey.Quote]: "'",
  [UiohookKey.Comma]: ',',
  [UiohookKey.Period]: '.',
  [UiohookKey.Slash]: '/',
};

const NAME_BY_CODE: Record<number, string> = (() => {
  const out: Record<number, string> = {};
  for (const [name, code] of Object.entries(UiohookKey)) {
    if (typeof code === 'number' && !(code in out)) out[code] = name;
  }
  return out;
})();

export function keyLabel(code: number): string {
  return SPECIAL_LABELS[code] ?? NAME_BY_CODE[code] ?? `Key ${code}`;
}

const MODIFIERS = new Set<number>([
  UiohookKey.Alt,
  UiohookKey.AltRight,
  UiohookKey.Ctrl,
  UiohookKey.CtrlRight,
  UiohookKey.Shift,
  UiohookKey.ShiftRight,
  UiohookKey.Meta,
  UiohookKey.MetaRight,
]);

/** Modifiers first, then the rest, joined the way a menu would show them. */
export function describeBinding(keycodes: number[]): string {
  const sorted = [...keycodes].sort((a, b) => Number(MODIFIERS.has(b)) - Number(MODIFIERS.has(a)));
  return sorted.map(keyLabel).join(MAC ? ' ' : '+');
}

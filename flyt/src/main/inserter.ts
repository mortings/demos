import { execFile } from 'node:child_process';
import { ClipboardItem, clipboard } from 'electron';
import { sleep } from '../shared/util';

function run(cmd: string, args: string[], timeoutMs = 4000): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeoutMs, windowsHide: true }, (err, _stdout, stderr) => {
      if (err) reject(new Error(`${cmd} failed: ${String(stderr || err.message).trim()}`));
      else resolve();
    });
  });
}

/**
 * Copy of the current clipboard, rebuilt as ClipboardItems so every format
 * (text, HTML, RTF, images, bookmarks) can be written back afterwards.
 */
async function snapshotClipboard(): Promise<ClipboardItem[] | null> {
  try {
    const items = await clipboard.read();
    const rebuilt: ClipboardItem[] = [];
    for (const item of items) {
      const record: Record<string, Blob | string | Electron.ClipboardBookmark> = {};
      for (const type of item.types) {
        try {
          record[type] = await item.getType(type);
        } catch {
          /* skip formats we cannot read back */
        }
      }
      if (Object.keys(record).length > 0) rebuilt.push(new ClipboardItem(record));
    }
    return rebuilt;
  } catch (err) {
    console.warn('[inserter] could not snapshot clipboard', err);
    return null;
  }
}

async function restoreClipboard(snapshot: ClipboardItem[]): Promise<void> {
  if (snapshot.length === 0) {
    clipboard.clear();
    return;
  }
  await clipboard.write(snapshot);
}

async function sendPasteKeystroke(): Promise<void> {
  switch (process.platform) {
    case 'darwin':
      await run('osascript', ['-e', 'tell application "System Events" to keystroke "v" using command down']);
      return;
    case 'win32':
      await run('powershell', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("^v")',
      ]);
      return;
    default:
      try {
        await run('xdotool', ['key', '--clearmodifiers', 'ctrl+v']);
      } catch {
        await run('wtype', ['-M', 'ctrl', 'v', '-m', 'ctrl']);
      }
  }
}

export interface InsertOptions {
  restoreClipboard: boolean;
}

/**
 * Insert text at the cursor of the frontmost app by pasting through the
 * clipboard, then put the previous clipboard contents back. Pasting is the
 * only approach that is fast, handles every Unicode character and works in
 * every app, which is also what the commercial dictation tools do.
 */
export async function insertText(text: string, opts: InsertOptions): Promise<void> {
  if (!text) return;
  const snapshot = opts.restoreClipboard ? await snapshotClipboard() : null;
  await clipboard.writeText(text);
  // Give the pasteboard a moment to settle before the keystroke.
  await sleep(40);
  try {
    await sendPasteKeystroke();
  } finally {
    if (snapshot) {
      // Restore after the target app has read the pasteboard.
      setTimeout(() => {
        void (async () => {
          try {
            if ((await clipboard.readText()) === text) await restoreClipboard(snapshot);
          } catch (err) {
            console.warn('[inserter] clipboard restore failed', err);
          }
        })();
      }, 350);
    }
  }
}

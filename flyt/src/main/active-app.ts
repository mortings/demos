import { execFile } from 'node:child_process';
import type { ActiveApp } from '../shared/types';

function run(cmd: string, args: string[], timeoutMs = 1500): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: timeoutMs, windowsHide: true }, (err, stdout) => {
      if (err) reject(err);
      else resolve(String(stdout));
    });
  });
}

async function macActiveApp(): Promise<ActiveApp | null> {
  // lsappinfo needs no privacy permission, unlike System Events.
  try {
    const front = (await run('lsappinfo', ['front'])).trim();
    if (front) {
      const info = await run('lsappinfo', ['info', '-only', 'name', '-only', 'bundleid', front]);
      const name = /"LSDisplayName"="([^"]*)"/.exec(info)?.[1] ?? /LSDisplayName=([^\n]*)/.exec(info)?.[1]?.trim();
      const bundleId = /"CFBundleIdentifier"="([^"]*)"/.exec(info)?.[1] ?? /CFBundleIdentifier=([^\n]*)/.exec(info)?.[1]?.trim();
      if (name) return { name, bundleId: bundleId ?? null };
    }
  } catch {
    /* fall through */
  }
  try {
    const script =
      'tell application "System Events" to set p to first application process whose frontmost is true\n' +
      'tell application "System Events" to return (name of p) & "\\n" & (bundle identifier of p)';
    const out = await run('osascript', ['-e', script]);
    const [name, bundleId] = out.split('\n').map((s) => s.trim());
    if (name) return { name, bundleId: bundleId || null };
  } catch {
    /* ignore */
  }
  return null;
}

async function windowsActiveApp(): Promise<ActiveApp | null> {
  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class FlytWin {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
}
"@
$h = [FlytWin]::GetForegroundWindow(); $pid = 0; [FlytWin]::GetWindowThreadProcessId($h, [ref]$pid) | Out-Null
$p = Get-Process -Id $pid -ErrorAction SilentlyContinue
if ($p) { Write-Output ($p.MainWindowTitle + "|" + $p.ProcessName) }`;
  try {
    const out = await run('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], 4000);
    const [title, processName] = out.trim().split('|');
    if (processName) return { name: processName.trim(), bundleId: title?.trim() || null };
  } catch {
    /* ignore */
  }
  return null;
}

async function linuxActiveApp(): Promise<ActiveApp | null> {
  try {
    const cls = (await run('xdotool', ['getactivewindow', 'getwindowclassname'])).trim();
    const title = (await run('xdotool', ['getactivewindow', 'getwindowname'])).trim();
    if (cls) return { name: cls, bundleId: title || null };
  } catch {
    /* Wayland or no xdotool */
  }
  return null;
}

export async function getActiveApp(): Promise<ActiveApp | null> {
  switch (process.platform) {
    case 'darwin':
      return macActiveApp();
    case 'win32':
      return windowsActiveApp();
    default:
      return linuxActiveApp();
  }
}

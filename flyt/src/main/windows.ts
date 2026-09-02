import path from 'node:path';
import { BrowserWindow, screen, type NativeImage } from 'electron';
import type { EngineCommand, OverlayPosition, OverlayState } from '../shared/types';
import { IPC } from '../shared/types';

const OVERLAY_WIDTH = 380;
const OVERLAY_HEIGHT = 96;

export class WindowManager {
  private overlay: BrowserWindow | null = null;
  private settings: BrowserWindow | null = null;
  private engine: BrowserWindow | null = null;
  private overlayPosition: OverlayPosition = 'bottom';

  constructor(
    private readonly rendererDir: string,
    private readonly preloadPath: string,
    private readonly icon: NativeImage,
  ) {}

  private page(name: string): string {
    return path.join(this.rendererDir, name, 'index.html');
  }

  // ---------------------------------------------------------------- engine

  ensureEngine(): BrowserWindow {
    if (this.engine && !this.engine.isDestroyed()) return this.engine;
    this.engine = new BrowserWindow({
      show: false,
      width: 320,
      height: 200,
      skipTaskbar: true,
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false,
      },
    });
    void this.engine.loadFile(this.page('engine'));
    this.engine.on('closed', () => {
      this.engine = null;
    });
    return this.engine;
  }

  sendToEngine(command: EngineCommand): void {
    const win = this.ensureEngine();
    if (win.webContents.isLoading()) {
      win.webContents.once('did-finish-load', () => win.webContents.send(IPC.engineCommand, command));
    } else {
      win.webContents.send(IPC.engineCommand, command);
    }
  }

  get engineWindow(): BrowserWindow | null {
    return this.engine;
  }

  // --------------------------------------------------------------- overlay

  ensureOverlay(): BrowserWindow {
    if (this.overlay && !this.overlay.isDestroyed()) return this.overlay;
    this.overlay = new BrowserWindow({
      width: OVERLAY_WIDTH,
      height: OVERLAY_HEIGHT,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      focusable: false,
      skipTaskbar: true,
      hasShadow: false,
      alwaysOnTop: true,
      roundedCorners: false,
      ...(process.platform === 'darwin' ? { type: 'panel' } : {}),
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false,
      },
    });
    this.overlay.setAlwaysOnTop(true, 'screen-saver');
    this.overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    this.overlay.setIgnoreMouseEvents(true);
    void this.overlay.loadFile(this.page('overlay'));
    this.overlay.on('closed', () => {
      this.overlay = null;
    });
    return this.overlay;
  }

  setOverlayPosition(position: OverlayPosition): void {
    this.overlayPosition = position;
  }

  private placeOverlay(win: BrowserWindow): void {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const area = display.workArea;
    const x = Math.round(area.x + (area.width - OVERLAY_WIDTH) / 2);
    const y = this.overlayPosition === 'top' ? area.y + 12 : area.y + area.height - OVERLAY_HEIGHT - 20;
    win.setBounds({ x, y, width: OVERLAY_WIDTH, height: OVERLAY_HEIGHT });
  }

  updateOverlay(state: OverlayState): void {
    const win = this.ensureOverlay();
    if (state.visible && !win.isVisible()) {
      this.placeOverlay(win);
      win.showInactive();
    }
    win.webContents.send(IPC.overlayState, state);
    if (!state.visible && win.isVisible()) {
      // Let the fade-out animation finish before hiding the native window.
      setTimeout(() => {
        if (this.overlay && !this.overlay.isDestroyed() && !this.overlay.webContents.isDestroyed()) {
          this.overlay.hide();
        }
      }, 220);
    }
  }

  // -------------------------------------------------------------- settings

  openSettings(pane?: string): BrowserWindow {
    if (this.settings && !this.settings.isDestroyed()) {
      this.settings.show();
      this.settings.focus();
      if (pane) this.settings.webContents.send('settings:navigate', pane);
      return this.settings;
    }
    this.settings = new BrowserWindow({
      width: 960,
      height: 680,
      minWidth: 780,
      minHeight: 520,
      title: 'Flyt',
      show: false,
      icon: process.platform === 'darwin' ? undefined : this.icon,
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
      trafficLightPosition: { x: 16, y: 18 },
      ...(process.platform === 'darwin' ? { backgroundColor: '#00000000', vibrancy: 'sidebar' as const } : {}),
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });
    const hash = pane ? `#${pane}` : '';
    void this.settings.loadFile(this.page('settings'), { hash });
    this.settings.once('ready-to-show', () => {
      this.settings?.show();
      this.settings?.focus();
    });
    this.settings.on('closed', () => {
      this.settings = null;
    });
    return this.settings;
  }

  get settingsWindow(): BrowserWindow | null {
    return this.settings && !this.settings.isDestroyed() ? this.settings : null;
  }

  sendToSettings(channel: string, payload: unknown): void {
    const win = this.settingsWindow;
    if (win) win.webContents.send(channel, payload);
  }

  broadcast(channel: string, payload: unknown): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(channel, payload);
    }
  }

  destroyAll(): void {
    for (const win of BrowserWindow.getAllWindows()) win.destroy();
  }
}

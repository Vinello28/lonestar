import type { ActiveTool, ElementKind, SelectionTarget } from '../domain/types';
import { backendAdapter, isTauriRuntime } from '../infrastructure/backendAdapter';

export type ThemeMode = 'light' | 'dark';
export type UiZoomAction = 'in' | 'out' | 'reset';

export const DEFAULT_UI_ZOOM = 1;
export const MIN_UI_ZOOM = 0.5;
export const MAX_UI_ZOOM = 2;
export const UI_ZOOM_STEP = 0.1;
export const UI_ZOOM_STORAGE_KEY = 'lonestar-ui-zoom';

export interface ZoomKeyEventLike {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey?: boolean;
}

/** Clamps and rounds the GUI zoom factor to [0.5, 2.0] with 2-decimal precision. */
export function clampUiZoom(scale: number): number {
  if (!Number.isFinite(scale)) return DEFAULT_UI_ZOOM;
  const clamped = Math.min(MAX_UI_ZOOM, Math.max(MIN_UI_ZOOM, scale));
  return Math.round(clamped * 100) / 100;
}

/** Detects macOS/Darwin runtime from an optional platform hint or navigator metadata. */
export function isMacPlatform(platformHint?: string): boolean {
  if (platformHint !== undefined) {
    return /mac|darwin/i.test(platformHint);
  }
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  const raw =
    nav.userAgentData?.platform ||
    navigator.platform ||
    navigator.userAgent ||
    '';
  return /mac|darwin/i.test(raw);
}

/** Resolves Ctrl/Cmd +/-/0 keyboard shortcuts across IT, US, and numpad layouts. */
export function resolveUiZoomShortcut(
  event: ZoomKeyEventLike,
  isMac: boolean,
): UiZoomAction | null {
  if (event.altKey) return null;
  const primary = isMac
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
  if (!primary) return null;

  if (
    event.key === '+' ||
    event.key === '=' ||
    event.code === 'NumpadAdd'
  ) {
    return 'in';
  }
  if (
    event.key === '-' ||
    event.code === 'NumpadSubtract' ||
    (event.key === '_' && Boolean(event.shiftKey))
  ) {
    return 'out';
  }
  if (event.key === '0' && !event.shiftKey) {
    return 'reset';
  }
  return null;
}

export type SaveShortcutAction = 'save' | 'saveAs';

/** Resolves Ctrl+S / Ctrl+Shift+S (Cmd on macOS) to Save / Save As. */
export function resolveSaveShortcut(
  event: ZoomKeyEventLike,
  isMac: boolean,
): SaveShortcutAction | null {
  if (event.altKey) return null;
  const primary = isMac
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
  if (!primary || event.key.toLowerCase() !== 's') return null;
  return event.shiftKey ? 'saveAs' : 'save';
}

export interface PendingDependencyDraft {
  dependerActorId: string;
  dependerElementId: string | null;
  dependeeActorId: string;
  dependeeElementId: string | null;
  x: number;
  y: number;
}

export interface PaletteDragPayload {
  category: 'actor' | 'element';
  kind: string;
}

class UiStore {
  theme = $state<ThemeMode>('light');
  uiZoom = $state<number>(DEFAULT_UI_ZOOM);
  activeTool = $state<ActiveTool>('select');
  selection = $state<SelectionTarget>(null);
  zoom = $state<number>(1);
  panX = $state<number>(0);
  panY = $state<number>(0);
  pendingDependency = $state<PendingDependencyDraft | null>(null);
  paletteDrag = $state<PaletteDragPayload | null>(null);
  validationDrawerOpen = $state<boolean>(false);
  exportMenuOpen = $state<boolean>(false);
  settingsModalOpen = $state<boolean>(false);
  agentPanelOpen = $state<boolean>(false);
  pngScale = $state<2 | 3 | 4>(3);
  transparentExport = $state<boolean>(false);
  toast = $state<{ text: string; tone: 'info' | 'success' | 'error' } | null>(
    null,
  );

  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  initTheme(): void {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem('lonestar-theme');
    if (saved === 'dark' || saved === 'light') {
      this.setTheme(saved);
    } else {
      this.setTheme('light');
    }
  }

  setTheme(mode: ThemeMode): void {
    this.theme = mode;
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', mode);
    }
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('lonestar-theme', mode);
    }
  }

  toggleTheme(): void {
    this.setTheme(this.theme === 'light' ? 'dark' : 'light');
  }

  async initUiZoom(): Promise<void> {
    if (typeof window === 'undefined') return;
    let restored = DEFAULT_UI_ZOOM;
    try {
      const saved = window.localStorage.getItem(UI_ZOOM_STORAGE_KEY);
      if (saved !== null) {
        restored = clampUiZoom(parseFloat(saved));
      }
    } catch {
      restored = DEFAULT_UI_ZOOM;
    }
    this.uiZoom = restored;
    if (isTauriRuntime() && restored !== DEFAULT_UI_ZOOM) {
      try {
        await backendAdapter.setWebviewZoom(restored);
      } catch (err) {
        console.warn('Failed to restore webview zoom:', err);
      }
    }
  }

  async setUiZoom(
    scale: number,
    options?: { notify?: boolean },
  ): Promise<void> {
    const next = clampUiZoom(scale);
    const changed = next !== this.uiZoom;
    this.uiZoom = next;

    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(UI_ZOOM_STORAGE_KEY, String(next));
      } catch {
        // Ignore storage errors
      }
    }

    if (options?.notify) {
      this.notify(
        `Interface Zoom: ${Math.round(next * 100)}%${next === DEFAULT_UI_ZOOM ? ' (Reset)' : ''}`,
        'info',
      );
    }

    if (changed && isTauriRuntime()) {
      try {
        await backendAdapter.setWebviewZoom(next);
      } catch (err) {
        console.warn('Failed to update webview zoom:', err);
      }
    }
  }

  zoomUiIn(): Promise<void> {
    return this.setUiZoom(this.uiZoom + UI_ZOOM_STEP, { notify: true });
  }

  zoomUiOut(): Promise<void> {
    return this.setUiZoom(this.uiZoom - UI_ZOOM_STEP, { notify: true });
  }

  resetUiZoom(): Promise<void> {
    return this.setUiZoom(DEFAULT_UI_ZOOM, { notify: true });
  }

  toggleAgentPanel(): void {
    this.agentPanelOpen = !this.agentPanelOpen;
  }

  notify(text: string, tone: 'info' | 'success' | 'error' = 'info'): void {
    this.toast = { text, tone };
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toast = null;
    }, 3400);
  }

  zoomBy(delta: number, focalX?: number, focalY?: number): void {
    const nextZoom = Math.min(2.6, Math.max(0.25, this.zoom + delta));
    if (focalX !== undefined && focalY !== undefined) {
      const ratio = nextZoom / this.zoom;
      this.panX = focalX - (focalX - this.panX) * ratio;
      this.panY = focalY - (focalY - this.panY) * ratio;
    }
    this.zoom = Number(nextZoom.toFixed(2));
  }

  resetViewport(): void {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
  }

  openDependencyPrompt(draft: PendingDependencyDraft): void {
    this.pendingDependency = draft;
  }

  closeDependencyPrompt(): void {
    this.pendingDependency = null;
  }

  defaultDependumKindFor(
    dependerElKind?: ElementKind,
  ): ElementKind {
    return dependerElKind ?? 'goal';
  }
}

export const uiStore = new UiStore();

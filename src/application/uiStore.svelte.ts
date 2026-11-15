import type { ActiveTool, ElementKind, SelectionTarget } from '../domain/types';

export type ThemeMode = 'light' | 'dark';

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
  activeTool = $state<ActiveTool>('select');
  selection = $state<SelectionTarget>(null);
  zoom = $state<number>(1);
  panX = $state<number>(0);
  panY = $state<number>(0);
  pendingDependency = $state<PendingDependencyDraft | null>(null);
  paletteDrag = $state<PaletteDragPayload | null>(null);
  validationDrawerOpen = $state<boolean>(false);
  exportMenuOpen = $state<boolean>(false);
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

import { validateModelClient } from '../domain/istarRules';
import type { DiagramModel, ValidationIssue } from '../domain/types';
import {
  exportModelToPiStarJson,
  getBuiltinTemplateClient,
  importAnyJsonModel,
} from './pistarCodec';

export function isTauriRuntime(): boolean {
  return (
    typeof window !== 'undefined' &&
    '__TAURI_INTERNALS__' in (window as unknown as Record<string, unknown>)
  );
}

async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

export interface AppRuntimeInfo {
  version: string;
  platform: string;
  arch: string;
}

export const backendAdapter = {
  async getAppInfo(): Promise<AppRuntimeInfo> {
    if (isTauriRuntime()) {
      return tauriInvoke<AppRuntimeInfo>('get_app_info');
    }
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
    const platform = ua.includes('win')
      ? 'windows'
      : ua.includes('mac') || ua.includes('darwin')
        ? 'macos'
        : 'linux';
    return {
      version: '1.0.0',
      platform,
      arch: 'web',
    };
  },

  async loadInitialModel(): Promise<DiagramModel> {
    if (isTauriRuntime()) {
      return tauriInvoke<DiagramModel>('get_initial_model');
    }
    return getBuiltinTemplateClient('travel');
  },

  async loadTemplate(templateId: string): Promise<DiagramModel> {
    if (isTauriRuntime()) {
      return tauriInvoke<DiagramModel>('load_template', { templateId });
    }
    return getBuiltinTemplateClient(templateId);
  },

  async validateModel(model: DiagramModel): Promise<ValidationIssue[]> {
    if (isTauriRuntime()) {
      return tauriInvoke<ValidationIssue[]>('validate_model', { model });
    }
    return validateModelClient(model);
  },

  async exportPiStarJson(model: DiagramModel): Promise<string> {
    if (isTauriRuntime()) {
      return tauriInvoke<string>('export_pistar_json', { model });
    }
    return exportModelToPiStarJson(model);
  },

  async importJsonModel(rawJson: string): Promise<DiagramModel> {
    if (isTauriRuntime()) {
      return tauriInvoke<DiagramModel>('import_json_model', { rawJson });
    }
    return importAnyJsonModel(rawJson);
  },

  async autoLayoutModel(model: DiagramModel): Promise<DiagramModel> {
    if (isTauriRuntime()) {
      return tauriInvoke<DiagramModel>('auto_layout_model', { model });
    }
    return clientAutoLayout(model);
  },

  async saveFile(
    defaultFilename: string,
    filterName: string,
    extensions: string[],
    contents: string,
    isBase64: boolean,
  ): Promise<boolean> {
    if (isTauriRuntime()) {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const selectedPath = await save({
        defaultPath: defaultFilename,
        filters: [{ name: filterName, extensions }],
      });
      if (!selectedPath) return false;
      await tauriInvoke<void>('save_file_to_disk', {
        path: selectedPath,
        contents,
        isBase64,
      });
      return true;
    }

    if (isBase64) {
      const bin = atob(contents);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'image/png' });
      triggerBrowserDownload(defaultFilename, blob);
    } else {
      const mime = extensions.includes('svg')
        ? 'image/svg+xml;charset=utf-8'
        : extensions.includes('txt')
          ? 'text/plain;charset=utf-8'
          : 'application/json;charset=utf-8';
      const blob = new Blob([contents], { type: mime });
      triggerBrowserDownload(defaultFilename, blob);
    }
    return true;
  },

  async openJsonFileFromDialog(): Promise<string | null> {
    if (!isTauriRuntime()) return null;
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      multiple: false,
      filters: [{ name: 'i* 2.0 Model (.json, .txt)', extensions: ['json', 'txt', 'istar'] }],
    });
    if (!selected || typeof selected !== 'string') return null;
    return tauriInvoke<string>('read_file_from_disk', { path: selected });
  },
};

function triggerBrowserDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function clientAutoLayout(input: DiagramModel): DiagramModel {
  const model: DiagramModel = structuredClone(input);
  if (model.actors.length === 0) return model;

  const cols = Math.max(1, Math.ceil(Math.sqrt(model.actors.length)));
  const colGap = 420;
  const rowGap = 380;

  model.actors.forEach((actor, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    actor.x = 100 + col * colGap;
    actor.y = 100 + row * rowGap;

    const inner = model.elements.filter((e) => e.actorId === actor.id);
    if (inner.length === 0) return;

    const innerCols = Math.max(1, Math.ceil(Math.sqrt(inner.length)));
    const innerRows = Math.ceil(inner.length / innerCols);
    actor.width = Math.max(280, innerCols * 150 + 80);
    actor.height = Math.max(240, innerRows * 84 + 95);

    inner.forEach((el, i) => {
      const ic = i % innerCols;
      const ir = Math.floor(i / innerCols);
      el.x = actor.x + 40 + ic * 150;
      el.y = actor.y + 72 + ir * 84;
    });
  });

  model.dependencies.forEach((dep) => {
    const depEl = dep.dependerElementId
      ? model.elements.find((e) => e.id === dep.dependerElementId)
      : undefined;
    const depActor = model.actors.find((a) => a.id === dep.dependerActorId);
    const eeEl = dep.dependeeElementId
      ? model.elements.find((e) => e.id === dep.dependeeElementId)
      : undefined;
    const eeActor = model.actors.find((a) => a.id === dep.dependeeActorId);

    const sx = depEl
      ? depEl.x + depEl.width / 2
      : depActor
        ? depActor.x + depActor.width / 2
        : 0;
    const sy = depEl
      ? depEl.y + depEl.height / 2
      : depActor
        ? depActor.y + depActor.height / 2
        : 0;
    const ex = eeEl
      ? eeEl.x + eeEl.width / 2
      : eeActor
        ? eeActor.x + eeActor.width / 2
        : 0;
    const ey = eeEl
      ? eeEl.y + eeEl.height / 2
      : eeActor
        ? eeActor.y + eeActor.height / 2
        : 0;
    dep.x = (sx + ex) / 2 - 55;
    dep.y = (sy + ey) / 2 - 22;
  });

  return model;
}

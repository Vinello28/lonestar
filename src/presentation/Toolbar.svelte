<script lang="ts">
  import { modelStore } from '../application/modelStore.svelte';
  import { uiStore } from '../application/uiStore.svelte';
  import { updateStore } from '../application/updateStore.svelte';
  import { backendAdapter, isTauriRuntime } from '../infrastructure/backendAdapter';
  import {
    buildVectorSvg,
    renderHighResPngBase64,
    sanitizeFilename,
  } from '../infrastructure/exportService';
  import { exportModelToLoneStarJson } from '../infrastructure/pistarCodec';
  import CowboyPandaIcon from './shapes/CowboyPandaIcon.svelte';

  interface Props {
    svgRef: SVGSVGElement | null;
    onFitToScreen: () => void;
  }

  let { svgRef, onFitToScreen }: Props = $props();
  let fileInputRef: HTMLInputElement | null = $state(null);
  let exporting = $state(false);

  async function handleTemplateChange(e: Event) {
    const val = (e.target as HTMLSelectElement).value;
    if (!val) return;
    await modelStore.loadTemplate(val);
    uiStore.selection = null;
    setTimeout(onFitToScreen, 20);
    uiStore.notify('Loaded diagram template', 'info');
  }

  async function handleOpenJson() {
    if (isTauriRuntime()) {
      try {
        const raw = await backendAdapter.openJsonFileFromDialog();
        if (!raw) return;
        const loaded = await backendAdapter.importJsonModel(raw);
        modelStore.replaceModel(loaded);
        uiStore.selection = null;
        setTimeout(onFitToScreen, 20);
        uiStore.notify(`Loaded "${loaded.name}"`, 'success');
      } catch (err) {
        uiStore.notify(`Open failed: ${String(err)}`, 'error');
      }
    } else {
      fileInputRef?.click();
    }
  }

  async function handleBrowserFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const raw = await file.text();
      const loaded = await backendAdapter.importJsonModel(raw);
      modelStore.replaceModel(loaded);
      uiStore.selection = null;
      setTimeout(onFitToScreen, 20);
      uiStore.notify(`Loaded "${loaded.name}"`, 'success');
    } catch (err) {
      uiStore.notify(`Invalid model file: ${String(err)}`, 'error');
    } finally {
      input.value = '';
    }
  }

  async function handleExportPng() {
    if (!svgRef || exporting) return;
    exporting = true;
    try {
      const { base64, width, height } = await renderHighResPngBase64(
        svgRef,
        modelStore.model,
        uiStore.pngScale,
        uiStore.transparentExport,
      );
      const filename = `${sanitizeFilename(modelStore.model.name)}-${uiStore.pngScale}x.png`;
      const saved = await backendAdapter.saveFile(
        filename,
        'PNG Image',
        ['png'],
        base64,
        true,
      );
      uiStore.exportMenuOpen = false;
      if (saved) {
        uiStore.notify(`Exported ${width}×${height}px PNG`, 'success');
      }
    } catch (err) {
      uiStore.notify(`PNG export failed: ${String(err)}`, 'error');
    } finally {
      exporting = false;
    }
  }

  async function handleExportSvg() {
    if (!svgRef) return;
    const svg = buildVectorSvg(
      svgRef,
      modelStore.model,
      uiStore.transparentExport,
    );
    const filename = `${sanitizeFilename(modelStore.model.name)}.svg`;
    const saved = await backendAdapter.saveFile(
      filename,
      'SVG Vector',
      ['svg'],
      svg,
      false,
    );
    uiStore.exportMenuOpen = false;
    if (saved) uiStore.notify('Exported Vector SVG', 'success');
  }

  async function handleExportLoneStarJson() {
    const json = exportModelToLoneStarJson(modelStore.model);
    const filename = `${sanitizeFilename(modelStore.model.name)}.lonestar.json`;
    const saved = await backendAdapter.saveFile(
      filename,
      'LoneStar JSON',
      ['json'],
      json,
      false,
    );
    uiStore.exportMenuOpen = false;
    if (saved) uiStore.notify('Saved LoneStar JSON', 'success');
  }

  async function handleExportPiStarJson() {
    const json = await backendAdapter.exportPiStarJson(modelStore.model);
    const filename = `${sanitizeFilename(modelStore.model.name)}.pistar.json`;
    const saved = await backendAdapter.saveFile(
      filename,
      'piStar 2.0 JSON',
      ['json'],
      json,
      false,
    );
    uiStore.exportMenuOpen = false;
    if (saved) uiStore.notify('Exported piStar 2.0 JSON', 'success');
  }

  async function handleExportPiStarTxt() {
    const txt = await backendAdapter.exportPiStarJson(modelStore.model);
    const filename = `${sanitizeFilename(modelStore.model.name)}.pistar.txt`;
    const saved = await backendAdapter.saveFile(
      filename,
      'piStar 2.0 Text (.txt)',
      ['txt'],
      txt,
      false,
    );
    uiStore.exportMenuOpen = false;
    if (saved) uiStore.notify('Exported piStar 2.0 (.txt)', 'success');
  }

  async function handleAutoLayout() {
    await modelStore.applyAutoLayout();
    setTimeout(onFitToScreen, 20);
    uiStore.notify('Auto-arranged diagram layout', 'info');
  }
</script>

<header class="toolbar">
  <div class="hero-left">
    <div class="brand">
      <CowboyPandaIcon size={48} className="brand-logo" />
      <div class="brand-meta">
        <div class="brand-top-row">
          <span class="brand-title">LoneStar</span>
          <span class="brand-ver">v{updateStore.appVersion}</span>
        </div>
        <input
          class="doc-title-input"
          type="text"
          bind:value={modelStore.model.name}
          aria-label="Diagram Name"
        />
      </div>
    </div>

    <div class="file-controls">
      <select
        class="tb-select hero-control"
        aria-label="Load Template"
        onchange={handleTemplateChange}
      >
        <option value="">Choose Template…</option>
        <option value="travel">Travel Reimbursement (i* 2.0)</option>
        <option value="telemedicine">Telemedicine System (i* 2.0)</option>
        <option value="empty">Blank Canvas</option>
      </select>

      <button
        type="button"
        class="tb-btn hero-control open-btn"
        onclick={handleOpenJson}
        title="Load LoneStar / piStar model (.json or .txt)"
      >
        Open .json / .txt
      </button>
      <input
        bind:this={fileInputRef}
        type="file"
        accept=".json,.txt,.istar,application/json,text/plain"
        style="display: none;"
        onchange={handleBrowserFileChange}
      />
    </div>
  </div>

  <div class="toolbar-group">
    <button
      type="button"
      class="tb-btn icon-btn"
      disabled={!modelStore.canUndo}
      onclick={() => modelStore.undo()}
      title="Undo (Ctrl+Z)"
    >
      ↶
    </button>
    <button
      type="button"
      class="tb-btn icon-btn"
      disabled={!modelStore.canRedo}
      onclick={() => modelStore.redo()}
      title="Redo (Ctrl+Y)"
    >
      ↷
    </button>
    <button
      type="button"
      class="tb-btn"
      onclick={handleAutoLayout}
      title="Auto-organize Actors & Elements"
    >
      Auto Layout
    </button>
    <button
      type="button"
      class="tb-btn"
      onclick={onFitToScreen}
      title="Fit Diagram to View (F)"
    >
      Fit
    </button>
  </div>

  <div class="toolbar-group right-group">
    <div class="export-dropdown">
      <button
        type="button"
        class="tb-btn primary-btn"
        onclick={() => (uiStore.exportMenuOpen = !uiStore.exportMenuOpen)}
      >
        Export ▾
      </button>

      {#if uiStore.exportMenuOpen}
        <div
          class="dropdown-menu"
          role="menu"
          tabindex="-1"
          onmouseleave={() => (uiStore.exportMenuOpen = false)}
        >
          <div class="dropdown-section">High-Res Image</div>
          <div class="scale-row">
            <span>DPI Scale:</span>
            {#each [2, 3, 4] as s}
              <button
                type="button"
                class="scale-pill"
                class:active={uiStore.pngScale === s}
                onclick={() => (uiStore.pngScale = s as 2 | 3 | 4)}
              >
                {s}x
              </button>
            {/each}
          </div>
          <label class="checkbox-row">
            <input type="checkbox" bind:checked={uiStore.transparentExport} />
            <span>Transparent background</span>
          </label>
          <button
            type="button"
            class="menu-action"
            disabled={exporting}
            onclick={handleExportPng}
          >
            {exporting
              ? 'Rendering PNG…'
              : `Export High-Res PNG (${uiStore.pngScale}x)`}
          </button>
          <button type="button" class="menu-action" onclick={handleExportSvg}>
            Export Vector SVG
          </button>

          <div class="dropdown-divider"></div>
          <div class="dropdown-section">Model Document</div>
          <button
            type="button"
            class="menu-action"
            onclick={handleExportLoneStarJson}
          >
            Save LoneStar JSON (.json)
          </button>
          <button
            type="button"
            class="menu-action"
            onclick={handleExportPiStarJson}
          >
            Export piStar 2.0 JSON (.json)
          </button>
          <button
            type="button"
            class="menu-action"
            onclick={handleExportPiStarTxt}
          >
            Export piStar 2.0 Text (.txt)
          </button>
        </div>
      {/if}
    </div>

    <button
      type="button"
      class="tb-btn theme-btn"
      onclick={() => uiStore.toggleTheme()}
      title="Switch Warm Light / Warm Dark Mode"
      aria-label="Toggle Theme"
    >
      {uiStore.theme === 'light' ? '☾ Dark' : '☀ Light'}
    </button>

    <button
      type="button"
      class="tb-btn settings-btn"
      onclick={() => (uiStore.settingsModalOpen = true)}
      title="Version, Updates & Project Links"
      aria-label="Open Settings"
    >
      <span>⚙ Settings</span>
      {#if updateStore.status === 'available' || updateStore.status === 'installed'}
        <span class="update-dot" aria-label="Update available"></span>
      {/if}
    </button>
  </div>
</header>

<style>
  .toolbar {
    min-height: 74px;
    flex-shrink: 0;
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border-subtle);
    padding: 8px 18px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    flex-wrap: wrap;
  }

  .hero-left {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 280px;
  }

  :global(.brand-logo) {
    flex-shrink: 0;
    filter: drop-shadow(0 2px 4px rgba(30, 24, 16, 0.14));
  }

  .brand-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .brand-top-row {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .brand-title {
    font-size: 13.5px;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--accent-primary);
  }

  .brand-ver {
    font-size: 10.5px;
    font-weight: 700;
    padding: 1px 7px;
    border-radius: 999px;
    background: var(--bg-elevated);
    border: 1px solid var(--border-subtle);
    color: var(--text-secondary);
  }

  .doc-title-input {
    border: 1px solid transparent;
    background: transparent;
    font-size: 16px;
    font-weight: 700;
    height: 32px;
    padding: 2px 6px;
    margin-left: -6px;
    border-radius: 7px;
    width: 265px;
    outline: none;
  }

  .doc-title-input:hover,
  .doc-title-input:focus {
    background: var(--bg-elevated);
    border-color: var(--border-strong);
  }

  .file-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-left: 14px;
    border-left: 1px solid var(--border-subtle);
  }

  .hero-control {
    height: 42px !important;
    padding: 0 14px !important;
    font-size: 13.5px !important;
    border-radius: 10px !important;
    border-color: var(--border-strong) !important;
  }

  .tb-select.hero-control {
    min-width: 235px;
  }

  .settings-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    position: relative;
  }

  .update-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: var(--status-success);
  }

  .toolbar-group {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .right-group {
    margin-left: auto;
  }

  .tb-btn,
  .tb-select {
    height: 32px;
    padding: 0 11px;
    border-radius: 8px;
    border: 1px solid var(--border-subtle);
    background: var(--bg-elevated);
    font-size: 12px;
    font-weight: 600;
    transition: border-color 0.12s, background-color 0.12s;
  }

  .tb-btn:hover:not(:disabled),
  .tb-select:hover {
    border-color: var(--border-strong);
    background: var(--bg-hover);
  }

  .tb-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .icon-btn {
    padding: 0 9px;
    font-size: 15px;
  }

  .primary-btn {
    background: var(--accent-primary);
    border-color: var(--accent-primary);
    color: #fffaf3;
  }

  .primary-btn:hover {
    background: var(--accent-primary-hover) !important;
    border-color: var(--accent-primary-hover) !important;
  }

  .export-dropdown {
    position: relative;
  }

  .dropdown-menu {
    position: absolute;
    right: 0;
    top: 38px;
    width: 248px;
    background: var(--bg-surface);
    border: 1px solid var(--border-strong);
    border-radius: 11px;
    padding: 10px;
    box-shadow: var(--shadow-panel);
    display: flex;
    flex-direction: column;
    gap: 6px;
    z-index: 50;
  }

  .dropdown-section {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-secondary);
    padding: 2px 4px;
  }

  .dropdown-divider {
    height: 1px;
    background: var(--border-subtle);
    margin: 4px 0;
  }

  .scale-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 2px 4px;
    font-size: 11.5px;
    color: var(--text-secondary);
  }

  .scale-pill {
    padding: 2px 8px;
    border-radius: 6px;
    border: 1px solid var(--border-subtle);
    background: var(--bg-elevated);
    font-size: 11px;
    font-weight: 600;
  }

  .scale-pill.active {
    background: var(--accent-soft);
    border-color: var(--accent-primary);
    color: var(--accent-primary);
  }

  .checkbox-row {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 3px 4px;
    font-size: 11.5px;
    color: var(--text-secondary);
    cursor: pointer;
  }

  .menu-action {
    text-align: left;
    padding: 8px 10px;
    border-radius: 7px;
    border: 1px solid transparent;
    background: var(--bg-elevated);
    font-size: 12px;
    font-weight: 600;
  }

  .menu-action:hover {
    border-color: var(--accent-primary);
    background: var(--bg-hover);
  }
</style>

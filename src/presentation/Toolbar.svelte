<script lang="ts">
  import { modelStore } from '../application/modelStore.svelte';
  import {
    isFileNotFoundError,
    recentProjectsStore,
    type RecentProjectEntry,
  } from '../application/recentProjectsStore.svelte';
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

  const TEMPLATE_OPTIONS = [
    { value: 'travel', label: 'Travel Reimbursement (i* 2.0)' },
    { value: 'telemedicine', label: 'Telemedicine System (i* 2.0)' },
    { value: 'empty', label: 'Blank Canvas' },
  ] as const;

  let { svgRef, onFitToScreen }: Props = $props();
  let fileInputRef: HTMLInputElement | null = $state(null);
  let exporting = $state(false);
  let templateMenuOpen = $state(false);
  let selectedTemplate = $state('');
  let templateDropdownRef: HTMLDivElement | null = $state(null);
  let recentMenuOpen = $state(false);
  let recentDropdownRef: HTMLDivElement | null = $state(null);

  const selectedTemplateLabel = $derived(
    TEMPLATE_OPTIONS.find((opt) => opt.value === selectedTemplate)?.label ?? 'Choose Template…'
  );

  function setupDropdownDismiss(
    ref: HTMLElement | null,
    close: () => void,
  ): () => void {
    const onPointerDown = (e: PointerEvent) => {
      if (ref && !ref.contains(e.target as Node)) {
        close();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }

  $effect(() => {
    if (!templateMenuOpen) return;
    return setupDropdownDismiss(templateDropdownRef, () => {
      templateMenuOpen = false;
    });
  });

  $effect(() => {
    if (!recentMenuOpen) return;
    return setupDropdownDismiss(recentDropdownRef, () => {
      recentMenuOpen = false;
    });
  });

  async function selectTemplate(val: string) {
    templateMenuOpen = false;
    selectedTemplate = val;
    await modelStore.loadTemplate(val);
    uiStore.selection = null;
    setTimeout(onFitToScreen, 20);
    uiStore.notify('Loaded diagram template', 'info');
  }

  async function handleOpenJson() {
    if (isTauriRuntime()) {
      try {
        const picked = await backendAdapter.openJsonFileWithPathFromDialog();
        if (!picked) return;
        const loaded = await backendAdapter.importJsonModel(picked.contents);
        modelStore.replaceModel(loaded);
        uiStore.selection = null;
        recentProjectsStore.recordProject(picked.path, loaded.name);
        setTimeout(onFitToScreen, 20);
        uiStore.notify(`Loaded "${loaded.name}"`, 'success');
      } catch (err) {
        uiStore.notify(`Open failed: ${String(err)}`, 'error');
      }
    } else {
      fileInputRef?.click();
    }
  }

  async function handleOpenRecentProject(entry: RecentProjectEntry) {
    recentMenuOpen = false;
    try {
      const raw = await backendAdapter.readJsonFileFromPath(entry.path);
      const loaded = await backendAdapter.importJsonModel(raw);
      modelStore.replaceModel(loaded);
      uiStore.selection = null;
      recentProjectsStore.recordProject(entry.path, loaded.name);
      setTimeout(onFitToScreen, 20);
      uiStore.notify(`Loaded "${loaded.name}"`, 'success');
    } catch (err) {
      if (isFileNotFoundError(err)) {
        recentProjectsStore.removeProject(entry.path);
        uiStore.notify(
          `File not found: "${entry.fileName}" — removed from recent projects.`,
          'error',
        );
      } else {
        uiStore.notify(
          `Open failed for "${entry.fileName}": ${String(err)}`,
          'error',
        );
      }
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

  async function saveModelDocument(
    filename: string,
    filterName: string,
    extensions: string[],
    contents: string,
    successMessage: string,
  ) {
    const savedPath = await backendAdapter.saveFile(
      filename,
      filterName,
      extensions,
      contents,
      false,
    );
    uiStore.exportMenuOpen = false;
    if (savedPath) {
      if (isTauriRuntime()) {
        recentProjectsStore.recordProject(savedPath, modelStore.model.name);
      }
      uiStore.notify(successMessage, 'success');
    }
  }

  async function handleExportLoneStarJson() {
    const json = exportModelToLoneStarJson(modelStore.model);
    const filename = `${sanitizeFilename(modelStore.model.name)}.lonestar.json`;
    await saveModelDocument(
      filename,
      'LoneStar JSON',
      ['json'],
      json,
      'Saved LoneStar JSON',
    );
  }

  async function handleExportPiStarJson() {
    const json = await backendAdapter.exportPiStarJson(modelStore.model);
    const filename = `${sanitizeFilename(modelStore.model.name)}.pistar.json`;
    await saveModelDocument(
      filename,
      'piStar 2.0 JSON',
      ['json'],
      json,
      'Exported piStar 2.0 JSON',
    );
  }

  async function handleExportPiStarTxt() {
    const txt = await backendAdapter.exportPiStarJson(modelStore.model);
    const filename = `${sanitizeFilename(modelStore.model.name)}.pistar.txt`;
    await saveModelDocument(
      filename,
      'piStar 2.0 Text (.txt)',
      ['txt'],
      txt,
      'Exported piStar 2.0 (.txt)',
    );
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
      <div class="template-dropdown" bind:this={templateDropdownRef}>
        <button
          type="button"
          class="tb-select hero-control template-trigger"
          aria-label="Load Template"
          aria-haspopup="menu"
          aria-expanded={templateMenuOpen}
          onclick={() => (templateMenuOpen = !templateMenuOpen)}
        >
          <span class="template-trigger-label">{selectedTemplateLabel}</span>
          <span class="template-caret" aria-hidden="true">▾</span>
        </button>

        {#if templateMenuOpen}
          <div class="dropdown-menu template-menu" role="menu">
            <div class="dropdown-section">Diagram Templates</div>
            {#each TEMPLATE_OPTIONS as opt (opt.value)}
              <button
                type="button"
                class="menu-action template-option"
                class:active={selectedTemplate === opt.value}
                role="menuitemradio"
                aria-checked={selectedTemplate === opt.value}
                onclick={() => selectTemplate(opt.value)}
              >
                <span>{opt.label}</span>
                {#if selectedTemplate === opt.value}
                  <span class="template-check" aria-hidden="true">✓</span>
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>

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

      {#if isTauriRuntime()}
        <div class="recent-dropdown" bind:this={recentDropdownRef}>
          <button
            type="button"
            class="tb-btn hero-control recent-trigger"
            aria-label="Recent Projects"
            aria-haspopup="menu"
            aria-expanded={recentMenuOpen}
            onclick={() => (recentMenuOpen = !recentMenuOpen)}
            title="Open recently saved or opened diagrams (Offline)"
          >
            <span>Recent</span>
            {#if recentProjectsStore.entries.length > 0}
              <span class="recent-count">{recentProjectsStore.entries.length}</span>
            {/if}
            <span class="template-caret" aria-hidden="true">▾</span>
          </button>

          {#if recentMenuOpen}
            <div class="dropdown-menu recent-menu" role="menu">
              <div class="recent-menu-header">
                <span class="dropdown-section">
                  Recent Projects ({recentProjectsStore.entries.length}/10)
                </span>
                {#if recentProjectsStore.entries.length > 0}
                  <button
                    type="button"
                    class="recent-clear-btn"
                    onclick={() => recentProjectsStore.clearAll()}
                    title="Clear recent projects list"
                  >
                    Clear
                  </button>
                {/if}
              </div>

              {#if recentProjectsStore.entries.length === 0}
                <div class="recent-empty">
                  No recent diagrams yet. Save or open a .json / .txt diagram to list it here.
                </div>
              {:else}
                <div class="recent-list">
                  {#each recentProjectsStore.entries as entry (entry.path)}
                    <div class="recent-item-row">
                      <button
                        type="button"
                        class="menu-action recent-item-btn"
                        role="menuitem"
                        title={entry.path}
                        onclick={() => handleOpenRecentProject(entry)}
                      >
                        <span class="recent-item-name">{entry.name}</span>
                        <span class="recent-item-meta">
                          {entry.fileName} — {entry.path}
                        </span>
                      </button>
                      <button
                        type="button"
                        class="recent-remove-btn"
                        aria-label={`Remove ${entry.fileName} from recent projects`}
                        title="Remove from recent projects"
                        onclick={() => recentProjectsStore.removeProject(entry.path)}
                      >
                        ✕
                      </button>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/if}
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
      <span class="tb-action-icon" aria-hidden="true">
        {uiStore.theme === 'light' ? '☾' : '☀'}
      </span>
      <span>{uiStore.theme === 'light' ? 'Dark' : 'Light'}</span>
    </button>

    {#if isTauriRuntime()}
      <button
        type="button"
        class="tb-btn agent-btn"
        class:active-agent={uiStore.agentPanelOpen}
        onclick={() => uiStore.toggleAgentPanel()}
        title="Open Local / Cloud AI Modeling Agent"
        aria-label="Toggle AI Agent"
      >
        <span class="tb-action-icon" aria-hidden="true">
          <svg
            class="tb-icon-svg"
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="currentColor"
            fill-rule="evenodd"
          >
            <path
              d="M12 1.5C13.35 7.35 16.65 10.65 22.5 12C16.65 13.35 13.35 16.65 12 22.5C10.65 16.65 7.35 13.35 1.5 12C7.35 10.65 10.65 7.35 12 1.5ZM12 8.2C12.55 10.4 13.6 11.45 15.8 12C13.6 12.55 12.55 13.6 12 15.8C11.45 13.6 10.4 12.55 8.2 12C10.4 11.45 11.45 10.4 12 8.2Z"
            />
          </svg>
        </span>
        <span>AI Agent</span>
      </button>
    {/if}

    <button
      type="button"
      class="tb-btn settings-btn"
      onclick={() => (uiStore.settingsModalOpen = true)}
      title="Version, Updates & Project Links"
      aria-label="Open Settings"
    >
      <span class="tb-action-icon" aria-hidden="true">
        <svg
          class="tb-icon-svg"
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path
            d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
          />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </span>
      <span>Settings</span>
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

  .theme-btn,
  .agent-btn,
  .settings-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .settings-btn {
    position: relative;
  }

  .tb-action-icon {
    width: 18px;
    height: 18px;
    font-size: 18px;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .tb-icon-svg {
    width: 18px;
    height: 18px;
    display: block;
    flex-shrink: 0;
  }

  .theme-btn > span:not(.tb-action-icon),
  .agent-btn > span:not(.tb-action-icon),
  .settings-btn > span:not(.tb-action-icon):not(.update-dot) {
    text-box: trim-both cap alphabetic;
  }

  .agent-btn.active-agent {
    background: var(--accent-soft);
    border-color: var(--accent-primary);
    color: var(--accent-primary);
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

  .template-dropdown {
    position: relative;
  }

  .template-trigger {
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    text-align: left;
    color: var(--text-primary);
  }

  .template-trigger-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .template-caret {
    color: var(--text-secondary);
    font-size: 11px;
    flex-shrink: 0;
  }

  .dropdown-menu.template-menu {
    left: 0;
    right: auto;
    top: 48px;
    width: 268px;
  }

  .template-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    color: var(--text-primary);
  }

  .template-option.active {
    background: var(--accent-soft);
    border-color: var(--accent-primary);
    color: var(--accent-primary);
  }

  .template-check {
    font-size: 12px;
    font-weight: 700;
  }

  .recent-dropdown {
    position: relative;
  }

  .recent-trigger {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: var(--text-primary);
  }

  .recent-count {
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent-primary);
    font-size: 11px;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .dropdown-menu.recent-menu {
    left: 0;
    right: auto;
    top: 48px;
    width: 340px;
    max-width: calc(100vw - 32px);
  }

  .recent-menu-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .recent-clear-btn {
    border: none;
    background: transparent;
    padding: 2px 6px;
    border-radius: 5px;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-secondary);
  }

  .recent-clear-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .recent-empty {
    padding: 12px 8px;
    font-size: 12px;
    line-height: 1.45;
    color: var(--text-secondary);
    text-align: center;
  }

  .recent-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 340px;
    overflow-y: auto;
  }

  .recent-item-row {
    display: flex;
    align-items: stretch;
    gap: 4px;
  }

  .recent-item-btn {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    color: var(--text-primary);
  }

  .recent-item-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12.5px;
    font-weight: 700;
  }

  .recent-item-meta {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 10.5px;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .recent-remove-btn {
    flex-shrink: 0;
    width: 26px;
    border-radius: 7px;
    border: 1px solid transparent;
    background: var(--bg-elevated);
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .recent-remove-btn:hover {
    border-color: var(--border-strong);
    background: var(--bg-hover);
    color: var(--status-error);
  }
</style>

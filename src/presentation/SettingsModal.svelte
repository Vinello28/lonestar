<script lang="ts">
  import {
    AGENT_PRESET_DEFAULTS,
    agentStore,
  } from '../application/agentStore.svelte';
  import {
    isMacPlatform,
    MAX_UI_ZOOM,
    MIN_UI_ZOOM,
    uiStore,
  } from '../application/uiStore.svelte';
  import { updateStore } from '../application/updateStore.svelte';
  import {
    isTauriRuntime,
    type AgentProviderPreset,
  } from '../infrastructure/backendAdapter';
  import CowboyPandaIcon from './shapes/CowboyPandaIcon.svelte';

  function closeModal() {
    uiStore.settingsModalOpen = false;
  }

  function handleOverlayKey(e: KeyboardEvent) {
    if (e.key === 'Escape') closeModal();
  }
</script>

{#if uiStore.settingsModalOpen}
  <div
    class="modal-backdrop"
    role="dialog"
    aria-modal="true"
    aria-labelledby="settings-modal-title"
    tabindex="-1"
    onkeydown={handleOverlayKey}
    onclick={(e) => {
      if (e.target === e.currentTarget) closeModal();
    }}
  >
    <div class="settings-card">
      <div class="settings-header">
        <div class="settings-brand">
          <CowboyPandaIcon size={54} />
          <div>
            <h2 id="settings-modal-title">LoneStar Settings</h2>
            <div class="version-pills">
              <span class="ver-badge">Version v{updateStore.appVersion}</span>
              <span class="platform-badge">
                {updateStore.platform} · {updateStore.arch}
              </span>
              <span class="runtime-badge">
                {isTauriRuntime() ? 'Native Desktop' : 'Web Studio'}
              </span>
            </div>
          </div>
        </div>
        <button
          type="button"
          class="close-btn"
          onclick={closeModal}
          aria-label="Close Settings"
        >
          ✕
        </button>
      </div>

      <section class="settings-section">
        <div class="section-head">
          <h3>Software Updates</h3>
          {#if updateStore.lastCheckedAt}
            <span class="checked-time">Last check: {updateStore.lastCheckedAt}</span>
          {/if}
        </div>

        <label class="toggle-row">
          <input
            type="checkbox"
            checked={updateStore.autoUpdateOnStartup}
            onchange={(e) =>
              updateStore.setAutoUpdateOnStartup(
                (e.target as HTMLInputElement).checked,
              )}
          />
          <span>
            Check and download new releases automatically on startup
          </span>
        </label>

        <div
          class="update-status-box"
          class:is-available={updateStore.status === 'available' ||
            updateStore.status === 'installed'}
          class:is-error={updateStore.status === 'error'}
        >
          <div class="status-text">
            {updateStore.statusMessage ||
              `Installed version v${updateStore.appVersion} — ready to check GitHub Releases for ${updateStore.platform}.`}
          </div>

          {#if updateStore.status === 'downloading'}
            <div class="progress-track" aria-label="Download progress">
              <div
                class="progress-fill"
                style={`width:${updateStore.progressPercent}%`}
              ></div>
            </div>
          {/if}

          {#if updateStore.releaseNotes && (updateStore.status === 'available' || updateStore.status === 'installed')}
            <pre class="release-notes">{updateStore.releaseNotes}</pre>
          {/if}
        </div>

        <div class="update-actions">
          <button
            type="button"
            class="btn btn-primary"
            disabled={updateStore.status === 'checking' ||
              updateStore.status === 'downloading'}
            onclick={() =>
              updateStore.checkForUpdates({ silent: false, autoDownload: false })}
          >
            {updateStore.status === 'checking'
              ? 'Checking…'
              : 'Check for Updates'}
          </button>

          {#if updateStore.status === 'available'}
            <button
              type="button"
              class="btn btn-accent"
              onclick={() => updateStore.downloadAndInstallPending(false)}
            >
              Download & Install v{updateStore.latestVersion}
            </button>
          {/if}

          {#if updateStore.status === 'installed' && isTauriRuntime()}
            <button
              type="button"
              class="btn btn-accent"
              onclick={() => updateStore.relaunchApp()}
            >
              Restart App to Apply
            </button>
          {/if}
        </div>
      </section>

      <section class="settings-section">
        <h3>Appearance</h3>
        <div class="theme-row">
          <span class="theme-desc">
            Warm non-bluish surface palette (Alabaster Light / Obsidian Dark)
          </span>
          <button
            type="button"
            class="btn theme-switch-btn"
            onclick={() => uiStore.toggleTheme()}
          >
            <span class="theme-switch-icon" aria-hidden="true">
              {uiStore.theme === 'light' ? '☾' : '☀'}
            </span>
            <span>
              {uiStore.theme === 'light'
                ? 'Switch to Dark'
                : 'Switch to Light'}
            </span>
          </button>
        </div>

        {#if isTauriRuntime()}
          <div class="theme-row ui-zoom-row">
            <span class="theme-desc">
              Interface scale ({isMacPlatform() ? '⌘+/⌘−/⌘0' : 'Ctrl+/Ctrl−/Ctrl+0'})
            </span>
            <div class="ui-zoom-controls">
              <button
                type="button"
                class="btn"
                disabled={uiStore.uiZoom <= MIN_UI_ZOOM}
                onclick={() => void uiStore.zoomUiOut()}
                aria-label="Zoom Out GUI"
                title={isMacPlatform() ? 'Zoom Out GUI (⌘−)' : 'Zoom Out GUI (Ctrl+−)'}
              >
                −
              </button>
              <button
                type="button"
                class="btn ui-zoom-reset"
                onclick={() => void uiStore.resetUiZoom()}
                aria-label="Reset GUI Zoom to 100%"
                title="Reset GUI Zoom to 100%"
              >
                {Math.round(uiStore.uiZoom * 100)}%
              </button>
              <button
                type="button"
                class="btn"
                disabled={uiStore.uiZoom >= MAX_UI_ZOOM}
                onclick={() => void uiStore.zoomUiIn()}
                aria-label="Zoom In GUI"
                title={isMacPlatform() ? 'Zoom In GUI (⌘+)' : 'Zoom In GUI (Ctrl++)'}
              >
                +
              </button>
            </div>
          </div>
        {/if}
      </section>

      {#if isTauriRuntime()}
        <section class="settings-section">
          <div class="section-head">
            <h3>Local &amp; Cloud AI Agent</h3>
            <span class="checked-time">Desktop only · OpenAI-compatible</span>
          </div>

          <div class="agent-grid">
            <label class="agent-field">
              <span>Provider Preset</span>
              <select
                value={agentStore.config.providerPreset}
                onchange={(e) =>
                  agentStore.applyPreset(
                    (e.target as HTMLSelectElement).value as AgentProviderPreset,
                  )}
              >
                {#each Object.entries(AGENT_PRESET_DEFAULTS) as [key, spec]}
                  <option value={key}>{spec.label}</option>
                {/each}
                <option value="custom">Custom OpenAI-Compatible</option>
              </select>
            </label>

            <label class="agent-field">
              <span>Temperature ({agentStore.config.temperature.toFixed(1)})</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={agentStore.config.temperature}
                oninput={(e) =>
                  agentStore.updateConfig({
                    temperature: parseFloat((e.target as HTMLInputElement).value),
                  })}
              />
            </label>
          </div>

          <label class="agent-field">
            <span>API Base URL</span>
            <input
              type="text"
              value={agentStore.config.baseUrl}
              placeholder="http://localhost:1234/v1"
              onchange={(e) =>
                agentStore.updateConfig({
                  baseUrl: (e.target as HTMLInputElement).value,
                })}
            />
          </label>

          <div class="agent-model-row">
            <label class="agent-field agent-model-input">
              <span>Model ID</span>
              <input
                type="text"
                value={agentStore.config.model}
                placeholder="google/gemma-4-e4b"
                onchange={(e) =>
                  agentStore.updateConfig({
                    model: (e.target as HTMLInputElement).value,
                  })}
              />
            </label>
            <button
              type="button"
              class="btn"
              onclick={() => void agentStore.detectModels()}
            >
              Detect Local Models
            </button>
          </div>

          {#if agentStore.availableModels.length > 0}
            <div class="detected-models">
              {#each agentStore.availableModels as m}
                <button
                  type="button"
                  class="detected-pill"
                  class:active={agentStore.config.model === m}
                  onclick={() => agentStore.updateConfig({ model: m })}
                >
                  {m}
                </button>
              {/each}
            </div>
          {/if}

          {#if agentStore.connectionMessage}
            <div
              class="agent-conn-note"
              class:ok={agentStore.connectionStatus === 'ok'}
              class:err={agentStore.connectionStatus === 'error'}
            >
              {agentStore.connectionMessage}
            </div>
          {/if}

          <label class="agent-field">
            <span>API Key (optional — leave blank for LM Studio / Ollama)</span>
            <input
              type="password"
              value={agentStore.config.apiKey}
              placeholder="sk-…"
              onchange={(e) =>
                agentStore.updateConfig({
                  apiKey: (e.target as HTMLInputElement).value,
                })}
            />
          </label>

          <label class="toggle-row">
            <input
              type="checkbox"
              checked={agentStore.config.includeIstarDocs}
              onchange={(e) =>
                agentStore.updateConfig({
                  includeIstarDocs: (e.target as HTMLInputElement).checked,
                })}
            />
            <span>Include iStar 2.0 Metamodel Guide in System Prompt</span>
          </label>
        </section>
      {/if}

      <section class="settings-section">
        <h3>Project & Downloads</h3>
        <div class="links-grid">
          <a
            href={updateStore.githubPageUrl}
            class="ext-link-card"
            onclick={(e) => {
              e.preventDefault();
              updateStore.openExternalLink(updateStore.githubPageUrl);
            }}
          >
            <strong>🌐 Official GitHub Page</strong>
            <span>Showcase, iStar 2.0 guide & OS installers</span>
            <code>{updateStore.githubPageUrl}</code>
          </a>

          <a
            href={updateStore.githubReleasesUrl}
            class="ext-link-card"
            onclick={(e) => {
              e.preventDefault();
              updateStore.openExternalLink(updateStore.githubReleasesUrl);
            }}
          >
            <strong>📦 GitHub Releases & Source</strong>
            <span>Download builds for Linux, Windows & macOS</span>
            <code>{updateStore.githubRepoUrl}</code>
          </a>
        </div>
      </section>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 120;
    background: rgba(20, 18, 15, 0.56);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }

  .settings-card {
    width: 100%;
    max-width: 560px;
    max-height: 90vh;
    overflow-y: auto;
    background: var(--bg-surface);
    border: 1px solid var(--border-strong);
    border-radius: 16px;
    box-shadow: var(--shadow-panel);
    padding: 22px 24px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .settings-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .settings-brand {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .settings-brand h2 {
    margin: 0 0 6px;
    font-size: 19px;
    font-weight: 800;
  }

  .version-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .ver-badge,
  .platform-badge,
  .runtime-badge {
    font-size: 11px;
    font-weight: 700;
    padding: 3px 9px;
    border-radius: 999px;
    border: 1px solid var(--border-subtle);
    background: var(--bg-elevated);
  }

  .ver-badge {
    background: var(--accent-soft);
    border-color: var(--accent-primary);
    color: var(--accent-primary);
  }

  .close-btn {
    border: 1px solid var(--border-subtle);
    background: var(--bg-elevated);
    border-radius: 8px;
    width: 32px;
    height: 32px;
    font-weight: 700;
    cursor: pointer;
  }

  .close-btn:hover {
    border-color: var(--border-strong);
    background: var(--bg-hover);
  }

  .settings-section {
    border-top: 1px solid var(--border-subtle);
    padding-top: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }

  .settings-section h3 {
    margin: 0;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-secondary);
  }

  .checked-time {
    font-size: 11px;
    color: var(--text-secondary);
  }

  .toggle-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    cursor: pointer;
  }

  .update-status-box {
    background: var(--bg-elevated);
    border: 1px solid var(--border-subtle);
    border-radius: 10px;
    padding: 11px 13px;
    font-size: 12.5px;
    line-height: 1.45;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .update-status-box.is-available {
    border-color: var(--accent-primary);
    background: var(--accent-soft);
  }

  .update-status-box.is-error {
    border-color: var(--status-error);
  }

  .progress-track {
    width: 100%;
    height: 7px;
    background: var(--bg-surface);
    border-radius: 999px;
    overflow: hidden;
    border: 1px solid var(--border-subtle);
  }

  .progress-fill {
    height: 100%;
    background: var(--accent-primary);
    transition: width 0.15s ease;
  }

  .release-notes {
    margin: 0;
    font-family: inherit;
    font-size: 11.5px;
    white-space: pre-wrap;
    color: var(--text-secondary);
    max-height: 90px;
    overflow-y: auto;
  }

  .update-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .btn {
    padding: 8px 14px;
    border-radius: 8px;
    border: 1px solid var(--border-subtle);
    background: var(--bg-elevated);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn:hover:not(:disabled) {
    border-color: var(--border-strong);
    background: var(--bg-hover);
  }

  .btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .btn-primary,
  .btn-accent {
    background: var(--accent-primary);
    border-color: var(--accent-primary);
    color: #fffaf3;
  }

  .btn-primary:hover:not(:disabled),
  .btn-accent:hover:not(:disabled) {
    background: var(--accent-primary-hover);
    border-color: var(--accent-primary-hover);
  }

  .theme-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }

  .theme-desc {
    font-size: 12.5px;
    color: var(--text-secondary);
  }

  .theme-switch-btn {
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }

  .theme-switch-icon {
    font-size: 18px;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .ui-zoom-controls {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .ui-zoom-reset {
    min-width: 62px;
    text-align: center;
  }

  .links-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .ext-link-card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 11px 12px;
    border-radius: 10px;
    border: 1px solid var(--border-subtle);
    background: var(--bg-elevated);
    text-decoration: none;
    color: var(--text-primary);
    transition: border-color 0.14s, background-color 0.14s;
  }

  .ext-link-card:hover {
    border-color: var(--accent-primary);
    background: var(--bg-hover);
  }

  .ext-link-card strong {
    font-size: 13px;
  }

  .ext-link-card span {
    font-size: 11.5px;
    color: var(--text-secondary);
  }

  .ext-link-card code {
    font-size: 10.5px;
    color: var(--accent-primary);
    word-break: break-all;
  }

  .agent-grid {
    display: grid;
    grid-template-columns: 1.4fr 1fr;
    gap: 10px;
  }

  .agent-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .agent-field > span {
    font-size: 11px;
    font-weight: 700;
    color: var(--text-secondary);
  }

  .agent-field input[type='text'],
  .agent-field input[type='password'],
  .agent-field select {
    padding: 7px 10px;
    border-radius: 8px;
    border: 1px solid var(--border-strong);
    background: var(--bg-elevated);
    font-size: 12.5px;
    outline: none;
  }

  .agent-field input[type='text']:focus,
  .agent-field input[type='password']:focus,
  .agent-field select:focus {
    border-color: var(--accent-primary);
  }

  .agent-model-row {
    display: flex;
    align-items: flex-end;
    gap: 8px;
  }

  .agent-model-input {
    flex: 1;
  }

  .detected-models {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .detected-pill {
    padding: 3px 9px;
    border-radius: 999px;
    border: 1px solid var(--border-subtle);
    background: var(--bg-elevated);
    font-size: 11px;
    font-weight: 600;
  }

  .detected-pill.active {
    background: var(--accent-soft);
    border-color: var(--accent-primary);
    color: var(--accent-primary);
  }

  .agent-conn-note {
    font-size: 11.5px;
    color: var(--text-secondary);
  }

  .agent-conn-note.ok {
    color: var(--status-success);
  }

  .agent-conn-note.err {
    color: var(--status-error);
  }
</style>

<script lang="ts">
  import {
    AGENT_PRESET_DEFAULTS,
    agentStore,
  } from '../application/agentStore.svelte';
  import { modelStore } from '../application/modelStore.svelte';
  import { uiStore } from '../application/uiStore.svelte';
  import type { AgentProviderPreset } from '../infrastructure/backendAdapter';

  interface Props {
    onAfterModelUpdate?: () => void;
  }

  let { onAfterModelUpdate }: Props = $props();

  let draftPrompt = $state('');
  let showQuickConfig = $state(false);
  let messagesContainer: HTMLDivElement | null = $state(null);
  let textareaRef: HTMLTextAreaElement | null = $state(null);

  let selectionSummary = $derived.by(() => {
    const sel = uiStore.selection;
    if (!sel) {
      return `Whole Diagram (${modelStore.model.actors.length} actors, ${modelStore.model.elements.length} elements)`;
    }
    if (sel.type === 'actor') {
      const a = modelStore.model.actors.find((x) => x.id === sel.id);
      return a ? `Selected: ${a.kind} "${a.name}"` : 'Selected: Actor';
    }
    if (sel.type === 'element') {
      const e = modelStore.model.elements.find((x) => x.id === sel.id);
      return e ? `Selected: ${e.kind} "${e.name}"` : 'Selected: Element';
    }
    if (sel.type === 'link') {
      const l = modelStore.model.links.find((x) => x.id === sel.id);
      return l ? `Selected: ${l.kind} link` : 'Selected: Link';
    }
    const d = modelStore.model.dependencies.find((x) => x.id === sel.id);
    return d
      ? `Selected: Dependency "${d.dependumName}"`
      : 'Selected: Dependency';
  });

  $effect(() => {
    void agentStore.messages.length;
    void agentStore.busy;
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  });

  async function submitPrompt(text: string) {
    const clean = text.trim();
    if (!clean || agentStore.busy) return;
    draftPrompt = '';
    await agentStore.sendPrompt(clean, onAfterModelUpdate);
  }

  function handleComposerKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submitPrompt(draftPrompt);
    }
  }

  function handlePrefillRequirements() {
    draftPrompt =
      'Generate a complete iStar 2.0 model from scratch for: ';
    textareaRef?.focus();
  }
</script>

<aside class="agent-panel" aria-label="AI Modeling Agent">
  <div class="agent-header">
    <div class="agent-title-wrap">
      <span class="agent-title">
        <span class="agent-title-icon" aria-hidden="true">
          <svg
            class="agent-icon-svg"
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="currentColor"
            fill-rule="evenodd"
          >
            <path
              d="M12 1.5C13.35 7.35 16.65 10.65 22.5 12C16.65 13.35 13.35 16.65 12 22.5C10.65 16.65 7.35 13.35 1.5 12C7.35 10.65 10.65 7.35 12 1.5ZM12 8.2C12.55 10.4 13.6 11.45 15.8 12C13.6 12.55 12.55 13.6 12 15.8C11.45 13.6 10.4 12.55 8.2 12C10.4 11.45 11.45 10.4 12 8.2Z"
            />
          </svg>
        </span>
        <span>AI Agent</span>
      </span>
      <button
        type="button"
        class="model-pill"
        onclick={() => (showQuickConfig = !showQuickConfig)}
        title="Quick-switch local or cloud LLM provider & model"
      >
        <span>{agentStore.config.model || 'Select model…'}</span>
        <span class="caret">{showQuickConfig ? '▴' : '▾'}</span>
      </button>
    </div>

    <div class="header-actions">
      <button
        type="button"
        class="mini-btn"
        onclick={() => void agentStore.detectModels()}
        title="Detect loaded models from endpoint"
      >
        ↻ Detect
      </button>
      <button
        type="button"
        class="mini-btn icon-mini-btn"
        onclick={() => (uiStore.settingsModalOpen = true)}
        title="Open AI Provider Settings"
        aria-label="Open AI Settings"
      >
        <svg
          class="agent-icon-svg"
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path
            d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
          />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>
      {#if agentStore.messages.length > 0}
        <button
          type="button"
          class="mini-btn"
          onclick={() => agentStore.clearConversation()}
          title="Clear conversation"
        >
          Clear
        </button>
      {/if}
      <button
        type="button"
        class="mini-btn close-x"
        onclick={() => (uiStore.agentPanelOpen = false)}
        title="Close AI Agent panel"
        aria-label="Close AI Agent"
      >
        ✕
      </button>
    </div>
  </div>

  {#if showQuickConfig || agentStore.connectionStatus === 'error'}
    <div class="quick-config">
      <div class="qc-row">
        <label class="qc-field">
          <span>Provider</span>
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

        <label class="qc-field">
          <span>Model</span>
          {#if agentStore.availableModels.length > 0}
            <select
              value={agentStore.config.model}
              onchange={(e) =>
                agentStore.updateConfig({
                  model: (e.target as HTMLSelectElement).value,
                })}
            >
              {#if !agentStore.availableModels.includes(agentStore.config.model)}
                <option value={agentStore.config.model}>
                  {agentStore.config.model} (custom)
                </option>
              {/if}
              {#each agentStore.availableModels as m}
                <option value={m}>{m}</option>
              {/each}
            </select>
          {:else}
            <input
              type="text"
              value={agentStore.config.model}
              placeholder="e.g. google/gemma-4-e4b"
              onchange={(e) =>
                agentStore.updateConfig({
                  model: (e.target as HTMLInputElement).value,
                })}
            />
          {/if}
        </label>
      </div>

      {#if agentStore.connectionMessage}
        <div
          class="conn-status"
          class:ok={agentStore.connectionStatus === 'ok'}
          class:err={agentStore.connectionStatus === 'error'}
        >
          {agentStore.connectionMessage}
        </div>
      {/if}
    </div>
  {/if}

  <div class="context-bar">
    <span class="context-badge" title={selectionSummary}>
      {selectionSummary}
    </span>
    {#if modelStore.issues.length > 0}
      <span class="issues-pill" class:has-err={modelStore.errorCount > 0}>
        {modelStore.issues.length} issue(s)
      </span>
    {/if}
  </div>

  <div class="quick-chips">
    <button
      type="button"
      class="chip-btn"
      disabled={agentStore.busy}
      onclick={() =>
        void submitPrompt(
          uiStore.selection
            ? 'Refine the currently selected entity by adding relevant sub-goals, tasks, or resources in iStar 2.0.'
            : 'Refine the main goals in this diagram into actionable tasks and required resources.',
        )}
    >
      Refine selected
    </button>
    <button
      type="button"
      class="chip-btn"
      disabled={agentStore.busy}
      onclick={() =>
        void submitPrompt(
          'Add meaningful non-functional Qualities (softgoals) and connect tasks/goals to them using contribution links (make, help, hurt, break).',
        )}
    >
      Add Quality & Contributions
    </button>
    <button
      type="button"
      class="chip-btn"
      disabled={agentStore.busy}
      onclick={() =>
        void submitPrompt(
          'Inspect any active iStar 2.0 metamodel validation errors or warnings and fix them cleanly.',
        )}
    >
      Fix validation issues
    </button>
    <button
      type="button"
      class="chip-btn"
      disabled={agentStore.busy}
      onclick={handlePrefillRequirements}
    >
      Generate from requirements…
    </button>
  </div>

  <div class="agent-messages" bind:this={messagesContainer}>
    {#if agentStore.messages.length === 0}
      <div class="welcome-card">
        <strong>Ready for local or cloud i* 2.0 modeling</strong>
        <p>
          Configured for <code>{agentStore.config.baseUrl}</code> with
          <code>{agentStore.config.model}</code>. Every diagram edit runs through
          LoneStar's iStar 2.0 validator &amp; auto-layout and supports one-click
          <strong>Undo</strong>.
        </p>
      </div>
    {:else}
      {#each agentStore.messages as entry (entry.id)}
        <article
          class="msg-card"
          class:user={entry.role === 'user'}
          class:assistant={entry.role === 'assistant'}
          class:is-error={entry.isError}
        >
          <div class="msg-head">
            <span class="msg-role">
              {entry.role === 'user' ? 'You' : 'LoneStar AI'}
            </span>
            {#if entry.mutatedModel}
              <button
                type="button"
                class="undo-inline-btn"
                disabled={!modelStore.canUndo}
                onclick={() => modelStore.undo()}
                title="Undo diagram changes (Ctrl+Z)"
              >
                ↶ Undo
              </button>
            {/if}
          </div>

          <div class="msg-body">{entry.content}</div>

          {#if entry.appliedOperations.length > 0}
            <details class="ops-details">
              <summary>
                Applied Operations ({entry.appliedOperations.length})
              </summary>
              <ul>
                {#each entry.appliedOperations as opLine}
                  <li>{opLine}</li>
                {/each}
              </ul>
            </details>
          {/if}

          {#if entry.repairedWarnings.length > 0}
            <details class="repair-details">
              <summary>
                Auto-Repaired Metamodel Rules ({entry.repairedWarnings.length})
              </summary>
              <ul>
                {#each entry.repairedWarnings as warn}
                  <li>{warn}</li>
                {/each}
              </ul>
            </details>
          {/if}

          {#if entry.errors.length > 0 && !entry.isError}
            <details class="err-details" open>
              <summary>Unresolved Issues ({entry.errors.length})</summary>
              <ul>
                {#each entry.errors as errLine}
                  <li>{errLine}</li>
                {/each}
              </ul>
            </details>
          {/if}
        </article>
      {/each}
    {/if}

    {#if agentStore.busy}
      <div class="thinking-card" role="status">
        Thinking with <strong>{agentStore.config.model}</strong>…
      </div>
    {/if}
  </div>

  <div class="agent-composer">
    <textarea
      bind:this={textareaRef}
      bind:value={draftPrompt}
      rows="3"
      placeholder="Ask LoneStar AI to build, refine, or validate i* 2.0… (Enter to send)"
      disabled={agentStore.busy}
      onkeydown={handleComposerKeydown}
    ></textarea>
    <div class="composer-footer">
      <span class="composer-hint">Shift+Enter for newline · Auto-layout enabled</span>
      <button
        type="button"
        class="send-btn"
        disabled={agentStore.busy || !draftPrompt.trim()}
        onclick={() => void submitPrompt(draftPrompt)}
      >
        {agentStore.busy ? 'Running…' : 'Send'}
      </button>
    </div>
  </div>
</aside>

<style>
  .agent-panel {
    width: 344px;
    flex-shrink: 0;
    background: var(--bg-surface);
    border-left: 1px solid var(--border-subtle);
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .agent-header {
    padding: 11px 12px;
    border-bottom: 1px solid var(--border-subtle);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .agent-title-wrap {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .agent-title {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-weight: 800;
    font-size: 12.5px;
    color: var(--accent-primary);
  }

  .agent-title-icon {
    width: 16px;
    height: 16px;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .agent-icon-svg {
    width: 16px;
    height: 16px;
    display: block;
    flex-shrink: 0;
  }

  .model-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    max-width: 175px;
    padding: 2px 7px;
    border-radius: 999px;
    border: 1px solid var(--border-subtle);
    background: var(--bg-elevated);
    font-size: 10.5px;
    font-weight: 600;
    color: var(--text-secondary);
    text-align: left;
  }

  .model-pill span:first-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .model-pill:hover {
    border-color: var(--border-strong);
    background: var(--bg-hover);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .mini-btn {
    height: 26px;
    padding: 0 7px;
    border-radius: 6px;
    border: 1px solid var(--border-subtle);
    background: var(--bg-elevated);
    font-size: 11px;
    font-weight: 600;
  }

  .icon-mini-btn {
    width: 26px;
    padding: 0;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .mini-btn:hover {
    border-color: var(--border-strong);
    background: var(--bg-hover);
  }

  .quick-config {
    padding: 9px 12px;
    border-bottom: 1px solid var(--border-subtle);
    background: var(--bg-elevated);
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .qc-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 7px;
  }

  .qc-field {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .qc-field span {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    color: var(--text-secondary);
  }

  .qc-field select,
  .qc-field input {
    width: 100%;
    padding: 5px 7px;
    border-radius: 6px;
    border: 1px solid var(--border-strong);
    background: var(--bg-surface);
    font-size: 11.5px;
    outline: none;
  }

  .conn-status {
    font-size: 11px;
    line-height: 1.35;
    color: var(--text-secondary);
  }

  .conn-status.ok {
    color: var(--status-success);
  }

  .conn-status.err {
    color: var(--status-error);
  }

  .context-bar {
    padding: 7px 12px;
    border-bottom: 1px solid var(--border-subtle);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .context-badge {
    font-size: 11px;
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .issues-pill {
    flex-shrink: 0;
    font-size: 10px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 6px;
    background: var(--bg-elevated);
    color: var(--status-warning);
  }

  .issues-pill.has-err {
    color: var(--status-error);
  }

  .quick-chips {
    padding: 8px 12px;
    border-bottom: 1px solid var(--border-subtle);
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }

  .chip-btn {
    padding: 4px 8px;
    border-radius: 999px;
    border: 1px solid var(--border-subtle);
    background: var(--bg-elevated);
    font-size: 11px;
    font-weight: 600;
  }

  .chip-btn:hover:not(:disabled) {
    border-color: var(--accent-primary);
    background: var(--accent-soft);
    color: var(--accent-primary);
  }

  .chip-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .agent-messages {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    user-select: text;
  }

  .welcome-card {
    padding: 12px;
    border-radius: 10px;
    border: 1px solid var(--border-subtle);
    background: var(--bg-elevated);
    font-size: 12px;
    line-height: 1.45;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .welcome-card p {
    margin: 0;
    color: var(--text-secondary);
  }

  .welcome-card code {
    font-size: 11px;
    padding: 1px 4px;
    border-radius: 4px;
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
  }

  .msg-card {
    padding: 10px 11px;
    border-radius: 10px;
    border: 1px solid var(--border-subtle);
    background: var(--bg-elevated);
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .msg-card.user {
    background: var(--accent-soft);
    border-color: var(--border-strong);
  }

  .msg-card.is-error {
    border-color: var(--status-error);
  }

  .msg-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .msg-role {
    font-size: 10.5px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-secondary);
  }

  .undo-inline-btn {
    padding: 2px 7px;
    border-radius: 6px;
    border: 1px solid var(--border-strong);
    background: var(--bg-surface);
    font-size: 10.5px;
    font-weight: 700;
  }

  .undo-inline-btn:hover:not(:disabled) {
    border-color: var(--accent-primary);
    color: var(--accent-primary);
  }

  .undo-inline-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .msg-body {
    font-size: 12.5px;
    line-height: 1.45;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .ops-details,
  .repair-details,
  .err-details {
    border-radius: 7px;
    padding: 6px 8px;
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    font-size: 11px;
  }

  .ops-details summary,
  .repair-details summary,
  .err-details summary {
    cursor: pointer;
    font-weight: 700;
  }

  .ops-details summary {
    color: var(--status-success);
  }

  .repair-details summary {
    color: var(--status-warning);
  }

  .err-details summary {
    color: var(--status-error);
  }

  .ops-details ul,
  .repair-details ul,
  .err-details ul {
    margin: 6px 0 0;
    padding-left: 16px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    color: var(--text-secondary);
  }

  .thinking-card {
    padding: 9px 11px;
    border-radius: 9px;
    border: 1px dashed var(--border-strong);
    background: var(--bg-elevated);
    font-size: 12px;
    color: var(--text-secondary);
  }

  .agent-composer {
    padding: 10px 12px 12px;
    border-top: 1px solid var(--border-subtle);
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .agent-composer textarea {
    width: 100%;
    resize: none;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid var(--border-strong);
    background: var(--bg-elevated);
    font-size: 12.5px;
    line-height: 1.4;
    outline: none;
    user-select: text;
  }

  .agent-composer textarea:focus {
    border-color: var(--accent-primary);
  }

  .composer-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .composer-hint {
    font-size: 10.5px;
    color: var(--text-muted);
  }

  .send-btn {
    padding: 6px 14px;
    border-radius: 8px;
    border: 1px solid var(--accent-primary);
    background: var(--accent-primary);
    color: #fffaf3;
    font-size: 12px;
    font-weight: 700;
  }

  .send-btn:hover:not(:disabled) {
    background: var(--accent-primary-hover);
    border-color: var(--accent-primary-hover);
  }

  .send-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
</style>

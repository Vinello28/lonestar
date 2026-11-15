<script lang="ts">
  import { modelStore } from '../application/modelStore.svelte';
  import { uiStore } from '../application/uiStore.svelte';
  import type { ElementKind } from '../domain/types';

  let name = $state('');
  let kind = $state<ElementKind>('goal');

  $effect(() => {
    if (uiStore.pendingDependency) {
      const el = uiStore.pendingDependency.dependerElementId
        ? modelStore.model.elements.find(
            (e) => e.id === uiStore.pendingDependency?.dependerElementId,
          )
        : null;
      kind = el?.kind ?? 'goal';
      name = '';
    }
  });

  let dependerActor = $derived(
    uiStore.pendingDependency
      ? modelStore.model.actors.find(
          (a) => a.id === uiStore.pendingDependency?.dependerActorId,
        )
      : null,
  );
  let dependeeActor = $derived(
    uiStore.pendingDependency
      ? modelStore.model.actors.find(
          (a) => a.id === uiStore.pendingDependency?.dependeeActorId,
        )
      : null,
  );

  function submit(e: Event) {
    e.preventDefault();
    const draft = uiStore.pendingDependency;
    if (!draft) return;
    const dep = modelStore.addDependency({
      dependerActorId: draft.dependerActorId,
      dependerElementId: draft.dependerElementId,
      dependeeActorId: draft.dependeeActorId,
      dependeeElementId: draft.dependeeElementId,
      dependumName: name.trim() || 'Shared Dependency',
      dependumKind: kind,
      x: draft.x,
      y: draft.y,
    });
    uiStore.selection = { type: 'dependency', id: dep.id };
    uiStore.closeDependencyPrompt();
    uiStore.notify('Social dependency created', 'success');
  }
</script>

{#if uiStore.pendingDependency}
  <div
    class="modal-backdrop"
    role="dialog"
    aria-modal="true"
    aria-label="Create Social Dependency"
    tabindex="-1"
    onkeydown={(e) => {
      if (e.key === 'Escape') uiStore.closeDependencyPrompt();
    }}
  >
    <button
      type="button"
      class="backdrop-dismiss"
      aria-label="Close dependency dialog"
      onclick={() => uiStore.closeDependencyPrompt()}
    ></button>
    <form class="modal-card" onsubmit={submit}>
      <div class="modal-header">
        <h3>New Social Dependency (i* 2.0)</h3>
        <button
          type="button"
          class="close-btn"
          onclick={() => uiStore.closeDependencyPrompt()}
          aria-label="Cancel"
        >
          ×
        </button>
      </div>

      <p class="route-summary">
        <strong>{dependerActor?.name ?? 'Depender'}</strong>
        <span>depends on</span>
        <strong>{dependeeActor?.name ?? 'Dependee'}</strong>
      </p>

      <label class="field">
        <span>Dependum Label</span>
        <!-- svelte-ignore a11y_autofocus -->
        <input
          type="text"
          bind:value={name}
          placeholder="e.g., Flight Ticket, Approved Budget..."
          autofocus
        />
      </label>

      <div class="field">
        <span>Dependum Type</span>
        <div class="kind-grid">
          {#each ['goal', 'quality', 'task', 'resource'] as k}
            <button
              type="button"
              class="kind-pill"
              class:active={kind === k}
              onclick={() => (kind = k as ElementKind)}
            >
              {k}
            </button>
          {/each}
        </div>
      </div>

      <div class="modal-actions">
        <button
          type="button"
          class="btn-secondary"
          onclick={() => uiStore.closeDependencyPrompt()}
        >
          Cancel
        </button>
        <button type="submit" class="btn-primary">Create Dependency</button>
      </div>
    </form>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(20, 18, 15, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 60;
    backdrop-filter: blur(2px);
  }

  .backdrop-dismiss {
    position: absolute;
    inset: 0;
    border: none;
    background: transparent;
    padding: 0;
    cursor: default;
  }

  .modal-card {
    position: relative;
    z-index: 1;
    width: 380px;
    background: var(--bg-surface);
    border: 1px solid var(--border-strong);
    border-radius: 12px;
    padding: 18px;
    box-shadow: var(--shadow-panel);
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .modal-header h3 {
    margin: 0;
    font-size: 14.5px;
    font-weight: 600;
  }

  .close-btn {
    background: transparent;
    border: none;
    font-size: 18px;
    line-height: 1;
    color: var(--text-secondary);
    padding: 2px 6px;
    border-radius: 6px;
  }

  .close-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .route-summary {
    margin: 0;
    padding: 9px 12px;
    border-radius: 8px;
    background: var(--bg-elevated);
    font-size: 12px;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .route-summary strong {
    color: var(--text-primary);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field > span {
    font-size: 11.5px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .field input {
    background: var(--bg-elevated);
    border: 1px solid var(--border-strong);
    border-radius: 8px;
    padding: 8px 10px;
    outline: none;
  }

  .field input:focus {
    border-color: var(--accent-primary);
  }

  .kind-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
  }

  .kind-pill {
    text-transform: capitalize;
    padding: 7px 6px;
    border-radius: 8px;
    border: 1px solid var(--border-subtle);
    background: var(--bg-elevated);
    font-weight: 500;
    font-size: 12px;
  }

  .kind-pill.active {
    background: var(--accent-soft);
    border-color: var(--accent-primary);
    color: var(--accent-primary);
    font-weight: 600;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }

  .btn-secondary,
  .btn-primary {
    padding: 8px 14px;
    border-radius: 8px;
    font-weight: 600;
    border: 1px solid var(--border-strong);
  }

  .btn-secondary {
    background: var(--bg-elevated);
  }

  .btn-primary {
    background: var(--accent-primary);
    border-color: var(--accent-primary);
    color: #fffaf3;
  }
</style>

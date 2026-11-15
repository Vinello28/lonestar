<script lang="ts">
  import { modelStore } from '../application/modelStore.svelte';
  import { uiStore } from '../application/uiStore.svelte';
  import { formatLinkLabel } from '../domain/istarRules';
  import type {
    ActorKind,
    ContributionValue,
    ElementKind,
    LinkKind,
  } from '../domain/types';

  let selectedActor = $derived(
    uiStore.selection?.type === 'actor'
      ? modelStore.model.actors.find((a) => a.id === uiStore.selection?.id) ??
          null
      : null,
  );

  let selectedElement = $derived(
    uiStore.selection?.type === 'element'
      ? modelStore.model.elements.find((e) => e.id === uiStore.selection?.id) ??
          null
      : null,
  );

  let selectedLink = $derived(
    uiStore.selection?.type === 'link'
      ? modelStore.model.links.find((l) => l.id === uiStore.selection?.id) ??
          null
      : null,
  );

  let selectedDep = $derived(
    uiStore.selection?.type === 'dependency'
      ? modelStore.model.dependencies.find(
          (d) => d.id === uiStore.selection?.id,
        ) ?? null
      : null,
  );

  function resolveName(id: string): string {
    return (
      modelStore.model.actors.find((a) => a.id === id)?.name ??
      modelStore.model.elements.find((e) => e.id === id)?.name ??
      id
    );
  }

  function changeLinkKind(linkId: string, nextKind: LinkKind) {
    const err = modelStore.updateLinkKind(linkId, nextKind);
    if (err) uiStore.notify(err, 'error');
  }

  function focusEntity(entityId: string | null) {
    if (!entityId) return;
    if (modelStore.model.actors.some((a) => a.id === entityId)) {
      uiStore.selection = { type: 'actor', id: entityId };
    } else if (modelStore.model.elements.some((e) => e.id === entityId)) {
      uiStore.selection = { type: 'element', id: entityId };
    } else if (modelStore.model.links.some((l) => l.id === entityId)) {
      uiStore.selection = { type: 'link', id: entityId };
    } else if (modelStore.model.dependencies.some((d) => d.id === entityId)) {
      uiStore.selection = { type: 'dependency', id: entityId };
    }
  }
</script>

<aside class="inspector" aria-label="Properties and Validation Inspector">
  {#if selectedActor}
    <div class="panel-header">
      <span>Actor Properties</span>
      <span class="badge">{selectedActor.kind}</span>
    </div>

    <label class="field">
      <span>Name</span>
      <input
        type="text"
        value={selectedActor.name}
        onchange={(e) =>
          modelStore.updateActor(selectedActor!.id, {
            name: (e.target as HTMLInputElement).value,
          })}
      />
    </label>

    <div class="field">
      <span>Classification</span>
      <div class="pill-row">
        {#each ['actor', 'agent', 'role'] as k}
          <button
            type="button"
            class="pill"
            class:active={selectedActor.kind === k}
            onclick={() =>
              modelStore.updateActor(selectedActor!.id, {
                kind: k as ActorKind,
              })}
          >
            {k}
          </button>
        {/each}
      </div>
    </div>

    <div class="field">
      <span>Boundary View</span>
      <button
        type="button"
        class="action-btn"
        onclick={() =>
          modelStore.updateActor(selectedActor!.id, {
            collapsed: !selectedActor!.collapsed,
          })}
      >
        {selectedActor.collapsed
          ? 'Expand Strategic Rationale (SR)'
          : 'Collapse to Strategic Dependency (SD)'}
      </button>
    </div>

    <button
      type="button"
      class="danger-btn"
      onclick={() => {
        modelStore.removeActor(selectedActor!.id);
        uiStore.selection = null;
      }}
    >
      Delete Actor & Contents
    </button>
  {:else if selectedElement}
    <div class="panel-header">
      <span>Intentional Element</span>
      <span class="badge">{selectedElement.kind}</span>
    </div>

    <label class="field">
      <span>Label</span>
      <input
        type="text"
        value={selectedElement.name}
        onchange={(e) =>
          modelStore.updateElement(selectedElement!.id, {
            name: (e.target as HTMLInputElement).value,
          })}
      />
    </label>

    <div class="field">
      <span>Element Kind</span>
      <div class="pill-grid">
        {#each ['goal', 'quality', 'task', 'resource'] as k}
          <button
            type="button"
            class="pill"
            class:active={selectedElement.kind === k}
            onclick={() =>
              modelStore.updateElement(selectedElement!.id, {
                kind: k as ElementKind,
              })}
          >
            {k}
          </button>
        {/each}
      </div>
    </div>

    <label class="field">
      <span>Owner Actor Boundary</span>
      <select
        value={selectedElement.actorId ?? ''}
        onchange={(e) => {
          const val = (e.target as HTMLSelectElement).value || null;
          modelStore.updateElement(selectedElement!.id, { actorId: val });
        }}
      >
        <option value="">(Unassigned Orphan)</option>
        {#each modelStore.model.actors as a}
          <option value={a.id}>{a.name} ({a.kind})</option>
        {/each}
      </select>
    </label>

    <button
      type="button"
      class="danger-btn"
      onclick={() => {
        modelStore.removeElement(selectedElement!.id);
        uiStore.selection = null;
      }}
    >
      Delete Element
    </button>
  {:else if selectedLink}
    <div class="panel-header">
      <span>iStar 2.0 Link</span>
      <span class="badge">{formatLinkLabel(selectedLink)}</span>
    </div>

    <div class="endpoint-box">
      <div><strong>From:</strong> {resolveName(selectedLink.sourceId)}</div>
      <div><strong>To:</strong> {resolveName(selectedLink.targetId)}</div>
    </div>

    {#if selectedLink.kind === 'andRefinement' || selectedLink.kind === 'orRefinement'}
      <div class="field">
        <span>Refinement Semantics</span>
        <div class="pill-row">
          <button
            type="button"
            class="pill"
            class:active={selectedLink.kind === 'andRefinement'}
            onclick={() =>
              changeLinkKind(selectedLink!.id, { kind: 'andRefinement' })}
          >
            AND
          </button>
          <button
            type="button"
            class="pill"
            class:active={selectedLink.kind === 'orRefinement'}
            onclick={() =>
              changeLinkKind(selectedLink!.id, { kind: 'orRefinement' })}
          >
            OR
          </button>
        </div>
      </div>
    {:else if selectedLink.kind === 'contribution'}
      <div class="field">
        <span>Contribution Strength</span>
        <div class="pill-grid">
          {#each ['make', 'help', 'hurt', 'break'] as val}
            <button
              type="button"
              class="pill"
              class:active={selectedLink.value === val}
              onclick={() =>
                changeLinkKind(selectedLink!.id, {
                  kind: 'contribution',
                  value: val as ContributionValue,
                })}
            >
              {val}
            </button>
          {/each}
        </div>
      </div>
    {:else if selectedLink.kind === 'isA' || selectedLink.kind === 'participatesIn'}
      <div class="field">
        <span>Actor Association</span>
        <div class="pill-row">
          <button
            type="button"
            class="pill"
            class:active={selectedLink.kind === 'isA'}
            onclick={() => changeLinkKind(selectedLink!.id, { kind: 'isA' })}
          >
            is-a
          </button>
          <button
            type="button"
            class="pill"
            class:active={selectedLink.kind === 'participatesIn'}
            onclick={() =>
              changeLinkKind(selectedLink!.id, { kind: 'participatesIn' })}
          >
            participates-in
          </button>
        </div>
      </div>
    {/if}

    <button
      type="button"
      class="danger-btn"
      onclick={() => {
        modelStore.removeLink(selectedLink!.id);
        uiStore.selection = null;
      }}
    >
      Delete Link
    </button>
  {:else if selectedDep}
    <div class="panel-header">
      <span>Social Dependency</span>
      <span class="badge">{selectedDep.dependumKind}</span>
    </div>

    <div class="endpoint-box">
      <div>
        <strong>Depender:</strong> {resolveName(selectedDep.dependerActorId)}
      </div>
      <div>
        <strong>Dependee:</strong> {resolveName(selectedDep.dependeeActorId)}
      </div>
    </div>

    <label class="field">
      <span>Dependum Label</span>
      <input
        type="text"
        value={selectedDep.dependumName}
        onchange={(e) =>
          modelStore.updateDependency(selectedDep!.id, {
            dependumName: (e.target as HTMLInputElement).value,
          })}
      />
    </label>

    <div class="field">
      <span>Dependum Type</span>
      <div class="pill-grid">
        {#each ['goal', 'quality', 'task', 'resource'] as k}
          <button
            type="button"
            class="pill"
            class:active={selectedDep.dependumKind === k}
            onclick={() =>
              modelStore.updateDependency(selectedDep!.id, {
                dependumKind: k as ElementKind,
              })}
          >
            {k}
          </button>
        {/each}
      </div>
    </div>

    <button
      type="button"
      class="danger-btn"
      onclick={() => {
        modelStore.removeDependency(selectedDep!.id);
        uiStore.selection = null;
      }}
    >
      Delete Dependency
    </button>
  {:else}
    <div class="panel-header">
      <span>iStar 2.0 Inspector</span>
    </div>
    <p class="empty-hint">
      Click any Actor, Element, Link, or Dependency to inspect its properties, or
      double-click directly on the canvas to rename.
    </p>
  {/if}

  <div class="divider"></div>

  <section class="validation-section">
    <div class="panel-header">
      <span>Metamodel Check</span>
      <span
        class="status-pill"
        class:ok={modelStore.issues.length === 0}
        class:err={modelStore.errorCount > 0}
      >
        {modelStore.issues.length === 0
          ? 'Clean'
          : `${modelStore.issues.length} issue(s)`}
      </span>
    </div>

    {#if modelStore.issues.length === 0}
      <p class="ok-msg">
        All actors, links, refinements, and dependencies conform to the iStar 2.0
        Language Guide.
      </p>
    {:else}
      <div class="issue-list">
        {#each modelStore.issues as issue (issue.id)}
          <button
            type="button"
            class="issue-item"
            class:error={issue.severity === 'error'}
            onclick={() => focusEntity(issue.entityId)}
          >
            <span class="issue-rule">{issue.rule}</span>
            <span class="issue-msg">{issue.message}</span>
          </button>
        {/each}
      </div>
    {/if}
  </section>

  <section class="shortcuts-section">
    <div class="section-mini-title">Shortcuts</div>
    <ul>
      <li><kbd>Double-Click</kbd> Rename shape inline</li>
      <li><kbd>Click Pill</kbd> Cycle make/help/hurt/break or AND/OR</li>
      <li><kbd>Del</kbd> Delete selected</li>
      <li><kbd>Ctrl+Z / Y</kbd> Undo / Redo</li>
      <li><kbd>F</kbd> Fit diagram to screen</li>
    </ul>
  </section>
</aside>

<style>
  .inspector {
    width: 268px;
    flex-shrink: 0;
    background: var(--bg-surface);
    border-left: 1px solid var(--border-subtle);
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow-y: auto;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-weight: 700;
    font-size: 12.5px;
  }

  .badge {
    text-transform: uppercase;
    font-size: 10px;
    padding: 2px 7px;
    border-radius: 6px;
    background: var(--accent-soft);
    color: var(--accent-primary);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .field > span {
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-secondary);
  }

  .field input,
  .field select {
    background: var(--bg-elevated);
    border: 1px solid var(--border-strong);
    border-radius: 7px;
    padding: 7px 9px;
    outline: none;
  }

  .field input:focus,
  .field select:focus {
    border-color: var(--accent-primary);
  }

  .pill-row {
    display: flex;
    gap: 6px;
  }

  .pill-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 6px;
  }

  .pill {
    flex: 1;
    padding: 6px 8px;
    border-radius: 7px;
    border: 1px solid var(--border-subtle);
    background: var(--bg-elevated);
    text-transform: capitalize;
    font-size: 11.5px;
    font-weight: 600;
  }

  .pill.active {
    background: var(--accent-soft);
    border-color: var(--accent-primary);
    color: var(--accent-primary);
  }

  .action-btn {
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid var(--border-strong);
    background: var(--bg-elevated);
    font-weight: 600;
    font-size: 11.5px;
  }

  .action-btn:hover {
    background: var(--bg-hover);
  }

  .danger-btn {
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid var(--status-error);
    background: transparent;
    color: var(--status-error);
    font-weight: 600;
    font-size: 12px;
  }

  .danger-btn:hover {
    background: rgba(168, 46, 36, 0.1);
  }

  .endpoint-box {
    padding: 9px 10px;
    border-radius: 8px;
    background: var(--bg-elevated);
    font-size: 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .empty-hint,
  .ok-msg {
    margin: 0;
    font-size: 12px;
    line-height: 1.45;
    color: var(--text-secondary);
  }

  .divider {
    height: 1px;
    background: var(--border-subtle);
  }

  .validation-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .status-pill {
    font-size: 10.5px;
    padding: 2px 7px;
    border-radius: 6px;
    background: rgba(166, 105, 20, 0.16);
    color: var(--status-warning);
  }

  .status-pill.ok {
    background: rgba(47, 111, 62, 0.16);
    color: var(--status-success);
  }

  .status-pill.err {
    background: rgba(168, 46, 36, 0.16);
    color: var(--status-error);
  }

  .issue-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 220px;
    overflow-y: auto;
  }

  .issue-item {
    text-align: left;
    padding: 8px;
    border-radius: 8px;
    border: 1px solid var(--border-subtle);
    border-left: 3px solid var(--status-warning);
    background: var(--bg-elevated);
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .issue-item.error {
    border-left-color: var(--status-error);
  }

  .issue-rule {
    font-size: 10px;
    font-weight: 700;
    color: var(--text-secondary);
  }

  .issue-msg {
    font-size: 11.5px;
    line-height: 1.35;
  }

  .shortcuts-section {
    margin-top: auto;
    padding-top: 8px;
    border-top: 1px solid var(--border-subtle);
  }

  .section-mini-title {
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-secondary);
    margin-bottom: 6px;
  }

  .shortcuts-section ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 11px;
    color: var(--text-secondary);
  }

  .shortcuts-section kbd {
    display: inline-block;
    padding: 1px 5px;
    border-radius: 4px;
    background: var(--bg-elevated);
    border: 1px solid var(--border-subtle);
    color: var(--text-primary);
    font-size: 10px;
    margin-right: 4px;
  }
</style>

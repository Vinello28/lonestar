<script lang="ts">
  import { uiStore } from '../application/uiStore.svelte';
  import type { ActiveTool, ActorKind, ElementKind } from '../domain/types';

  interface Props {
    onStartPaletteDrag: (
      e: PointerEvent,
      category: 'actor' | 'element',
      kind: ActorKind | ElementKind,
      label: string,
    ) => void;
    onQuickPlaceNode: (
      category: 'actor' | 'element',
      kind: ActorKind | ElementKind,
    ) => void;
  }

  let { onStartPaletteDrag, onQuickPlaceNode }: Props = $props();

  const actorItems: Array<{ kind: ActorKind; label: string; hint: string }> = [
    { kind: 'actor', label: 'Actor', hint: 'Generic autonomous entity' },
    { kind: 'agent', label: 'Agent', hint: 'Concrete person or system' },
    { kind: 'role', label: 'Role', hint: 'Abstract social behavior' },
  ];

  const elementItems: Array<{
    kind: ElementKind;
    label: string;
    hint: string;
  }> = [
    { kind: 'goal', label: 'Goal', hint: 'Desired state (the what)' },
    { kind: 'quality', label: 'Quality', hint: 'Softgoal / NFR criterion' },
    { kind: 'task', label: 'Task', hint: 'Operational action (the how)' },
    { kind: 'resource', label: 'Resource', hint: 'Physical or digital item' },
  ];

  const linkTools: Array<{ id: ActiveTool; label: string; shortcut: string }> = [
    { id: 'select', label: 'Select / Move', shortcut: 'V' },
    { id: 'smart-link', label: 'Smart Connect', shortcut: 'L' },
    { id: 'andRefinement', label: 'AND-Refinement', shortcut: '1' },
    { id: 'orRefinement', label: 'OR-Refinement', shortcut: '2' },
    { id: 'neededBy', label: 'Needed-By', shortcut: '3' },
    { id: 'contribution', label: 'Contribution', shortcut: '4' },
    { id: 'qualification', label: 'Qualification', shortcut: '5' },
    { id: 'dependency', label: 'Dependency (D)', shortcut: '6' },
    { id: 'isA', label: 'is-a (Actors)', shortcut: '7' },
    { id: 'participatesIn', label: 'participates-in', shortcut: '8' },
  ];

  function handlePointerDown(
    e: PointerEvent,
    category: 'actor' | 'element',
    kind: ActorKind | ElementKind,
    label: string,
  ) {
    if (e.button !== 0) return;
    onStartPaletteDrag(e, category, kind, label);
  }
</script>

<aside class="palette" aria-label="iStar 2.0 Modeling Palette">
  <section class="palette-section">
    <div class="section-title">Actors (Drag to Board)</div>
    <div class="node-grid">
      {#each actorItems as item}
        <button
          type="button"
          class="palette-item"
          title={`${item.hint} — Drag onto board or click to add`}
          onpointerdown={(e) =>
            handlePointerDown(e, 'actor', item.kind, item.label)}
          onclick={() => onQuickPlaceNode('actor', item.kind)}
        >
          <svg viewBox="0 0 40 34" class="mini-svg">
            <circle
              cx="20"
              cy="17"
              r="13"
              fill="var(--actor-fill)"
              stroke="var(--actor-stroke)"
              stroke-width="1.8"
            />
            {#if item.kind === 'agent'}
              <line
                x1="9"
                y1="11"
                x2="31"
                y2="11"
                stroke="var(--actor-stroke)"
                stroke-width="1.6"
              />
            {:else if item.kind === 'role'}
              <path
                d="M 9 23 Q 20 29 31 23"
                fill="none"
                stroke="var(--actor-stroke)"
                stroke-width="1.6"
              />
            {/if}
          </svg>
          <span>{item.label}</span>
        </button>
      {/each}
    </div>
  </section>

  <section class="palette-section">
    <div class="section-title">Intentional Elements</div>
    <div class="node-grid">
      {#each elementItems as item}
        <button
          type="button"
          class="palette-item"
          title={`${item.hint} — Drag inside an Actor boundary`}
          onpointerdown={(e) =>
            handlePointerDown(e, 'element', item.kind, item.label)}
          onclick={() => onQuickPlaceNode('element', item.kind)}
        >
          <svg viewBox="0 0 48 30" class="mini-svg">
            {#if item.kind === 'goal'}
              <rect
                x="4"
                y="4"
                width="40"
                height="22"
                rx="11"
                fill="var(--goal-fill)"
                stroke="var(--goal-stroke)"
                stroke-width="1.7"
              />
            {:else if item.kind === 'quality'}
              <path
                d="M 10 10 C 13 3, 21 3, 24 7 C 29 3, 40 5, 42 12 C 46 17, 43 25, 35 26 C 30 29, 21 29, 17 25 C 10 27, 3 22, 6 16 C 3 12, 6 8, 10 10 Z"
                fill="var(--quality-fill)"
                stroke="var(--quality-stroke)"
                stroke-width="1.6"
              />
            {:else if item.kind === 'task'}
              <polygon
                points="3,15 11,4 37,4 45,15 37,26 11,26"
                fill="var(--task-fill)"
                stroke="var(--task-stroke)"
                stroke-width="1.7"
              />
            {:else}
              <rect
                x="5"
                y="5"
                width="38"
                height="20"
                rx="2"
                fill="var(--resource-fill)"
                stroke="var(--resource-stroke)"
                stroke-width="1.7"
              />
            {/if}
          </svg>
          <span>{item.label}</span>
        </button>
      {/each}
    </div>
  </section>

  <section class="palette-section">
    <div class="section-title">Tools & Links</div>
    <div class="tool-list">
      {#each linkTools as tool}
        <button
          type="button"
          class="tool-btn"
          class:active={uiStore.activeTool === tool.id}
          onclick={() => (uiStore.activeTool = tool.id)}
        >
          <span class="tool-label">{tool.label}</span>
          <kbd>{tool.shortcut}</kbd>
        </button>
      {/each}
    </div>
  </section>

  <div class="palette-tip">
    <strong>Zero-code Tip:</strong> Hover any node and drag from an amber port
    to auto-create valid i* 2.0 links or Dependencies!
  </div>
</aside>

<style>
  .palette {
    width: 228px;
    flex-shrink: 0;
    background: var(--bg-surface);
    border-right: 1px solid var(--border-subtle);
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
    overflow-y: auto;
  }

  .palette-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .section-title {
    font-size: 10.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-secondary);
  }

  .node-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 6px;
  }

  .palette-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 8px 6px;
    border-radius: 9px;
    background: var(--bg-elevated);
    border: 1px solid var(--border-subtle);
    transition: border-color 0.12s, background-color 0.12s, transform 0.12s;
    cursor: grab;
  }

  .palette-item:hover {
    border-color: var(--accent-primary);
    background: var(--bg-hover);
    transform: translateY(-1px);
  }

  .palette-item:active {
    cursor: grabbing;
  }

  .mini-svg {
    width: 44px;
    height: 30px;
    pointer-events: none;
  }

  .palette-item span {
    font-size: 11.5px;
    font-weight: 600;
  }

  .tool-list {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .tool-btn {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 9px;
    border-radius: 7px;
    border: 1px solid transparent;
    background: transparent;
    text-align: left;
    font-size: 12px;
    font-weight: 500;
  }

  .tool-btn:hover {
    background: var(--bg-elevated);
  }

  .tool-btn.active {
    background: var(--accent-soft);
    border-color: var(--accent-primary);
    color: var(--accent-primary);
    font-weight: 600;
  }

  .tool-btn kbd {
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 4px;
    background: var(--bg-elevated);
    border: 1px solid var(--border-subtle);
    color: var(--text-secondary);
  }

  .palette-tip {
    margin-top: auto;
    padding: 9px 10px;
    border-radius: 8px;
    background: var(--bg-elevated);
    border: 1px solid var(--border-subtle);
    font-size: 11px;
    line-height: 1.45;
    color: var(--text-secondary);
  }

  .palette-tip strong {
    color: var(--text-primary);
  }
</style>

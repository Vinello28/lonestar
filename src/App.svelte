<script lang="ts">
  import { onMount } from 'svelte';
  import { modelStore } from './application/modelStore.svelte';
  import { uiStore } from './application/uiStore.svelte';
  import { updateStore } from './application/updateStore.svelte';
  import { findActorAtPoint } from './domain/istarRules';
  import type { ActorKind, ElementKind } from './domain/types';
  import { isTauriRuntime } from './infrastructure/backendAdapter';
  import AgentPanel from './presentation/AgentPanel.svelte';
  import Canvas, { type ActivePaletteGhost } from './presentation/Canvas.svelte';
  import DependencyModal from './presentation/DependencyModal.svelte';
  import Inspector from './presentation/Inspector.svelte';
  import Palette from './presentation/Palette.svelte';
  import SettingsModal from './presentation/SettingsModal.svelte';
  import Toolbar from './presentation/Toolbar.svelte';

  let svgRef: SVGSVGElement | null = $state(null);
  let canvasRef: Canvas | null = $state(null);

  let pendingDragStart: {
    category: 'actor' | 'element';
    kind: ActorKind | ElementKind;
    label: string;
    startX: number;
    startY: number;
  } | null = $state(null);

  let paletteGhost: ActivePaletteGhost | null = $state(null);
  let justFinishedPaletteDrag = false;

  onMount(async () => {
    uiStore.initTheme();
    await modelStore.initFromBackend();
    setTimeout(() => canvasRef?.fitToScreen(), 30);
    void updateStore.initOnStartup();
  });

  function handleStartPaletteDrag(
    e: PointerEvent,
    category: 'actor' | 'element',
    kind: ActorKind | ElementKind,
    label: string,
  ) {
    pendingDragStart = {
      category,
      kind,
      label,
      startX: e.clientX,
      startY: e.clientY,
    };
  }

  function handleGlobalPointerMove(e: PointerEvent) {
    if (!pendingDragStart) return;
    const dist = Math.hypot(
      e.clientX - pendingDragStart.startX,
      e.clientY - pendingDragStart.startY,
    );
    if (!paletteGhost && dist >= 6) {
      paletteGhost = {
        category: pendingDragStart.category,
        kind: pendingDragStart.kind,
        label: pendingDragStart.label,
        clientX: e.clientX,
        clientY: e.clientY,
      };
    } else if (paletteGhost) {
      paletteGhost.clientX = e.clientX;
      paletteGhost.clientY = e.clientY;
    }
  }

  function handleGlobalPointerUp(e: PointerEvent) {
    if (paletteGhost && svgRef && canvasRef) {
      const rect = svgRef.getBoundingClientRect();
      const insideCanvas =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;

      if (insideCanvas) {
        const pt = canvasRef.clientToWorld(e.clientX, e.clientY);
        placeNodeAtWorld(paletteGhost.category, paletteGhost.kind, pt.x, pt.y);
      }
      justFinishedPaletteDrag = true;
      setTimeout(() => (justFinishedPaletteDrag = false), 80);
    }
    pendingDragStart = null;
    paletteGhost = null;
  }

  function handleQuickPlaceNode(
    category: 'actor' | 'element',
    kind: ActorKind | ElementKind,
  ) {
    if (justFinishedPaletteDrag) return;
    if (!svgRef || !canvasRef) return;
    const rect = svgRef.getBoundingClientRect();
    const centerWorld = canvasRef.clientToWorld(
      rect.left + rect.width * 0.5,
      rect.top + rect.height * 0.5,
    );
    placeNodeAtWorld(category, kind, centerWorld.x, centerWorld.y);
  }

  function placeNodeAtWorld(
    category: 'actor' | 'element',
    kind: ActorKind | ElementKind,
    wx: number,
    wy: number,
  ) {
    if (category === 'actor') {
      const created = modelStore.addActor(kind as ActorKind, wx, wy);
      uiStore.selection = { type: 'actor', id: created.id };
      uiStore.notify(`Added ${kind} "${created.name}"`, 'success');
      return;
    }

    const hostActor = findActorAtPoint(modelStore.model.actors, wx, wy);
    if (hostActor) {
      if (hostActor.collapsed) {
        modelStore.updateActor(hostActor.id, { collapsed: false });
      }
      const created = modelStore.addElement(
        kind as ElementKind,
        wx,
        wy,
        hostActor.id,
      );
      uiStore.selection = { type: 'element', id: created.id };
      uiStore.notify(`Added ${kind} inside ${hostActor.name}`, 'success');
    } else {
      // Auto-wrap in a new Actor if dropped on empty canvas, or attach if user prefers
      const actor = modelStore.addActor('actor', wx, wy, 'New Actor');
      const created = modelStore.addElement(
        kind as ElementKind,
        wx,
        wy + 16,
        actor.id,
      );
      uiStore.selection = { type: 'element', id: created.id };
      uiStore.notify(
        `Wrapped ${kind} in a new Actor boundary (i* 2.0)`,
        'info',
      );
    }
  }
</script>

<svelte:window
  onpointermove={handleGlobalPointerMove}
  onpointerup={handleGlobalPointerUp}
/>

<div class="studio-shell">
  <Toolbar
    {svgRef}
    onFitToScreen={() => canvasRef?.fitToScreen()}
  />

  <main class="workspace">
    <Palette
      onStartPaletteDrag={handleStartPaletteDrag}
      onQuickPlaceNode={handleQuickPlaceNode}
    />

    <Canvas
      bind:this={canvasRef}
      bind:svgRef={svgRef}
      {paletteGhost}
    />

    <Inspector />

    {#if isTauriRuntime() && uiStore.agentPanelOpen}
      <AgentPanel
        onAfterModelUpdate={() => setTimeout(() => canvasRef?.fitToScreen(), 25)}
      />
    {/if}
  </main>

  <DependencyModal />

  <SettingsModal />

  {#if paletteGhost}
    <div
      class="drag-ghost"
      style={`left:${paletteGhost.clientX + 12}px; top:${paletteGhost.clientY + 12}px;`}
    >
      + Drop {paletteGhost.label}
    </div>
  {/if}

  {#if uiStore.toast}
    <div
      class="toast"
      class:success={uiStore.toast.tone === 'success'}
      class:error={uiStore.toast.tone === 'error'}
      role="status"
    >
      {uiStore.toast.text}
    </div>
  {/if}
</div>

<style>
  .studio-shell {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: var(--bg-canvas);
    color: var(--text-primary);
  }

  .workspace {
    flex: 1;
    min-height: 0;
    display: flex;
    overflow: hidden;
  }

  .drag-ghost {
    position: fixed;
    z-index: 80;
    pointer-events: none;
    padding: 7px 12px;
    border-radius: 9px;
    background: var(--bg-surface);
    border: 2px solid var(--accent-primary);
    color: var(--accent-primary);
    font-weight: 700;
    font-size: 12px;
    box-shadow: var(--shadow-panel);
  }

  .toast {
    position: fixed;
    top: 66px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 70;
    padding: 8px 16px;
    border-radius: 999px;
    background: var(--bg-surface);
    border: 1px solid var(--border-strong);
    box-shadow: var(--shadow-panel);
    font-weight: 600;
    font-size: 12px;
  }

  .toast.success {
    border-color: var(--status-success);
    color: var(--status-success);
  }

  .toast.error {
    border-color: var(--status-error);
    color: var(--status-error);
  }
</style>

<script lang="ts">
  import { modelStore } from '../application/modelStore.svelte';
  import { uiStore } from '../application/uiStore.svelte';
  import {
    findActorAtPoint,
    resolveDragConnection,
  } from '../domain/istarRules';
  import type {
    Actor,
    ActorKind,
    ConnectionResolution,
    Dependency,
    ElementKind,
    IntentionalElement,
    Link,
  } from '../domain/types';
  import { backendAdapter } from '../infrastructure/backendAdapter';
  import { computeDiagramBounds } from '../infrastructure/exportService';
  import ActorNode from './shapes/ActorNode.svelte';
  import DependencyNode from './shapes/DependencyNode.svelte';
  import ElementNode from './shapes/ElementNode.svelte';
  import LinkEdge from './shapes/LinkEdge.svelte';

  export interface ActivePaletteGhost {
    category: 'actor' | 'element';
    kind: ActorKind | ElementKind;
    label: string;
    clientX: number;
    clientY: number;
  }

  interface Props {
    svgRef: SVGSVGElement | null;
    paletteGhost: ActivePaletteGhost | null;
    onCanvasWorldPoint?: (clientX: number, clientY: number) => { x: number; y: number };
  }

  let {
    svgRef = $bindable(null),
    paletteGhost = null,
  }: Props = $props();

  type DragState =
    | { type: 'none' }
    | { type: 'pan'; lastX: number; lastY: number }
    | {
        type: 'move-actor';
        actorId: string;
        lastWorldX: number;
        lastWorldY: number;
        snapshotTaken: boolean;
      }
    | {
        type: 'resize-actor';
        actorId: string;
        startWorldX: number;
        startWorldY: number;
        origW: number;
        origH: number;
        snapshotTaken: boolean;
      }
    | {
        type: 'move-element';
        elementId: string;
        lastWorldX: number;
        lastWorldY: number;
        snapshotTaken: boolean;
        hoverActorId: string | null;
      }
    | {
        type: 'move-dep';
        depId: string;
        lastWorldX: number;
        lastWorldY: number;
        snapshotTaken: boolean;
      }
    | {
        type: 'connect';
        sourceId: string;
        startX: number;
        startY: number;
        currX: number;
        currY: number;
        hoveredTargetId: string | null;
        resolution: ConnectionResolution | null;
      };

  let drag = $state<DragState>({ type: 'none' });
  let spacePressed = $state(false);
  let fileDragOver = $state(false);

  // Inline text edit overlay state
  let editing = $state<{
    kind: 'actor' | 'element' | 'dependency';
    id: string;
    value: string;
    screenX: number;
    screenY: number;
    width: number;
  } | null>(null);

  let issueEntityIds = $derived(
    new Set(
      modelStore.issues
        .map((i) => i.entityId)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  // Determine hovered actor boundary during palette drag of an element
  let paletteHoverActorId = $derived.by(() => {
    if (!paletteGhost || paletteGhost.category !== 'element' || !svgRef) {
      return null;
    }
    const pt = clientToWorld(paletteGhost.clientX, paletteGhost.clientY);
    return findActorAtPoint(modelStore.model.actors, pt.x, pt.y)?.id ?? null;
  });

  export function clientToWorld(
    clientX: number,
    clientY: number,
  ): { x: number; y: number } {
    if (!svgRef) return { x: clientX, y: clientY };
    const rect = svgRef.getBoundingClientRect();
    return {
      x: (clientX - rect.left - uiStore.panX) / uiStore.zoom,
      y: (clientY - rect.top - uiStore.panY) / uiStore.zoom,
    };
  }

  export function fitToScreen(): void {
    if (!svgRef) return;
    const rect = svgRef.getBoundingClientRect();
    const bounds = computeDiagramBounds(modelStore.model, 64);
    const scaleX = rect.width / bounds.width;
    const scaleY = rect.height / bounds.height;
    const nextZoom = Math.min(1.5, Math.max(0.3, Math.min(scaleX, scaleY)));
    uiStore.zoom = Number(nextZoom.toFixed(2));
    uiStore.panX =
      (rect.width - bounds.width * nextZoom) / 2 - bounds.minX * nextZoom;
    uiStore.panY =
      (rect.height - bounds.height * nextZoom) / 2 - bounds.minY * nextZoom;
  }

  function findTargetNodeAt(
    wx: number,
    wy: number,
    ignoreId: string,
  ): string | null {
    // Check elements top-most first
    for (let i = modelStore.model.elements.length - 1; i >= 0; i--) {
      const el = modelStore.model.elements[i];
      if (el.id === ignoreId) continue;
      if (
        wx >= el.x &&
        wx <= el.x + el.width &&
        wy >= el.y &&
        wy <= el.y + el.height
      ) {
        return el.id;
      }
    }
    // Then check actors
    const actor = findActorAtPoint(modelStore.model.actors, wx, wy);
    if (actor && actor.id !== ignoreId) {
      return actor.id;
    }
    return null;
  }

  function nodeCenterWorld(nodeId: string): { x: number; y: number } {
    const el = modelStore.model.elements.find((e) => e.id === nodeId);
    if (el) return { x: el.x + el.width / 2, y: el.y + el.height / 2 };
    const actor = modelStore.model.actors.find((a) => a.id === nodeId);
    if (actor) {
      return {
        x: actor.x + actor.width / 2,
        y: actor.collapsed ? actor.y + 42 : actor.y + actor.height / 2,
      };
    }
    return { x: 0, y: 0 };
  }

  function handleCanvasPointerDown(e: PointerEvent) {
    if (editing) commitEdit();
    if (e.button === 1 || (e.button === 0 && spacePressed) || e.button === 0) {
      uiStore.selection = null;
      drag = { type: 'pan', lastX: e.clientX, lastY: e.clientY };
    }
  }

  function handlePointerDownActor(e: PointerEvent, actor: Actor) {
    e.stopPropagation();
    if (editing) commitEdit();
    uiStore.selection = { type: 'actor', id: actor.id };

    if (uiStore.activeTool !== 'select') {
      const center = nodeCenterWorld(actor.id);
      startLinkDrag(e, actor.id, center.x, center.y);
      return;
    }

    const pt = clientToWorld(e.clientX, e.clientY);
    drag = {
      type: 'move-actor',
      actorId: actor.id,
      lastWorldX: pt.x,
      lastWorldY: pt.y,
      snapshotTaken: false,
    };
  }

  function handlePointerDownElement(e: PointerEvent, el: IntentionalElement) {
    e.stopPropagation();
    if (editing) commitEdit();
    uiStore.selection = { type: 'element', id: el.id };

    if (uiStore.activeTool !== 'select') {
      const center = nodeCenterWorld(el.id);
      startLinkDrag(e, el.id, center.x, center.y);
      return;
    }

    const pt = clientToWorld(e.clientX, e.clientY);
    drag = {
      type: 'move-element',
      elementId: el.id,
      lastWorldX: pt.x,
      lastWorldY: pt.y,
      snapshotTaken: false,
      hoverActorId: el.actorId,
    };
  }

  function handlePointerDownDep(e: PointerEvent, dep: Dependency) {
    e.stopPropagation();
    if (editing) commitEdit();
    uiStore.selection = { type: 'dependency', id: dep.id };
    const pt = clientToWorld(e.clientX, e.clientY);
    drag = {
      type: 'move-dep',
      depId: dep.id,
      lastWorldX: pt.x,
      lastWorldY: pt.y,
      snapshotTaken: false,
    };
  }

  function handleResizePointerDown(e: PointerEvent, actor: Actor) {
    e.stopPropagation();
    const pt = clientToWorld(e.clientX, e.clientY);
    drag = {
      type: 'resize-actor',
      actorId: actor.id,
      startWorldX: pt.x,
      startWorldY: pt.y,
      origW: actor.width,
      origH: actor.height,
      snapshotTaken: false,
    };
  }

  function startLinkDrag(
    e: PointerEvent,
    sourceId: string,
    px: number,
    py: number,
  ) {
    const pt = clientToWorld(e.clientX, e.clientY);
    drag = {
      type: 'connect',
      sourceId,
      startX: px,
      startY: py,
      currX: pt.x,
      currY: pt.y,
      hoveredTargetId: null,
      resolution: null,
    };
  }

  function handleWindowPointerMove(e: PointerEvent) {
    if (drag.type === 'none') return;

    if (drag.type === 'pan') {
      const dx = e.clientX - drag.lastX;
      const dy = e.clientY - drag.lastY;
      uiStore.panX += dx;
      uiStore.panY += dy;
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      return;
    }

    const pt = clientToWorld(e.clientX, e.clientY);

    if (drag.type === 'move-actor') {
      const dx = pt.x - drag.lastWorldX;
      const dy = pt.y - drag.lastWorldY;
      if (Math.hypot(dx, dy) < 0.01) return;
      if (!drag.snapshotTaken) {
        modelStore.pushHistory();
        drag.snapshotTaken = true;
      }
      modelStore.moveActorBy(drag.actorId, dx, dy);
      drag.lastWorldX = pt.x;
      drag.lastWorldY = pt.y;
      return;
    }

    if (drag.type === 'resize-actor') {
      const dw = pt.x - drag.startWorldX;
      const dh = pt.y - drag.startWorldY;
      if (!drag.snapshotTaken) {
        modelStore.pushHistory();
        drag.snapshotTaken = true;
      }
      modelStore.resizeActor(drag.actorId, drag.origW + dw, drag.origH + dh);
      return;
    }

    if (drag.type === 'move-element') {
      const dx = pt.x - drag.lastWorldX;
      const dy = pt.y - drag.lastWorldY;
      if (Math.hypot(dx, dy) < 0.01) return;
      if (!drag.snapshotTaken) {
        modelStore.pushHistory();
        drag.snapshotTaken = true;
      }
      const el = modelStore.model.elements.find((x) => x.id === drag.elementId);
      if (el) {
        const cx = el.x + dx + el.width / 2;
        const cy = el.y + dy + el.height / 2;
        const hoveredActor = findActorAtPoint(modelStore.model.actors, cx, cy);
        drag.hoverActorId = hoveredActor?.id ?? null;
        modelStore.moveElementBy(drag.elementId, dx, dy, hoveredActor?.id ?? null);
      }
      drag.lastWorldX = pt.x;
      drag.lastWorldY = pt.y;
      return;
    }

    if (drag.type === 'move-dep') {
      const dx = pt.x - drag.lastWorldX;
      const dy = pt.y - drag.lastWorldY;
      if (Math.hypot(dx, dy) < 0.01) return;
      if (!drag.snapshotTaken) {
        modelStore.pushHistory();
        drag.snapshotTaken = true;
      }
      modelStore.moveDependencyBy(drag.depId, dx, dy);
      drag.lastWorldX = pt.x;
      drag.lastWorldY = pt.y;
      return;
    }

    if (drag.type === 'connect') {
      drag.currX = pt.x;
      drag.currY = pt.y;
      const targetId = findTargetNodeAt(pt.x, pt.y, drag.sourceId);
      drag.hoveredTargetId = targetId;
      if (targetId) {
        const effectiveTool =
          uiStore.activeTool === 'select' ? 'smart-link' : uiStore.activeTool;
        drag.resolution = resolveDragConnection(
          modelStore.model,
          drag.sourceId,
          targetId,
          effectiveTool,
        );
      } else {
        drag.resolution = null;
      }
    }
  }

  function handleWindowPointerUp() {
    if (drag.type === 'connect') {
      const res = drag.resolution;
      if (res && res.valid) {
        if (
          res.mode === 'link' &&
          res.linkKind &&
          res.orientedSourceId &&
          res.orientedTargetId
        ) {
          const outcome = modelStore.addLink(
            res.orientedSourceId,
            res.orientedTargetId,
            res.linkKind,
          );
          if (outcome.ok && outcome.link) {
            uiStore.selection = { type: 'link', id: outcome.link.id };
            uiStore.notify(`Created ${res.hint}`, 'success');
          } else if (outcome.error) {
            uiStore.notify(outcome.error, 'error');
          }
        } else if (
          res.mode === 'dependency' &&
          res.dependerActorId &&
          res.dependeeActorId
        ) {
          const srcC = nodeCenterWorld(drag.sourceId);
          const dstC = drag.hoveredTargetId
            ? nodeCenterWorld(drag.hoveredTargetId)
            : { x: drag.currX, y: drag.currY };
          uiStore.openDependencyPrompt({
            dependerActorId: res.dependerActorId,
            dependerElementId: res.dependerElementId ?? null,
            dependeeActorId: res.dependeeActorId,
            dependeeElementId: res.dependeeElementId ?? null,
            x: Math.round((srcC.x + dstC.x) / 2 - 61),
            y: Math.round((srcC.y + dstC.y) / 2 - 24),
          });
        }
      } else if (res && !res.valid) {
        uiStore.notify(res.hint, 'error');
      }
    }
    drag = { type: 'none' };
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    if (!svgRef) return;
    const rect = svgRef.getBoundingClientRect();
    const focalX = e.clientX - rect.left;
    const focalY = e.clientY - rect.top;
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    uiStore.zoomBy(delta, focalX, focalY);
  }

  function openInlineEdit(
    kind: 'actor' | 'element' | 'dependency',
    id: string,
    currentName: string,
    wx: number,
    wy: number,
    widthWorld: number,
  ) {
    if (!svgRef) return;
    const rect = svgRef.getBoundingClientRect();
    editing = {
      kind,
      id,
      value: currentName,
      screenX: rect.left + uiStore.panX + wx * uiStore.zoom,
      screenY: rect.top + uiStore.panY + wy * uiStore.zoom,
      width: Math.max(130, widthWorld * uiStore.zoom),
    };
  }

  function commitEdit() {
    if (!editing) return;
    const trimmed = editing.value.trim();
    if (trimmed) {
      if (editing.kind === 'actor') {
        modelStore.updateActor(editing.id, { name: trimmed });
      } else if (editing.kind === 'element') {
        modelStore.updateElement(editing.id, { name: trimmed });
      } else {
        modelStore.updateDependency(editing.id, { dependumName: trimmed });
      }
    }
    editing = null;
  }

  function handleLinkBadgeClick(_e: MouseEvent, link: Link) {
    uiStore.selection = { type: 'link', id: link.id };
    if (link.kind === 'contribution') {
      modelStore.cycleContribution(link.id);
    } else if (link.kind === 'andRefinement' || link.kind === 'orRefinement') {
      modelStore.toggleRefinement(link.id);
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (e.code === 'Space') {
      spacePressed = true;
    }

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) modelStore.redo();
      else modelStore.undo();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      modelStore.redo();
      return;
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      const sel = uiStore.selection;
      if (!sel) return;
      e.preventDefault();
      if (sel.type === 'actor') modelStore.removeActor(sel.id);
      else if (sel.type === 'element') modelStore.removeElement(sel.id);
      else if (sel.type === 'link') modelStore.removeLink(sel.id);
      else if (sel.type === 'dependency') modelStore.removeDependency(sel.id);
      uiStore.selection = null;
      return;
    }

    if (e.key === 'Escape') {
      uiStore.activeTool = 'select';
      uiStore.selection = null;
      editing = null;
      return;
    }

    const shortcutMap: Record<string, typeof uiStore.activeTool> = {
      v: 'select',
      l: 'smart-link',
      '1': 'andRefinement',
      '2': 'orRefinement',
      '3': 'neededBy',
      '4': 'contribution',
      '5': 'qualification',
      '6': 'dependency',
      '7': 'isA',
      '8': 'participatesIn',
    };
    const keyLower = e.key.toLowerCase();
    if (shortcutMap[keyLower]) {
      uiStore.activeTool = shortcutMap[keyLower];
    } else if (keyLower === 'f') {
      fitToScreen();
    } else if (e.key === '0') {
      uiStore.resetViewport();
    }
  }

  function handleKeyUp(e: KeyboardEvent) {
    if (e.code === 'Space') spacePressed = false;
  }

  async function handleFileDrop(e: DragEvent) {
    e.preventDefault();
    fileDragOver = false;
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    const lowerName = file.name.toLowerCase();
    if (
      !lowerName.endsWith('.json') &&
      !lowerName.endsWith('.txt') &&
      !lowerName.endsWith('.istar')
    ) {
      uiStore.notify(
        'Drop a .json or .txt file (LoneStar or piStar 2.0 format).',
        'error',
      );
      return;
    }
    try {
      const text = await file.text();
      const loaded = await backendAdapter.importJsonModel(text);
      modelStore.replaceModel(loaded);
      uiStore.selection = null;
      fitToScreen();
      uiStore.notify(`Loaded "${loaded.name}"`, 'success');
    } catch (err) {
      uiStore.notify(`Import failed: ${String(err)}`, 'error');
    }
  }

  let visibleElements = $derived.by(() => {
    const collapsedActorIds = new Set(
      modelStore.model.actors.filter((a) => a.collapsed).map((a) => a.id),
    );
    return modelStore.model.elements.filter(
      (el) => !el.actorId || !collapsedActorIds.has(el.actorId),
    );
  });

  let visibleLinks = $derived.by(() => {
    const collapsedActorIds = new Set(
      modelStore.model.actors.filter((a) => a.collapsed).map((a) => a.id),
    );
    const hiddenElementIds = new Set(
      modelStore.model.elements
        .filter((e) => e.actorId && collapsedActorIds.has(e.actorId))
        .map((e) => e.id),
    );
    return modelStore.model.links.filter(
      (l) => !hiddenElementIds.has(l.sourceId) && !hiddenElementIds.has(l.targetId),
    );
  });
</script>

<svelte:window
  onpointermove={handleWindowPointerMove}
  onpointerup={handleWindowPointerUp}
  onkeydown={handleKeyDown}
  onkeyup={handleKeyUp}
/>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="canvas-wrapper"
  class:file-drop-active={fileDragOver}
  ondragover={(e) => {
    e.preventDefault();
    fileDragOver = true;
  }}
  ondragleave={() => (fileDragOver = false)}
  ondrop={handleFileDrop}
>
  <svg
    id="lonestar-diagram-svg"
    bind:this={svgRef}
    class="diagram-svg"
    class:panning={drag.type === 'pan' || spacePressed}
    onpointerdown={handleCanvasPointerDown}
    onwheel={handleWheel}
  >
    <defs>
      <!-- Subtle dotted drafting grid -->
      <pattern
        id="lonestar-dot-grid"
        width={24 * uiStore.zoom}
        height={24 * uiStore.zoom}
        patternUnits="userSpaceOnUse"
        x={uiStore.panX % (24 * uiStore.zoom)}
        y={uiStore.panY % (24 * uiStore.zoom)}
      >
        <circle cx="1.5" cy="1.5" r="1.2" fill="var(--bg-grid-dot)" />
      </pattern>

      <!-- OR-Refinement Solid Arrowhead -->
      <marker
        id="marker-or"
        viewBox="0 0 12 12"
        refX="10"
        refY="6"
        markerWidth="9"
        markerHeight="9"
        orient="auto-start-reverse"
      >
        <path d="M 1 1.5 L 11 6 L 1 10.5 Z" fill="var(--link-stroke)" />
      </marker>
      <marker
        id="marker-or-selected"
        viewBox="0 0 12 12"
        refX="10"
        refY="6"
        markerWidth="9"
        markerHeight="9"
        orient="auto-start-reverse"
      >
        <path d="M 1 1.5 L 11 6 L 1 10.5 Z" fill="var(--accent-primary)" />
      </marker>

      <!-- Open Arrowhead (Contribution, is-a, participates-in) -->
      <marker
        id="marker-open"
        viewBox="0 0 12 12"
        refX="10"
        refY="6"
        markerWidth="9"
        markerHeight="9"
        orient="auto-start-reverse"
      >
        <path
          d="M 2 2 L 10 6 L 2 10"
          fill="none"
          stroke="var(--link-stroke)"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </marker>
      <marker
        id="marker-open-selected"
        viewBox="0 0 12 12"
        refX="10"
        refY="6"
        markerWidth="9"
        markerHeight="9"
        orient="auto-start-reverse"
      >
        <path
          d="M 2 2 L 10 6 L 2 10"
          fill="none"
          stroke="var(--accent-primary)"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </marker>
    </defs>

    <!-- Background Drafting Grid (excluded from exports via editor-only) -->
    <rect
      class="editor-only"
      width="100%"
      height="100%"
      fill="url(#lonestar-dot-grid)"
      pointer-events="none"
    />

    <g
      id="lonestar-world"
      transform={`translate(${uiStore.panX}, ${uiStore.panY}) scale(${uiStore.zoom})`}
    >
      <!-- Layer 1: Actors & SR Boundaries -->
      {#each modelStore.model.actors as actor (actor.id)}
        {@const connTone =
          drag.type === 'connect' &&
          drag.hoveredTargetId === actor.id &&
          drag.resolution
            ? drag.resolution.valid
              ? 'valid'
              : 'invalid'
            : null}
        <ActorNode
          {actor}
          selected={uiStore.selection?.type === 'actor' &&
            uiStore.selection.id === actor.id}
          dropTargetActive={paletteHoverActorId === actor.id ||
            (drag.type === 'move-element' && drag.hoverActorId === actor.id)}
          connectionHighlight={connTone}
          hasIssue={issueEntityIds.has(actor.id)}
          onPointerDownActor={handlePointerDownActor}
          onDoubleClickActor={(a) =>
            openInlineEdit(
              'actor',
              a.id,
              a.name,
              a.x + a.width / 2 - 70,
              a.y + 4,
              140,
            )}
          onStartPortLink={startLinkDrag}
          onResizePointerDown={handleResizePointerDown}
          onToggleCollapse={(id) => {
            const a = modelStore.model.actors.find((x) => x.id === id);
            if (a) modelStore.updateActor(id, { collapsed: !a.collapsed });
          }}
        />
      {/each}

      <!-- Layer 2: Links -->
      {#each visibleLinks as link (link.id)}
        <LinkEdge
          {link}
          model={modelStore.model}
          selected={uiStore.selection?.type === 'link' &&
            uiStore.selection.id === link.id}
          onSelectLink={(_e, l) =>
            (uiStore.selection = { type: 'link', id: l.id })}
          onBadgeClick={handleLinkBadgeClick}
        />
      {/each}

      <!-- Layer 3: Social Dependencies -->
      {#each modelStore.model.dependencies as dep (dep.id)}
        <DependencyNode
          dependency={dep}
          model={modelStore.model}
          selected={uiStore.selection?.type === 'dependency' &&
            uiStore.selection.id === dep.id}
          onPointerDownDep={handlePointerDownDep}
          onDoubleClickDep={(d) =>
            openInlineEdit(
              'dependency',
              d.id,
              d.dependumName,
              d.x,
              d.y + 10,
              122,
            )}
        />
      {/each}

      <!-- Layer 4: Intentional Elements -->
      {#each visibleElements as el (el.id)}
        {@const connTone =
          drag.type === 'connect' &&
          drag.hoveredTargetId === el.id &&
          drag.resolution
            ? drag.resolution.valid
              ? 'valid'
              : 'invalid'
            : null}
        <ElementNode
          element={el}
          selected={uiStore.selection?.type === 'element' &&
            uiStore.selection.id === el.id}
          connectionHighlight={connTone}
          hasIssue={issueEntityIds.has(el.id)}
          onPointerDownElement={handlePointerDownElement}
          onDoubleClickElement={(item) =>
            openInlineEdit(
              'element',
              item.id,
              item.name,
              item.x,
              item.y + item.height / 2 - 14,
              item.width,
            )}
          onStartPortLink={startLinkDrag}
        />
      {/each}

      <!-- Live Link Preview Line -->
      {#if drag.type === 'connect'}
        {@const lineColor = drag.resolution
          ? drag.resolution.valid
            ? 'var(--status-success)'
            : 'var(--status-error)'
          : 'var(--accent-primary)'}
        <g class="editor-only" pointer-events="none">
          <line
            x1={drag.startX}
            y1={drag.startY}
            x2={drag.currX}
            y2={drag.currY}
            stroke={lineColor}
            stroke-width="2.2"
            stroke-dasharray="6 4"
          />
          <circle cx={drag.currX} cy={drag.currY} r="4.5" fill={lineColor} />
          {#if drag.resolution}
            {@const msg = drag.resolution.hint}
            {@const pillW = Math.min(340, Math.max(120, msg.length * 6.5 + 18))}
            <rect
              x={drag.currX + 12}
              y={drag.currY - 30}
              width={pillW}
              height="24"
              rx="6"
              fill="var(--bg-surface)"
              stroke={lineColor}
              stroke-width="1.3"
            />
            <text
              x={drag.currX + 20}
              y={drag.currY - 14}
              font-size="11"
              font-weight="600"
              fill={lineColor}
            >
              {msg}
            </text>
          {/if}
        </g>
      {/if}
    </g>
  </svg>

  <!-- Floating Inline Label Input -->
  {#if editing}
    <!-- svelte-ignore a11y_autofocus -->
    <input
      class="inline-rename-input"
      type="text"
      bind:value={editing.value}
      style={`left:${editing.screenX}px; top:${editing.screenY}px; width:${editing.width}px;`}
      autofocus
      onblur={commitEdit}
      onkeydown={(e) => {
        if (e.key === 'Enter') commitEdit();
        if (e.key === 'Escape') editing = null;
      }}
    />
  {/if}

  <!-- Bottom-left Active Tool Indicator & Stats -->
  <div class="canvas-hud-left">
    <span class="hud-chip">
      Mode: <strong>{uiStore.activeTool}</strong>
    </span>
    <span class="hud-chip">
      {modelStore.model.actors.length} Actors · {modelStore.model.elements.length} Elements · {modelStore.model.dependencies.length} Deps
    </span>
  </div>

  <!-- Bottom-right Zoom & Validation Controls -->
  <div class="canvas-hud-right">
    <button
      type="button"
      class="hud-btn validation-chip"
      class:has-errors={modelStore.errorCount > 0}
      class:has-warnings={modelStore.errorCount === 0 && modelStore.warningCount > 0}
      onclick={() =>
        (uiStore.validationDrawerOpen = !uiStore.validationDrawerOpen)}
    >
      {#if modelStore.errorCount === 0 && modelStore.warningCount === 0}
        ✓ Valid i* 2.0
      {:else}
        {modelStore.errorCount} Errors · {modelStore.warningCount} Warnings
      {/if}
    </button>

    <div class="zoom-bar">
      <button type="button" onclick={() => uiStore.zoomBy(-0.1)} title="Zoom Out">
        −
      </button>
      <button
        type="button"
        class="zoom-readout"
        onclick={fitToScreen}
        title="Fit Diagram to Screen (F)"
      >
        {Math.round(uiStore.zoom * 100)}%
      </button>
      <button type="button" onclick={() => uiStore.zoomBy(0.1)} title="Zoom In">
        +
      </button>
    </div>
  </div>

  {#if fileDragOver}
    <div class="file-drop-overlay">
      <div>Drop .json or .txt file to load into LoneStar</div>
    </div>
  {/if}
</div>

<style>
  .canvas-wrapper {
    position: relative;
    flex: 1;
    min-width: 0;
    height: 100%;
    background: var(--bg-canvas);
    overflow: hidden;
  }

  .diagram-svg {
    width: 100%;
    height: 100%;
    display: block;
    cursor: default;
  }

  .diagram-svg.panning {
    cursor: grab;
  }

  .inline-rename-input {
    position: fixed;
    z-index: 40;
    padding: 5px 8px;
    border-radius: 7px;
    border: 2px solid var(--accent-primary);
    background: var(--bg-surface);
    color: var(--text-primary);
    font-weight: 600;
    text-align: center;
    box-shadow: var(--shadow-panel);
    outline: none;
  }

  .canvas-hud-left,
  .canvas-hud-right {
    position: absolute;
    bottom: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
    pointer-events: none;
  }

  .canvas-hud-left {
    left: 14px;
  }

  .canvas-hud-right {
    right: 14px;
    pointer-events: auto;
  }

  .hud-chip,
  .hud-btn,
  .zoom-bar {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: 9px;
    box-shadow: var(--shadow-panel);
    font-size: 11.5px;
  }

  .hud-chip {
    padding: 6px 10px;
    color: var(--text-secondary);
  }

  .hud-chip strong {
    color: var(--text-primary);
    text-transform: capitalize;
  }

  .validation-chip {
    padding: 6px 11px;
    font-weight: 600;
    color: var(--status-success);
  }

  .validation-chip.has-warnings {
    color: var(--status-warning);
  }

  .validation-chip.has-errors {
    color: var(--status-error);
    border-color: var(--status-error);
  }

  .zoom-bar {
    display: flex;
    align-items: center;
    overflow: hidden;
  }

  .zoom-bar button {
    background: transparent;
    border: none;
    padding: 6px 10px;
    font-weight: 600;
  }

  .zoom-bar button:hover {
    background: var(--bg-elevated);
  }

  .zoom-readout {
    min-width: 52px;
    border-left: 1px solid var(--border-subtle) !important;
    border-right: 1px solid var(--border-subtle) !important;
  }

  .file-drop-overlay {
    position: absolute;
    inset: 14px;
    border: 2px dashed var(--accent-primary);
    border-radius: 14px;
    background: var(--accent-soft);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    font-weight: 700;
    color: var(--accent-primary);
    pointer-events: none;
  }
</style>

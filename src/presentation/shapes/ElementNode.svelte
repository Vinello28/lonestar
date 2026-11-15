<script lang="ts">
  import type { IntentionalElement } from '../../domain/types';
  import ElementShapeSvg from './ElementShapeSvg.svelte';

  interface Props {
    element: IntentionalElement;
    selected: boolean;
    connectionHighlight?: 'valid' | 'invalid' | null;
    hasIssue?: boolean;
    onPointerDownElement: (e: PointerEvent, el: IntentionalElement) => void;
    onDoubleClickElement: (el: IntentionalElement) => void;
    onStartPortLink: (e: PointerEvent, nodeId: string, px: number, py: number) => void;
  }

  let {
    element,
    selected,
    connectionHighlight = null,
    hasIssue = false,
    onPointerDownElement,
    onDoubleClickElement,
    onStartPortLink,
  }: Props = $props();

  let ports = $derived([
    { x: element.x + element.width / 2, y: element.y },
    { x: element.x + element.width, y: element.y + element.height / 2 },
    { x: element.x + element.width / 2, y: element.y + element.height },
    { x: element.x, y: element.y + element.height / 2 },
  ]);

  let tone = $derived<'valid' | 'invalid' | 'error' | null>(
    connectionHighlight ?? (hasIssue ? 'error' : null),
  );
</script>

<g
  class="element-group"
  data-node-id={element.id}
  onpointerdown={(e) => onPointerDownElement(e, element)}
  ondblclick={(e) => {
    e.stopPropagation();
    onDoubleClickElement(element);
  }}
  style="cursor: grab;"
  role="button"
  tabindex="0"
  aria-label={`${element.kind} ${element.name}`}
>
  <ElementShapeSvg
    kind={element.kind}
    name={element.name}
    x={element.x}
    y={element.y}
    width={element.width}
    height={element.height}
    {selected}
    highlightTone={tone}
  />

  {#if hasIssue}
    <circle
      class="editor-only"
      cx={element.x + element.width - 4}
      cy={element.y + 4}
      r="6"
      fill="var(--status-warning)"
      stroke="var(--bg-surface)"
      stroke-width="1.5"
    />
  {/if}

  {#each ports as port}
    <circle
      class="editor-only node-port"
      role="presentation"
      cx={port.x}
      cy={port.y}
      r="5"
      fill="var(--bg-surface)"
      stroke="var(--accent-primary)"
      stroke-width="2"
      onpointerdown={(e) => {
        e.stopPropagation();
        onStartPortLink(e, element.id, port.x, port.y);
      }}
    />
  {/each}
</g>

<style>
  .element-group .node-port {
    opacity: 0;
    transition: opacity 0.14s ease;
  }

  .element-group:hover .node-port,
  .element-group:focus-within .node-port {
    opacity: 1;
  }
</style>

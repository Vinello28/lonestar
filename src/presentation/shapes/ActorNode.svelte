<script lang="ts">
  import type { Actor } from '../../domain/types';
  import { wrapSvgLabel } from './textWrap';

  interface Props {
    actor: Actor;
    selected: boolean;
    dropTargetActive?: boolean;
    connectionHighlight?: 'valid' | 'invalid' | null;
    hasIssue?: boolean;
    onPointerDownActor: (e: PointerEvent, actor: Actor) => void;
    onDoubleClickActor: (actor: Actor) => void;
    onStartPortLink: (e: PointerEvent, nodeId: string, px: number, py: number) => void;
    onResizePointerDown: (e: PointerEvent, actor: Actor) => void;
    onToggleCollapse: (actorId: string) => void;
  }

  let {
    actor,
    selected,
    dropTargetActive = false,
    connectionHighlight = null,
    hasIssue = false,
    onPointerDownActor,
    onDoubleClickActor,
    onStartPortLink,
    onResizePointerDown,
    onToggleCollapse,
  }: Props = $props();

  let badgeCx = $derived(actor.x + actor.width / 2);
  let badgeCy = $derived(actor.collapsed ? actor.y + 42 : actor.y + 16);
  let badgeR = $derived(actor.collapsed ? 40 : 34);
  let lines = $derived(wrapSvgLabel(actor.name, badgeR * 2 - 6));
  const lineH = 13;
  let startY = $derived(badgeCy - ((lines.length - 1) * lineH) / 2 + 4);

  let strokeColor = $derived(
    connectionHighlight === 'valid'
      ? 'var(--status-success)'
      : connectionHighlight === 'invalid' || hasIssue
        ? 'var(--status-error)'
        : dropTargetActive || selected
          ? 'var(--accent-primary)'
          : 'var(--actor-stroke)',
  );

  let boundaryStroke = $derived(
    dropTargetActive
      ? 'var(--accent-primary)'
      : selected
        ? 'var(--accent-primary)'
        : 'var(--border-actor)',
  );

  // Port positions around the Actor circle badge / boundary
  let ports = $derived(
    actor.collapsed
      ? [
          { x: badgeCx, y: badgeCy - badgeR },
          { x: badgeCx + badgeR, y: badgeCy },
          { x: badgeCx, y: badgeCy + badgeR },
          { x: badgeCx - badgeR, y: badgeCy },
        ]
      : [
          { x: badgeCx, y: badgeCy - badgeR },
          { x: actor.x + actor.width, y: actor.y + actor.height / 2 },
          { x: badgeCx, y: actor.y + actor.height },
          { x: actor.x, y: actor.y + actor.height / 2 },
        ],
  );
</script>

<g
  class="actor-group"
  data-node-id={actor.id}
  role="button"
  tabindex="0"
  aria-label={`Actor ${actor.name}`}
>
  <!-- SR Boundary (shown when expanded) -->
  {#if !actor.collapsed}
    <rect
      role="presentation"
      x={actor.x}
      y={actor.y}
      width={actor.width}
      height={actor.height}
      rx="26"
      ry="26"
      fill="var(--bg-actor-boundary)"
      stroke={boundaryStroke}
      stroke-width={dropTargetActive ? 2.5 : selected ? 2 : 1.5}
      stroke-dasharray="7 5"
      onpointerdown={(e) => onPointerDownActor(e, actor)}
      ondblclick={(e) => {
        e.stopPropagation();
        onDoubleClickActor(actor);
      }}
      style="cursor: move;"
    />

    <!-- Bottom-right resize grip -->
    <g
      class="editor-only resize-grip"
      role="presentation"
      onpointerdown={(e) => {
        e.stopPropagation();
        onResizePointerDown(e, actor);
      }}
      style="cursor: nwse-resize;"
    >
      <rect
        x={actor.x + actor.width - 18}
        y={actor.y + actor.height - 18}
        width="16"
        height="16"
        rx="4"
        fill="var(--bg-surface)"
        stroke="var(--border-strong)"
        stroke-width="1"
      />
      <path
        d={`M ${actor.x + actor.width - 13} ${actor.y + actor.height - 5} L ${actor.x + actor.width - 5} ${actor.y + actor.height - 13} M ${actor.x + actor.width - 9} ${actor.y + actor.height - 5} L ${actor.x + actor.width - 5} ${actor.y + actor.height - 9}`}
        stroke="var(--text-secondary)"
        stroke-width="1.4"
        stroke-linecap="round"
      />
    </g>
  {/if}

  <!-- Actor / Agent / Role Circle Emblem -->
  <g
    role="presentation"
    onpointerdown={(e) => onPointerDownActor(e, actor)}
    ondblclick={(e) => {
      e.stopPropagation();
      onDoubleClickActor(actor);
    }}
    style="cursor: move;"
  >
    <circle
      cx={badgeCx}
      cy={badgeCy}
      r={badgeR}
      fill="var(--actor-fill)"
      stroke={strokeColor}
      stroke-width={selected || connectionHighlight ? 2.5 : 1.9}
    />

    <!-- Official iStar 2.0 Agent Marker: straight horizontal bar near top of circle -->
    {#if actor.kind === 'agent'}
      {@const yLine = badgeCy - badgeR * 0.45}
      {@const dx = Math.sqrt(Math.max(0, badgeR * badgeR - (badgeR * 0.45) ** 2))}
      <line
        x1={badgeCx - dx + 1}
        y1={yLine}
        x2={badgeCx + dx - 1}
        y2={yLine}
        stroke={strokeColor}
        stroke-width="1.7"
      />
    {/if}

    <!-- Official iStar 2.0 Role Marker: curved arc along bottom of circle -->
    {#if actor.kind === 'role'}
      {@const yArc = badgeCy + badgeR * 0.46}
      {@const dx = Math.sqrt(Math.max(0, badgeR * badgeR - (badgeR * 0.46) ** 2))}
      <path
        d={`M ${badgeCx - dx + 1} ${yArc} Q ${badgeCx} ${badgeCy + badgeR * 0.94} ${badgeCx + dx - 1} ${yArc}`}
        fill="none"
        stroke={strokeColor}
        stroke-width="1.7"
      />
    {/if}

    <!-- Actor Name -->
    <text
      x={badgeCx}
      y={startY}
      text-anchor="middle"
      fill="var(--text-primary)"
      font-size="11.5"
      font-weight="600"
      pointer-events="none"
    >
      {#each lines as line, idx}
        <tspan x={badgeCx} dy={idx === 0 ? 0 : lineH}>{line}</tspan>
      {/each}
    </text>
  </g>

  <!-- Collapse / Expand SD/SR Toggle -->
  <g
    class="editor-only actor-collapse-btn"
    role="button"
    tabindex="0"
    aria-label={actor.collapsed ? 'Expand SR Boundary' : 'Collapse to SD Actor'}
    onpointerdown={(e) => e.stopPropagation()}
    onclick={(e) => {
      e.stopPropagation();
      onToggleCollapse(actor.id);
    }}
    onkeydown={(e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onToggleCollapse(actor.id);
      }
    }}
    style="cursor: pointer;"
  >
    <title>{actor.collapsed ? 'Expand SR Boundary' : 'Collapse to SD Actor'}</title>
    <circle
      cx={badgeCx + badgeR - 4}
      cy={badgeCy - badgeR + 4}
      r="9"
      fill="var(--bg-surface)"
      stroke="var(--border-strong)"
      stroke-width="1.2"
    />
    <text
      x={badgeCx + badgeR - 4}
      y={badgeCy - badgeR + 8}
      text-anchor="middle"
      font-size="11"
      font-weight="700"
      fill="var(--text-primary)"
    >
      {actor.collapsed ? '+' : '−'}
    </text>
  </g>

  <!-- Connection Ports (Drag to Create Dependency / is-a / participates-in) -->
  {#each ports as port}
    <circle
      class="editor-only node-port"
      role="presentation"
      cx={port.x}
      cy={port.y}
      r="5.5"
      fill="var(--bg-surface)"
      stroke="var(--accent-primary)"
      stroke-width="2"
      onpointerdown={(e) => {
        e.stopPropagation();
        onStartPortLink(e, actor.id, port.x, port.y);
      }}
    />
  {/each}
</g>

<style>
  .actor-group .node-port,
  .actor-group .resize-grip,
  .actor-group .actor-collapse-btn {
    opacity: 0;
    transition: opacity 0.14s ease;
  }

  .actor-group:hover .node-port,
  .actor-group:hover .resize-grip,
  .actor-group:hover .actor-collapse-btn,
  .actor-group:focus-within .node-port {
    opacity: 1;
  }
</style>

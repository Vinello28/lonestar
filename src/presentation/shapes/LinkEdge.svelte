<script lang="ts">
  import type { DiagramModel, Link } from '../../domain/types';
  import { clipLineToBox, resolveEntityBox } from './geometry';

  interface Props {
    link: Link;
    model: DiagramModel;
    selected: boolean;
    onSelectLink: (e: PointerEvent, link: Link) => void;
    onBadgeClick: (e: MouseEvent, link: Link) => void;
  }

  let { link, model, selected, onSelectLink, onBadgeClick }: Props = $props();

  let isActorLink = $derived(
    link.kind === 'isA' || link.kind === 'participatesIn',
  );

  let geometry = $derived.by(() => {
    const srcBox = resolveEntityBox(model, link.sourceId, isActorLink);
    const dstBox = resolveEntityBox(model, link.targetId, isActorLink);
    if (!srcBox || !dstBox) return null;

    const p1 = clipLineToBox(srcBox, dstBox.cx, dstBox.cy, 2);
    const p2 = clipLineToBox(
      dstBox,
      srcBox.cx,
      srcBox.cy,
      link.kind === 'andRefinement' ? 1 : 4,
    );
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / len;
    const uy = dy / len;

    // Perpendicular unit vector for AND-refinement T-bar
    const px = -uy;
    const py = ux;

    // T-bar sits 8px behind p2
    const tCenter = { x: p2.x - ux * 8, y: p2.y - uy * 8 };
    const t1 = { x: tCenter.x + px * 8, y: tCenter.y + py * 8 };
    const t2 = { x: tCenter.x - px * 8, y: tCenter.y - py * 8 };

    // NeededBy circle center 7px behind p2
    const circleCenter = { x: p2.x - ux * 6, y: p2.y - uy * 6 };

    return {
      p1,
      p2,
      t1,
      t2,
      circleCenter,
      midX: (p1.x + p2.x) / 2,
      midY: (p1.y + p2.y) / 2,
    };
  });

  let labelText = $derived.by(() => {
    switch (link.kind) {
      case 'contribution':
        return link.value;
      case 'isA':
        return 'is-a';
      case 'participatesIn':
        return 'participates-in';
      default:
        return null;
    }
  });

  let strokeColor = $derived(
    selected ? 'var(--accent-primary)' : 'var(--link-stroke)',
  );

  let markerEndUrl = $derived.by(() => {
    switch (link.kind) {
      case 'orRefinement':
        return selected ? 'url(#marker-or-selected)' : 'url(#marker-or)';
      case 'contribution':
      case 'isA':
      case 'participatesIn':
        return selected ? 'url(#marker-open-selected)' : 'url(#marker-open)';
      default:
        return undefined;
    }
  });
</script>

{#if geometry}
  <g class="link-group">
    <!-- Wide invisible hit target for easy clicking -->
    <line
      class="editor-only"
      role="presentation"
      x1={geometry.p1.x}
      y1={geometry.p1.y}
      x2={geometry.p2.x}
      y2={geometry.p2.y}
      stroke="transparent"
      stroke-width="14"
      onpointerdown={(e) => {
        e.stopPropagation();
        onSelectLink(e, link);
      }}
      ondblclick={(e) => {
        if (link.kind === 'andRefinement' || link.kind === 'orRefinement') {
          e.stopPropagation();
          onBadgeClick(e, link);
        }
      }}
      style="cursor: pointer;"
    />

    <!-- Main iStar 2.0 Edge Line -->
    <line
      x1={geometry.p1.x}
      y1={geometry.p1.y}
      x2={link.kind === 'neededBy' ? geometry.circleCenter.x : geometry.p2.x}
      y2={link.kind === 'neededBy' ? geometry.circleCenter.y : geometry.p2.y}
      stroke={strokeColor}
      stroke-width={selected ? 2.4 : 1.7}
      stroke-dasharray={link.kind === 'qualification' ? '5 4' : undefined}
      marker-end={markerEndUrl}
      pointer-events="none"
    />

    <!-- AND-Refinement T-bar -->
    {#if link.kind === 'andRefinement'}
      <line
        x1={geometry.t1.x}
        y1={geometry.t1.y}
        x2={geometry.t2.x}
        y2={geometry.t2.y}
        stroke={strokeColor}
        stroke-width={selected ? 2.8 : 2.2}
        stroke-linecap="round"
        pointer-events="none"
      />
    {/if}

    <!-- NeededBy circle endpoint -->
    {#if link.kind === 'neededBy'}
      <circle
        cx={geometry.circleCenter.x}
        cy={geometry.circleCenter.y}
        r="4.5"
        fill={strokeColor}
        stroke={strokeColor}
        stroke-width="1"
        pointer-events="none"
      />
    {/if}

    <!-- Interactive Label Pill -->
    {#if labelText}
      {@const pillW = Math.max(34, labelText.length * 7.2 + 14)}
      <g
        role="button"
        tabindex="0"
        aria-label={`Change ${labelText}`}
        onclick={(e) => {
          e.stopPropagation();
          onBadgeClick(e, link);
        }}
        onkeydown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onBadgeClick(e as unknown as MouseEvent, link);
          }
        }}
        style="cursor: pointer;"
      >
        <rect
          x={geometry.midX - pillW / 2}
          y={geometry.midY - 10}
          width={pillW}
          height="20"
          rx="10"
          fill="var(--link-label-bg)"
          stroke={selected ? 'var(--accent-primary)' : 'var(--border-strong)'}
          stroke-width="1.2"
        />
        <text
          x={geometry.midX}
          y={geometry.midY + 3.5}
          text-anchor="middle"
          font-size="10.5"
          font-weight="600"
          fill={selected ? 'var(--accent-primary)' : 'var(--text-primary)'}
        >
          {labelText}
        </text>
      </g>
    {/if}
  </g>
{/if}

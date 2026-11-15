<script lang="ts">
  import type { ElementKind } from '../../domain/types';
  import { wrapSvgLabel } from './textWrap';

  interface Props {
    kind: ElementKind;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    selected?: boolean;
    highlightTone?: 'valid' | 'invalid' | 'error' | null;
  }

  let {
    kind,
    name,
    x,
    y,
    width,
    height,
    selected = false,
    highlightTone = null,
  }: Props = $props();

  let lines = $derived(wrapSvgLabel(name, width));
  let lineHeight = 14;
  let startY = $derived(
    y + height / 2 - ((lines.length - 1) * lineHeight) / 2 + 4,
  );

  let fillColor = $derived(
    kind === 'goal'
      ? 'var(--goal-fill)'
      : kind === 'quality'
        ? 'var(--quality-fill)'
        : kind === 'task'
          ? 'var(--task-fill)'
          : 'var(--resource-fill)',
  );

  let strokeColor = $derived(
    highlightTone === 'valid'
      ? 'var(--status-success)'
      : highlightTone === 'invalid' || highlightTone === 'error'
        ? 'var(--status-error)'
        : selected
          ? 'var(--accent-primary)'
          : kind === 'goal'
            ? 'var(--goal-stroke)'
            : kind === 'quality'
              ? 'var(--quality-stroke)'
              : kind === 'task'
                ? 'var(--task-stroke)'
                : 'var(--resource-stroke)',
  );

  let strokeWidth = $derived(selected || highlightTone ? 2.4 : 1.7);

  // Scalloped softgoal / cloud path in local coordinates [0..w, 0..h]
  let qualityPath = $derived.by(() => {
    const w = width;
    const h = height;
    const x0 = x;
    const y0 = y;
    return [
      `M ${x0 + w * 0.2} ${y0 + h * 0.25}`,
      `C ${x0 + w * 0.28} ${y0 - h * 0.04}, ${x0 + w * 0.48} ${y0 - h * 0.04}, ${x0 + w * 0.56} ${y0 + h * 0.14}`,
      `C ${x0 + w * 0.68} ${y0 - h * 0.02}, ${x0 + w * 0.92} ${y0 + h * 0.06}, ${x0 + w * 0.95} ${y0 + h * 0.34}`,
      `C ${x0 + w * 1.05} ${y0 + h * 0.52}, ${x0 + w * 0.98} ${y0 + h * 0.85}, ${x0 + w * 0.78} ${y0 + h * 0.88}`,
      `C ${x0 + w * 0.66} ${y0 + h * 1.04}, ${x0 + w * 0.44} ${y0 + h * 1.02}, ${x0 + w * 0.36} ${y0 + h * 0.88}`,
      `C ${x0 + w * 0.18} ${y0 + h * 0.96}, ${x0 - w * 0.02} ${y0 + h * 0.78}, ${x0 + w * 0.05} ${y0 + h * 0.54}`,
      `C ${x0 - w * 0.04} ${y0 + h * 0.34}, ${x0 + w * 0.08} ${y0 + h * 0.14}, ${x0 + w * 0.2} ${y0 + h * 0.25}`,
      'Z',
    ].join(' ');
  });

  let taskPoints = $derived.by(() => {
    const tip = Math.min(18, width * 0.16);
    const midY = y + height / 2;
    return [
      `${x},${midY}`,
      `${x + tip},${y}`,
      `${x + width - tip},${y}`,
      `${x + width},${midY}`,
      `${x + width - tip},${y + height}`,
      `${x + tip},${y + height}`,
    ].join(' ');
  });
</script>

{#if kind === 'goal'}
  <rect
    {x}
    {y}
    {width}
    {height}
    rx={height / 2}
    ry={height / 2}
    fill={fillColor}
    stroke={strokeColor}
    stroke-width={strokeWidth}
  />
{:else if kind === 'quality'}
  <path
    d={qualityPath}
    fill={fillColor}
    stroke={strokeColor}
    stroke-width={strokeWidth}
    stroke-linejoin="round"
  />
{:else if kind === 'task'}
  <polygon
    points={taskPoints}
    fill={fillColor}
    stroke={strokeColor}
    stroke-width={strokeWidth}
    stroke-linejoin="round"
  />
{:else}
  <rect
    {x}
    {y}
    {width}
    {height}
    rx="3"
    ry="3"
    fill={fillColor}
    stroke={strokeColor}
    stroke-width={strokeWidth}
  />
{/if}

<text
  x={x + width / 2}
  y={startY}
  text-anchor="middle"
  fill="var(--text-primary)"
  font-size="11.5"
  font-weight="500"
  pointer-events="none"
>
  {#each lines as line, idx}
    <tspan x={x + width / 2} dy={idx === 0 ? 0 : lineHeight}>{line}</tspan>
  {/each}
</text>

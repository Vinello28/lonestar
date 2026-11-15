<script lang="ts">
  import type { Dependency, DiagramModel } from '../../domain/types';
  import ElementShapeSvg from './ElementShapeSvg.svelte';
  import { clipLineToBox, getDependencyBox, resolveEntityBox } from './geometry';

  interface Props {
    dependency: Dependency;
    model: DiagramModel;
    selected: boolean;
    onPointerDownDep: (e: PointerEvent, dep: Dependency) => void;
    onDoubleClickDep: (dep: Dependency) => void;
  }

  let {
    dependency,
    model,
    selected,
    onPointerDownDep,
    onDoubleClickDep,
  }: Props = $props();

  let depBox = $derived(getDependencyBox(dependency));

  let segments = $derived.by(() => {
    const srcId = dependency.dependerElementId ?? dependency.dependerActorId;
    const dstId = dependency.dependeeElementId ?? dependency.dependeeActorId;
    const srcBox = resolveEntityBox(model, srcId, false);
    const dstBox = resolveEntityBox(model, dstId, false);
    if (!srcBox || !dstBox) return null;

    const s1Start = clipLineToBox(srcBox, depBox.cx, depBox.cy, 2);
    const s1End = clipLineToBox(depBox, srcBox.cx, srcBox.cy, 2);
    const s2Start = clipLineToBox(depBox, dstBox.cx, dstBox.cy, 2);
    const s2End = clipLineToBox(dstBox, depBox.cx, depBox.cy, 2);

    const angle1 =
      (Math.atan2(s1End.y - s1Start.y, s1End.x - s1Start.x) * 180) / Math.PI;
    const angle2 =
      (Math.atan2(s2End.y - s2Start.y, s2End.x - s2Start.x) * 180) / Math.PI;

    return {
      s1Start,
      s1End,
      s1Mid: { x: (s1Start.x + s1End.x) / 2, y: (s1Start.y + s1End.y) / 2 },
      angle1,
      s2Start,
      s2End,
      s2Mid: { x: (s2Start.x + s2End.x) / 2, y: (s2Start.y + s2End.y) / 2 },
      angle2,
    };
  });

  let strokeColor = $derived(
    selected ? 'var(--accent-primary)' : 'var(--link-stroke)',
  );
</script>

{#if segments}
  <g class="dependency-group">
    <!-- Invisible wider hit targets for easy selection -->
    <line
      role="presentation"
      x1={segments.s1Start.x}
      y1={segments.s1Start.y}
      x2={segments.s1End.x}
      y2={segments.s1End.y}
      stroke="transparent"
      stroke-width="14"
      onpointerdown={(e) => {
        e.stopPropagation();
        onPointerDownDep(e, dependency);
      }}
      style="cursor: pointer;"
    />
    <line
      role="presentation"
      x1={segments.s2Start.x}
      y1={segments.s2Start.y}
      x2={segments.s2End.x}
      y2={segments.s2End.y}
      stroke="transparent"
      stroke-width="14"
      onpointerdown={(e) => {
        e.stopPropagation();
        onPointerDownDep(e, dependency);
      }}
      style="cursor: pointer;"
    />

    <!-- Depender -> Dependum -->
    <line
      x1={segments.s1Start.x}
      y1={segments.s1Start.y}
      x2={segments.s1End.x}
      y2={segments.s1End.y}
      stroke={strokeColor}
      stroke-width={selected ? 2.4 : 1.7}
      pointer-events="none"
    />

    <!-- Dependum -> Dependee -->
    <line
      x1={segments.s2Start.x}
      y1={segments.s2Start.y}
      x2={segments.s2End.x}
      y2={segments.s2End.y}
      stroke={strokeColor}
      stroke-width={selected ? 2.4 : 1.7}
      pointer-events="none"
    />

    <!-- Official iStar 2.0 "D" semicircle markers pointing Depender -> Dependee -->
    <g
      transform={`translate(${segments.s1Mid.x}, ${segments.s1Mid.y}) rotate(${segments.angle1})`}
      pointer-events="none"
    >
      <path
        d="M -3 -8 L -3 8 A 8 8 0 0 0 -3 -8 Z"
        fill="var(--bg-canvas)"
        stroke={strokeColor}
        stroke-width={selected ? 2.1 : 1.7}
      />
    </g>

    <g
      transform={`translate(${segments.s2Mid.x}, ${segments.s2Mid.y}) rotate(${segments.angle2})`}
      pointer-events="none"
    >
      <path
        d="M -3 -8 L -3 8 A 8 8 0 0 0 -3 -8 Z"
        fill="var(--bg-canvas)"
        stroke={strokeColor}
        stroke-width={selected ? 2.1 : 1.7}
      />
    </g>

    <!-- Draggable Dependum Intentional Element -->
    <g
      onpointerdown={(e) => {
        e.stopPropagation();
        onPointerDownDep(e, dependency);
      }}
      ondblclick={(e) => {
        e.stopPropagation();
        onDoubleClickDep(dependency);
      }}
      style="cursor: grab;"
      role="button"
      tabindex="0"
      aria-label={`Dependency ${dependency.dependumName}`}
    >
      <ElementShapeSvg
        kind={dependency.dependumKind}
        name={dependency.dependumName}
        x={dependency.x}
        y={dependency.y}
        width={depBox.width}
        height={depBox.height}
        {selected}
      />
    </g>
  </g>
{/if}

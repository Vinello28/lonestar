import type { DiagramModel } from '../domain/types';

export interface DiagramBounds {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

export function computeDiagramBounds(model: DiagramModel, padding = 56): DiagramBounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const actor of model.actors) {
    const w = actor.collapsed ? Math.max(actor.width, 130) : actor.width;
    const h = actor.collapsed ? 105 : actor.height;
    minX = Math.min(minX, actor.x);
    minY = Math.min(minY, actor.y);
    maxX = Math.max(maxX, actor.x + w);
    maxY = Math.max(maxY, actor.y + h);
  }

  for (const el of model.elements) {
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + el.width);
    maxY = Math.max(maxY, el.y + el.height);
  }

  for (const dep of model.dependencies) {
    minX = Math.min(minX, dep.x);
    minY = Math.min(minY, dep.y);
    maxX = Math.max(maxX, dep.x + 132);
    maxY = Math.max(maxY, dep.y + 58);
  }

  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, width: 960, height: 640 };
  }

  return {
    minX: Math.floor(minX - padding),
    minY: Math.floor(minY - padding),
    width: Math.max(320, Math.ceil(maxX - minX + padding * 2)),
    height: Math.max(240, Math.ceil(maxY - minY + padding * 2)),
  };
}

const EXPORT_CSS_VARS = [
  '--bg-canvas',
  '--bg-surface',
  '--bg-actor-boundary',
  '--border-actor',
  '--text-primary',
  '--text-secondary',
  '--actor-fill',
  '--actor-stroke',
  '--goal-fill',
  '--goal-stroke',
  '--quality-fill',
  '--quality-stroke',
  '--task-fill',
  '--task-stroke',
  '--resource-fill',
  '--resource-stroke',
  '--link-stroke',
  '--link-label-bg',
  '--accent-primary',
];

function buildStandaloneSvgString(
  svgElement: SVGSVGElement,
  model: DiagramModel,
  scale: number,
  transparentBg: boolean,
): { svgMarkup: string; pixelWidth: number; pixelHeight: number } {
  const bounds = computeDiagramBounds(model);
  const clone = svgElement.cloneNode(true) as SVGSVGElement;

  clone.querySelectorAll('.editor-only').forEach((node) => node.remove());

  const world = clone.querySelector('#lonestar-world');
  if (world) {
    world.removeAttribute('transform');
  }

  const computed = getComputedStyle(document.documentElement);
  const varsCss = EXPORT_CSS_VARS.map(
    (v) => `${v}: ${computed.getPropertyValue(v).trim()};`,
  ).join('\n  ');

  const bgColor = computed.getPropertyValue('--bg-canvas').trim() || '#f6f4ef';

  const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  styleEl.textContent = `
:root, svg {
  ${varsCss}
  font-family: "Inter", "Segoe UI", system-ui, -apple-system, sans-serif;
}
text {
  font-family: "Inter", "Segoe UI", system-ui, -apple-system, sans-serif;
}
`;

  let defs = clone.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    clone.insertBefore(defs, clone.firstChild);
  }
  defs.appendChild(styleEl);

  if (!transparentBg) {
    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bgRect.setAttribute('x', String(bounds.minX));
    bgRect.setAttribute('y', String(bounds.minY));
    bgRect.setAttribute('width', String(bounds.width));
    bgRect.setAttribute('height', String(bounds.height));
    bgRect.setAttribute('fill', bgColor);
    clone.insertBefore(bgRect, defs.nextSibling);
  }

  const pixelWidth = Math.round(bounds.width * scale);
  const pixelHeight = Math.round(bounds.height * scale);

  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute(
    'viewBox',
    `${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`,
  );
  clone.setAttribute('width', String(pixelWidth));
  clone.setAttribute('height', String(pixelHeight));
  clone.removeAttribute('class');

  const serializer = new XMLSerializer();
  const svgMarkup = `<?xml version="1.0" encoding="UTF-8"?>\n${serializer.serializeToString(clone)}`;

  return { svgMarkup, pixelWidth, pixelHeight };
}

export function buildVectorSvg(
  svgElement: SVGSVGElement,
  model: DiagramModel,
  transparentBg = false,
): string {
  return buildStandaloneSvgString(svgElement, model, 1, transparentBg).svgMarkup;
}

export async function renderHighResPngBase64(
  svgElement: SVGSVGElement,
  model: DiagramModel,
  scale = 3,
  transparentBg = false,
): Promise<{ base64: string; width: number; height: number }> {
  const { svgMarkup, pixelWidth, pixelHeight } = buildStandaloneSvgString(
    svgElement,
    model,
    scale,
    transparentBg,
  );

  const svgBlob = new Blob([svgMarkup], {
    type: 'image/svg+xml;charset=utf-8',
  });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = (err) => reject(new Error(`SVG rasterization failed: ${String(err)}`));
      image.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, pixelWidth, pixelHeight);

    const dataUrl = canvas.toDataURL('image/png', 1.0);
    const base64 = dataUrl.split(',')[1] ?? '';
    return { base64, width: pixelWidth, height: pixelHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function sanitizeFilename(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'lonestar-diagram'
  );
}

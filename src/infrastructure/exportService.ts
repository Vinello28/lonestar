import type { DiagramModel } from '../domain/types';

export interface DiagramBounds {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

export type ExportTheme = 'light' | 'dark';

const EXPORT_FONT_FAMILY =
  'Inter, Segoe UI, system-ui, -apple-system, sans-serif';

const LIGHT_EXPORT_VARS: Record<string, string> = {
  '--bg-canvas': '#f6f4ef',
  '--bg-surface': '#fcfbf8',
  '--bg-actor-boundary': 'rgba(235, 231, 222, 0.6)',
  '--border-subtle': '#dad5c9',
  '--border-strong': '#bab3a4',
  '--border-actor': '#7d776b',
  '--text-primary': '#1f1d1a',
  '--text-secondary': '#666156',
  '--accent-primary': '#b86114',
  '--status-success': '#2f6f3e',
  '--status-warning': '#a66914',
  '--status-error': '#a82e24',
  '--actor-fill': '#e3ebd9',
  '--actor-stroke': '#4a5d3e',
  '--goal-fill': '#fbe2c4',
  '--goal-stroke': '#9c5618',
  '--quality-fill': '#ece8d5',
  '--quality-stroke': '#6b6332',
  '--task-fill': '#f7eab8',
  '--task-stroke': '#8a6814',
  '--resource-fill': '#efeae2',
  '--resource-stroke': '#625b50',
  '--link-stroke': '#3d3932',
  '--link-label-bg': '#fcfbf8',
};

const DARK_EXPORT_VARS: Record<string, string> = {
  '--bg-canvas': '#151412',
  '--bg-surface': '#1d1c19',
  '--bg-actor-boundary': 'rgba(41, 39, 34, 0.6)',
  '--border-subtle': '#33302a',
  '--border-strong': '#4a453d',
  '--border-actor': '#8a8376',
  '--text-primary': '#f3efe7',
  '--text-secondary': '#aba498',
  '--accent-primary': '#e4943e',
  '--status-success': '#6db87c',
  '--status-warning': '#e0a348',
  '--status-error': '#e0685c',
  '--actor-fill': '#2c3227',
  '--actor-stroke': '#9ab886',
  '--goal-fill': '#3e2c1e',
  '--goal-stroke': '#e8a35d',
  '--quality-fill': '#353223',
  '--quality-stroke': '#d4c87c',
  '--task-fill': '#3a321e',
  '--task-stroke': '#e6bf5a',
  '--resource-fill': '#2e2b26',
  '--resource-stroke': '#b5aca0',
  '--link-stroke': '#d6cfc3',
  '--link-label-bg': '#1d1c19',
};

const EDITOR_INTERACTIVE_ATTRS = [
  'style',
  'class',
  'role',
  'tabindex',
  'aria-label',
  'data-node-id',
  'pointer-events',
];

export function computeDiagramBounds(
  model: DiagramModel,
  padding = 56,
): DiagramBounds {
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

export function resolveExportPalette(
  theme: ExportTheme,
  computed?: Pick<CSSStyleDeclaration, 'getPropertyValue'> | null,
): Record<string, string> {
  const base = theme === 'dark' ? DARK_EXPORT_VARS : LIGHT_EXPORT_VARS;
  const resolved: Record<string, string> = { ...base };
  if (computed) {
    for (const key of Object.keys(base)) {
      const value = computed.getPropertyValue(key).trim();
      if (value) resolved[key] = value;
    }
  }
  return resolved;
}

export function rgbaToHexAndOpacity(
  value: string,
): { hex: string; opacity?: string } | null {
  const match =
    /^rgba?\(\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(
      value.trim(),
    );
  if (!match) return null;
  const toHex = (n: string) =>
    Math.max(0, Math.min(255, parseInt(n, 10)))
      .toString(16)
      .padStart(2, '0');
  const hex = `#${toHex(match[1])}${toHex(match[2])}${toHex(match[3])}`;
  const rawAlpha = match[4];
  if (rawAlpha === undefined) return { hex };
  const numericAlpha = rawAlpha.endsWith('%')
    ? parseFloat(rawAlpha) / 100
    : parseFloat(rawAlpha);
  if (Number.isFinite(numericAlpha) && numericAlpha < 1) {
    return { hex, opacity: String(Number(numericAlpha.toFixed(3))) };
  }
  return { hex };
}

export function resolveSvgCssValue(
  value: string,
  palette: Record<string, string>,
): string {
  return value.replace(
    /var\(\s*(--[a-zA-Z0-9-_]+)(?:\s*,\s*([^)]+))?\s*\)/g,
    (full, name: string, fallback?: string) =>
      palette[name] ?? fallback?.trim() ?? full,
  );
}

/**
 * Resolves a concrete SVG paint attribute (`fill` / `stroke`), splitting any
 * CSS `var(--...)` or `rgba(...)` color into an SVG 1.1 hex color + opacity.
 */
function normalizePaintValue(
  rawValue: string,
  palette: Record<string, string>,
): { color: string; opacity?: string } {
  const resolved = resolveSvgCssValue(rawValue, palette).trim();
  const converted = rgbaToHexAndOpacity(resolved);
  if (converted) {
    return { color: converted.hex, opacity: converted.opacity };
  }
  return { color: resolved };
}

/**
 * Sanitizes standalone SVG markup by resolving all `var(--...)` tokens and
 * `rgba(...)` paints into SVG 1.1 attributes, normalizing `auto-start-reverse`
 * markers, and stripping XML comments.
 */
export function resolveStandaloneSvgAttributeValues(
  svgMarkup: string,
  theme: ExportTheme = 'light',
): string {
  const palette = resolveExportPalette(theme);
  let out = svgMarkup.replace(/<!--[\s\S]*?-->/g, '');
  out = out.replace(/orient="auto-start-reverse"/g, 'orient="auto"');
  out = out.replace(
    /\b(fill|stroke)="([^"]*)"/g,
    (_full, attr: string, val: string) => {
      const { color, opacity } = normalizePaintValue(val, palette);
      if (opacity !== undefined) {
        return `${attr}="${color}" ${attr}-opacity="${opacity}"`;
      }
      return `${attr}="${color}"`;
    },
  );
  out = out.replace(
    /var\(\s*(--[a-zA-Z0-9-_]+)(?:\s*,\s*([^)]+))?\s*\)/g,
    (full, name: string, fallback?: string) =>
      palette[name] ?? fallback?.trim() ?? full,
  );
  return out;
}

function stripXmlComments(root: Node): void {
  const comments: Comment[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  let current = walker.nextNode();
  while (current) {
    comments.push(current as Comment);
    current = walker.nextNode();
  }
  for (const comment of comments) {
    comment.parentNode?.removeChild(comment);
  }
}

function resolveSvgDomAttributes(
  svgRoot: SVGSVGElement,
  palette: Record<string, string>,
): void {
  const allElements = [svgRoot, ...Array.from(svgRoot.querySelectorAll('*'))];
  for (const el of allElements) {
    for (const attrName of EDITOR_INTERACTIVE_ATTRS) {
      el.removeAttribute(attrName);
    }

    if (
      el.tagName.toLowerCase() === 'marker' &&
      el.getAttribute('orient') === 'auto-start-reverse'
    ) {
      el.setAttribute('orient', 'auto');
    }

    for (const attr of Array.from(el.attributes)) {
      if (attr.name === 'fill' || attr.name === 'stroke') {
        const { color, opacity } = normalizePaintValue(attr.value, palette);
        el.setAttribute(attr.name, color);
        if (opacity !== undefined && !el.hasAttribute(`${attr.name}-opacity`)) {
          el.setAttribute(`${attr.name}-opacity`, opacity);
        }
      } else if (attr.value.includes('var(')) {
        el.setAttribute(attr.name, resolveSvgCssValue(attr.value, palette));
      }
    }

    if (el.tagName.toLowerCase() === 'text') {
      el.setAttribute('font-family', EXPORT_FONT_FAMILY);
    }
  }
}

function buildStandaloneSvgString(
  svgElement: SVGSVGElement,
  model: DiagramModel,
  scale: number,
  transparentBg: boolean,
): { svgMarkup: string; pixelWidth: number; pixelHeight: number } {
  const bounds = computeDiagramBounds(model);
  const clone = svgElement.cloneNode(true) as SVGSVGElement;

  clone
    .querySelectorAll('.editor-only, #lonestar-dot-grid, line[stroke="transparent"]')
    .forEach((node) => node.remove());
  stripXmlComments(clone);

  const world = clone.querySelector('#lonestar-world');
  if (world) {
    world.removeAttribute('transform');
  }

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const computed = getComputedStyle(document.documentElement);
  const palette = resolveExportPalette(isDark ? 'dark' : 'light', computed);
  const bgColor =
    normalizePaintValue(palette['--bg-canvas'], palette).color ||
    (isDark ? '#151412' : '#f6f4ef');

  resolveSvgDomAttributes(clone, palette);

  const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  styleEl.textContent = `svg, text { font-family: ${EXPORT_FONT_FAMILY}; }`;

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
  clone.setAttribute('font-family', EXPORT_FONT_FAMILY);

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
      image.onerror = (err) =>
        reject(new Error(`SVG rasterization failed: ${String(err)}`));
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

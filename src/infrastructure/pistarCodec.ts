import { defaultElementSize } from '../domain/istarRules';
import type {
  ActorKind,
  ContributionValue,
  DiagramModel,
  ElementKind,
  Link,
  LinkKind,
} from '../domain/types';

interface PiStarNode {
  id: string;
  text: string;
  type: string;
  x?: number;
  y?: number;
  customProperties?: Record<string, string>;
}

interface PiStarActor {
  id: string;
  text: string;
  type: string;
  x?: number;
  y?: number;
  customProperties?: Record<string, string>;
  nodes?: PiStarNode[];
}

interface PiStarDependency {
  id: string;
  text: string;
  type: string;
  x?: number;
  y?: number;
  source: string;
  target: string;
  customProperties?: Record<string, string>;
}

interface PiStarLink {
  id: string;
  type: string;
  source: string;
  target: string;
  label?: string;
}

interface PiStarDisplayEntry {
  collapsed?: boolean;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

interface PiStarDocument {
  actors: PiStarActor[];
  orphans: PiStarNode[];
  dependencies: PiStarDependency[];
  links: PiStarLink[];
  display: Record<string, PiStarDisplayEntry>;
  tool: string;
  istar: string;
  saveDate?: string;
  name?: string;
  diagram?: {
    name?: string;
    width?: number;
    height?: number;
    customProperties?: Record<string, unknown>;
  };
}

function actorKindToPiStar(kind: ActorKind): string {
  switch (kind) {
    case 'actor':
      return 'istar.Actor';
    case 'agent':
      return 'istar.Agent';
    case 'role':
      return 'istar.Role';
  }
}

function piStarToActorKind(raw: string): ActorKind {
  if (raw === 'istar.Agent' || raw === 'Agent') return 'agent';
  if (raw === 'istar.Role' || raw === 'Role') return 'role';
  return 'actor';
}

function elementKindToPiStar(kind: ElementKind): string {
  switch (kind) {
    case 'goal':
      return 'istar.Goal';
    case 'quality':
      return 'istar.Quality';
    case 'task':
      return 'istar.Task';
    case 'resource':
      return 'istar.Resource';
  }
}

function piStarToElementKind(raw: string): ElementKind {
  if (raw === 'istar.Quality' || raw === 'Quality') return 'quality';
  if (raw === 'istar.Task' || raw === 'Task') return 'task';
  if (raw === 'istar.Resource' || raw === 'Resource') return 'resource';
  return 'goal';
}

function linkKindToPiStar(link: LinkKind): { type: string; label?: string } {
  switch (link.kind) {
    case 'isA':
      return { type: 'istar.IsALink' };
    case 'participatesIn':
      return { type: 'istar.ParticipatesInLink' };
    case 'andRefinement':
      return { type: 'istar.AndRefinementLink' };
    case 'orRefinement':
      return { type: 'istar.OrRefinementLink' };
    case 'neededBy':
      return { type: 'istar.NeededByLink' };
    case 'qualification':
      return { type: 'istar.QualificationLink' };
    case 'contribution':
      return { type: 'istar.ContributionLink', label: link.value };
  }
}

function piStarToLinkKind(raw: string, label?: string): LinkKind {
  switch (raw) {
    case 'istar.IsALink':
    case 'IsALink':
      return { kind: 'isA' };
    case 'istar.ParticipatesInLink':
    case 'ParticipatesInLink':
      return { kind: 'participatesIn' };
    case 'istar.OrRefinementLink':
    case 'OrRefinementLink':
      return { kind: 'orRefinement' };
    case 'istar.NeededByLink':
    case 'NeededByLink':
      return { kind: 'neededBy' };
    case 'istar.QualificationLink':
    case 'QualificationLink':
      return { kind: 'qualification' };
    case 'istar.ContributionLink':
    case 'ContributionLink': {
      const normalized = (label ?? 'help').toLowerCase();
      const value: ContributionValue =
        normalized === 'make' ||
        normalized === 'help' ||
        normalized === 'hurt' ||
        normalized === 'break'
          ? normalized
          : 'help';
      return { kind: 'contribution', value };
    }
    default:
      return { kind: 'andRefinement' };
  }
}

export function exportModelToPiStarJson(model: DiagramModel): string {
  const display: Record<
    string,
    { collapsed?: boolean; width?: number; height?: number }
  > = {};

  const actors: PiStarActor[] = model.actors.map((actor) => {
    display[actor.id] = {
      collapsed: actor.collapsed,
      width: actor.width,
      height: actor.height,
    };
    const nodes: PiStarNode[] = model.elements
      .filter((el) => el.actorId === actor.id)
      .map((el) => ({
        id: el.id,
        text: el.name,
        type: elementKindToPiStar(el.kind),
        x: Math.round(el.x),
        y: Math.round(el.y),
        customProperties: el.customProperties,
      }));
    return {
      id: actor.id,
      text: actor.name,
      type: actorKindToPiStar(actor.kind),
      x: Math.round(actor.x),
      y: Math.round(actor.y),
      customProperties: actor.customProperties,
      nodes,
    };
  });

  const orphans: PiStarNode[] = model.elements
    .filter((el) => !el.actorId)
    .map((el) => ({
      id: el.id,
      text: el.name,
      type: elementKindToPiStar(el.kind),
      x: Math.round(el.x),
      y: Math.round(el.y),
      customProperties: el.customProperties,
    }));

  const dependencies: PiStarDependency[] = model.dependencies.map((dep) => ({
    id: dep.id,
    text: dep.dependumName,
    type: elementKindToPiStar(dep.dependumKind),
    x: Math.round(dep.x),
    y: Math.round(dep.y),
    source: dep.dependerElementId ?? dep.dependerActorId,
    target: dep.dependeeElementId ?? dep.dependeeActorId,
    customProperties: dep.customProperties,
  }));

  const links: PiStarLink[] = model.links.map((link) => {
    const mapped = linkKindToPiStar(link);
    return {
      id: link.id,
      type: mapped.type,
      source: link.sourceId,
      target: link.targetId,
      ...(mapped.label ? { label: mapped.label } : {}),
    };
  });

  const doc: PiStarDocument = {
    actors,
    orphans,
    dependencies,
    links,
    display,
    tool: 'pistar.2.1.0',
    istar: '2.0',
    saveDate: new Date().toISOString(),
    name: model.name,
  };

  return JSON.stringify(doc, null, 2);
}

export function exportModelToLoneStarJson(model: DiagramModel): string {
  return JSON.stringify(model, null, 2);
}

function normalizeCustomProps(
  raw?: Record<string, unknown>,
): Record<string, string> {
  if (!raw) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === null || v === undefined) out[k] = '';
    else if (typeof v === 'string') out[k] = v;
    else out[k] = String(v);
  }
  return out;
}

function stripDataPrefix(raw: string): string {
  const noBom = raw.replace(/^\uFEFF/, '').trim();
  if (noBom.startsWith('data:')) {
    const commaIdx = noBom.indexOf(',');
    if (commaIdx !== -1) return noBom.slice(commaIdx + 1).trim();
  }
  return noBom;
}

function layoutImportedModel(model: DiagramModel): void {
  if (model.actors.length === 0) return;
  const cols = Math.max(1, Math.ceil(Math.sqrt(model.actors.length)));
  const colGap = 420;
  const rowGap = 380;

  model.actors.forEach((actor, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    actor.x = 100 + col * colGap;
    actor.y = 100 + row * rowGap;

    const inner = model.elements.filter((e) => e.actorId === actor.id);
    if (inner.length === 0) return;
    const innerCols = Math.max(1, Math.ceil(Math.sqrt(inner.length)));
    const innerRows = Math.ceil(inner.length / innerCols);
    actor.width = Math.max(280, innerCols * 150 + 80);
    actor.height = Math.max(240, innerRows * 84 + 95);

    inner.forEach((el, i) => {
      const ic = i % innerCols;
      const ir = Math.floor(i / innerCols);
      el.x = actor.x + 40 + ic * 150;
      el.y = actor.y + 72 + ir * 84;
    });
  });

  model.dependencies.forEach((dep) => {
    const depEl = dep.dependerElementId
      ? model.elements.find((e) => e.id === dep.dependerElementId)
      : undefined;
    const depActor = model.actors.find((a) => a.id === dep.dependerActorId);
    const eeEl = dep.dependeeElementId
      ? model.elements.find((e) => e.id === dep.dependeeElementId)
      : undefined;
    const eeActor = model.actors.find((a) => a.id === dep.dependeeActorId);
    const sx = depEl
      ? depEl.x + depEl.width / 2
      : depActor
        ? depActor.x + depActor.width / 2
        : 0;
    const sy = depEl
      ? depEl.y + depEl.height / 2
      : depActor
        ? depActor.y + depActor.height / 2
        : 0;
    const ex = eeEl
      ? eeEl.x + eeEl.width / 2
      : eeActor
        ? eeActor.x + eeActor.width / 2
        : 0;
    const ey = eeEl
      ? eeEl.y + eeEl.height / 2
      : eeActor
        ? eeActor.y + eeActor.height / 2
        : 0;
    dep.x = (sx + ex) / 2 - 55;
    dep.y = (sy + ey) / 2 - 22;
  });
}

function parseLinkWord(raw: string): LinkKind {
  const w = raw.trim().toLowerCase();
  if (w === 'isa' || w === 'is-a' || w === 'is_a') return { kind: 'isA' };
  if (w.startsWith('participates')) return { kind: 'participatesIn' };
  if (w === 'or' || w === 'orrefinement' || w === 'or-refinement') {
    return { kind: 'orRefinement' };
  }
  if (w === 'neededby' || w === 'needed-by' || w === 'needed_by') {
    return { kind: 'neededBy' };
  }
  if (w === 'qualification' || w === 'qualifies') return { kind: 'qualification' };
  if (w === 'make' || w === 'help' || w === 'hurt' || w === 'break') {
    return { kind: 'contribution', value: w };
  }
  if (w.startsWith('contribution')) {
    const match = /\(([^)]+)\)/.exec(w);
    const val = match?.[1]?.trim();
    const valid: ContributionValue =
      val === 'make' || val === 'help' || val === 'hurt' || val === 'break'
        ? val
        : 'help';
    return { kind: 'contribution', value: valid };
  }
  return { kind: 'andRefinement' };
}

function parseElementWord(raw: string): ElementKind {
  const w = raw.trim().toLowerCase();
  if (w === 'quality' || w === 'softgoal') return 'quality';
  if (w === 'task') return 'task';
  if (w === 'resource') return 'resource';
  return 'goal';
}

function importTextualIstarTxt(raw: string): DiagramModel {
  const model: DiagramModel = {
    id: 'imported-txt',
    name: 'Imported i* 2.0 (.txt)',
    version: '2.0',
    actors: [],
    elements: [],
    links: [],
    dependencies: [],
    metadata: {
      author: '',
      description: 'Imported from i* 2.0 .txt notation',
      createdAt: '',
      updatedAt: new Date().toISOString(),
    },
  };

  const actorByName = new Map<string, string>();
  const elementByName = new Map<string, string>();
  let currentActorId: string | null = null;
  let actorSeq = 0;
  let elSeq = 0;
  let linkSeq = 0;
  let depSeq = 0;

  const resolveNode = (token: string): string | undefined => {
    const clean = token.trim().toLowerCase();
    if (clean.includes('.')) {
      const part = clean.split('.')[1]?.trim();
      if (part && elementByName.has(part)) return elementByName.get(part);
    }
    return elementByName.get(clean) ?? actorByName.get(clean);
  };

  const resolveEndpoint = (
    token: string,
  ): { actorId?: string; elementId: string | null } => {
    const clean = token.trim().toLowerCase();
    if (clean.includes('.')) {
      const [aName, eName] = clean.split('.').map((s) => s.trim());
      const aId = actorByName.get(aName);
      const found = model.elements.find(
        (el) =>
          el.name.toLowerCase() === eName && (!aId || el.actorId === aId),
      );
      return { actorId: aId ?? found?.actorId ?? undefined, elementId: found?.id ?? null };
    }
    const aId = actorByName.get(clean);
    if (aId) return { actorId: aId, elementId: null };
    const eId = elementByName.get(clean);
    if (eId) {
      const el = model.elements.find((item) => item.id === eId);
      return { actorId: el?.actorId ?? undefined, elementId: eId };
    }
    return { elementId: null };
  };

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;

    const titleMatch = /^(?:name|model)\s*:\s*(.+)$/i.exec(line);
    if (titleMatch) {
      model.name = titleMatch[1].trim();
      continue;
    }

    const actorMatch = /^(actor|agent|role)\s*:\s*(.+)$/i.exec(line);
    if (actorMatch) {
      const decl = actorMatch[1].toLowerCase();
      const body = actorMatch[2];
      const paren = /\((agent|role|actor)\)/i.exec(body);
      const kind: ActorKind =
        decl === 'agent' || paren?.[1]?.toLowerCase() === 'agent'
          ? 'agent'
          : decl === 'role' || paren?.[1]?.toLowerCase() === 'role'
            ? 'role'
            : 'actor';
      const name = body.replace(/\([^)]*\)\s*$/, '').trim();
      if (name) {
        actorSeq += 1;
        const id = `txt-actor-${actorSeq}`;
        actorByName.set(name.toLowerCase(), id);
        currentActorId = id;
        model.actors.push({
          id,
          name,
          kind,
          x: 100,
          y: 100,
          width: 280,
          height: 240,
          collapsed: false,
          customProperties: {},
        });
      }
      continue;
    }

    const elMatch = /^(goal|quality|softgoal|task|resource)\s*:\s*(.+)$/i.exec(
      line,
    );
    if (elMatch) {
      const kind = parseElementWord(elMatch[1]);
      let body = elMatch[2].trim();
      let actorId = currentActorId;
      const bracketMatch = /\[([^\]]+)\]\s*$/.exec(body);
      if (bracketMatch) {
        const mapped = actorByName.get(bracketMatch[1].trim().toLowerCase());
        if (mapped) actorId = mapped;
        body = body.slice(0, bracketMatch.index).trim();
      }
      if (body) {
        elSeq += 1;
        const id = `txt-el-${elSeq}`;
        const sz = defaultElementSize(kind);
        elementByName.set(body.toLowerCase(), id);
        model.elements.push({
          id,
          name: body,
          kind,
          actorId,
          x: 0,
          y: 0,
          width: sz.width,
          height: sz.height,
          customProperties: {},
        });
      }
      continue;
    }

    const depMatch = /^dependency\s*:\s*(.+?)\s*->\s*(.+?)\s*:\s*(.+)$/i.exec(
      line,
    );
    if (depMatch) {
      const srcEp = resolveEndpoint(depMatch[1]);
      const dstEp = resolveEndpoint(depMatch[2]);
      let dependumPart = depMatch[3].trim();
      let dependumKind: ElementKind = 'goal';
      const kindMatch = /\((goal|quality|softgoal|task|resource)\)\s*$/i.exec(
        dependumPart,
      );
      if (kindMatch) {
        dependumKind = parseElementWord(kindMatch[1]);
        dependumPart = dependumPart.slice(0, kindMatch.index).trim();
      }
      if (srcEp.actorId && dstEp.actorId) {
        depSeq += 1;
        model.dependencies.push({
          id: `txt-dep-${depSeq}`,
          dependerActorId: srcEp.actorId,
          dependerElementId: srcEp.elementId,
          dependeeActorId: dstEp.actorId,
          dependeeElementId: dstEp.elementId,
          dependumName: dependumPart || 'Dependum',
          dependumKind,
          x: 0,
          y: 0,
          customProperties: {},
        });
      }
      continue;
    }

    const arrowMidMatch = /^(?:link\s*:\s*)?(.+?)\s*--\s*([^-]+?)\s*-->\s*(.+)$/i.exec(
      line,
    );
    if (arrowMidMatch) {
      const sourceId = resolveNode(arrowMidMatch[1]);
      const targetId = resolveNode(arrowMidMatch[3]);
      if (sourceId && targetId) {
        linkSeq += 1;
        model.links.push({
          id: `txt-link-${linkSeq}`,
          sourceId,
          targetId,
          ...parseLinkWord(arrowMidMatch[2]),
        });
      }
      continue;
    }

    const arrowSimpleMatch = /^(?:link\s*:\s*)?(.+?)\s*->\s*(.+?)(?:\(([^)]+)\))?\s*$/i.exec(
      line,
    );
    if (arrowSimpleMatch) {
      const sourceId = resolveNode(arrowSimpleMatch[1]);
      const targetId = resolveNode(arrowSimpleMatch[2]);
      if (sourceId && targetId) {
        linkSeq += 1;
        model.links.push({
          id: `txt-link-${linkSeq}`,
          sourceId,
          targetId,
          ...parseLinkWord(arrowSimpleMatch[3] ?? 'andRefinement'),
        });
      }
    }
  }

  if (model.actors.length === 0 && model.elements.length === 0) {
    throw new Error(
      'Unrecognized .txt content: expected piStar JSON or i* 2.0 text declarations (Actor:, Goal:, Task:, ...).',
    );
  }

  layoutImportedModel(model);
  return model;
}

function isNativeLoneStarShape(parsed: Record<string, unknown>): boolean {
  return (
    Array.isArray(parsed.elements) &&
    parsed.orphans === undefined &&
    parsed.tool === undefined
  );
}

/**
 * True when `rawInput` is a native LoneStar JSON document (not piStar JSON nor i* text), i.e. a
 * file that can be overwritten with `exportModelToLoneStarJson` without changing its format.
 */
export function isLoneStarJsonDocument(rawInput: string): boolean {
  const cleaned = stripDataPrefix(rawInput);
  if (!cleaned.startsWith('{')) return false;
  try {
    const parsed: unknown = JSON.parse(cleaned);
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      isNativeLoneStarShape(parsed as Record<string, unknown>)
    );
  } catch {
    return false;
  }
}

export function importAnyJsonModel(rawInput: string): DiagramModel {
  const cleaned = stripDataPrefix(rawInput);
  if (!cleaned) {
    throw new Error('Empty file.');
  }

  if (!cleaned.startsWith('{')) {
    return importTextualIstarTxt(cleaned);
  }

  const parsed = JSON.parse(cleaned) as Record<string, unknown>;

  if (isNativeLoneStarShape(parsed)) {
    const m = parsed as unknown as DiagramModel;
    return {
      id: m.id ?? 'imported-model',
      name: m.name ?? 'Imported i* 2.0 Model',
      version: m.version ?? '2.0',
      actors: Array.isArray(m.actors) ? m.actors : [],
      elements: Array.isArray(m.elements) ? m.elements : [],
      links: Array.isArray(m.links) ? m.links : [],
      dependencies: Array.isArray(m.dependencies) ? m.dependencies : [],
      metadata: m.metadata ?? {
        author: '',
        description: '',
        createdAt: '',
        updatedAt: '',
      },
    };
  }

  const doc = parsed as unknown as Partial<PiStarDocument>;
  const resolvedName =
    (doc.name && doc.name.trim()) ||
    (doc.diagram?.name && doc.diagram.name.trim()) ||
    'Imported piStar Model';

  const model: DiagramModel = {
    id: 'imported-pistar',
    name: resolvedName,
    version: doc.istar ?? '2.0',
    actors: [],
    elements: [],
    links: [],
    dependencies: [],
    metadata: {
      author: '',
      description: 'Imported from piStar 2.0',
      createdAt: '',
      updatedAt: doc.saveDate ?? new Date().toISOString(),
    },
  };

  const elementToActor = new Map<string, string>();

  for (const pa of doc.actors ?? []) {
    const disp = doc.display?.[pa.id];
    const ax = pa.x && pa.x !== 0 ? pa.x : (disp?.x ?? pa.x ?? 100);
    const ay = pa.y && pa.y !== 0 ? pa.y : (disp?.y ?? pa.y ?? 100);
    let minX = ax;
    let minY = ay;
    let maxX = ax + 280;
    let maxY = ay + 240;

    for (const pn of pa.nodes ?? []) {
      const kind = piStarToElementKind(pn.type);
      const sz = defaultElementSize(kind);
      const nDisp = doc.display?.[pn.id];
      const ex = pn.x && pn.x !== 0 ? pn.x : (nDisp?.x ?? pn.x ?? ax + 40);
      const ey = pn.y && pn.y !== 0 ? pn.y : (nDisp?.y ?? pn.y ?? ay + 70);
      elementToActor.set(pn.id, pa.id);
      minX = Math.min(minX, ex - 24);
      minY = Math.min(minY, ey - 44);
      maxX = Math.max(maxX, ex + sz.width + 24);
      maxY = Math.max(maxY, ey + sz.height + 24);
      model.elements.push({
        id: pn.id,
        name: pn.text ?? '',
        kind,
        actorId: pa.id,
        x: ex,
        y: ey,
        width: sz.width,
        height: sz.height,
        customProperties: normalizeCustomProps(pn.customProperties as Record<string, unknown>),
      });
    }

    model.actors.push({
      id: pa.id,
      name: pa.text ?? 'Actor',
      kind: piStarToActorKind(pa.type),
      x: minX,
      y: minY,
      width: disp?.width ?? Math.max(280, maxX - minX),
      height: disp?.height ?? Math.max(240, maxY - minY),
      collapsed: disp?.collapsed ?? false,
      customProperties: normalizeCustomProps(pa.customProperties as Record<string, unknown>),
    });
  }

  for (const orphan of doc.orphans ?? []) {
    const kind = piStarToElementKind(orphan.type);
    const sz = defaultElementSize(kind);
    model.elements.push({
      id: orphan.id,
      name: orphan.text ?? '',
      kind,
      actorId: null,
      x: orphan.x ?? 80,
      y: orphan.y ?? 80,
      width: sz.width,
      height: sz.height,
      customProperties: normalizeCustomProps(orphan.customProperties as Record<string, unknown>),
    });
  }

  for (const dep of doc.dependencies ?? []) {
    const dDisp = doc.display?.[dep.id];
    const srcActor = elementToActor.get(dep.source);
    const dstActor = elementToActor.get(dep.target);
    model.dependencies.push({
      id: dep.id,
      dependerActorId: srcActor ?? dep.source,
      dependerElementId: srcActor ? dep.source : null,
      dependeeActorId: dstActor ?? dep.target,
      dependeeElementId: dstActor ? dep.target : null,
      dependumName: dep.text ?? 'Dependum',
      dependumKind: piStarToElementKind(dep.type),
      x: dep.x && dep.x !== 0 ? dep.x : (dDisp?.x ?? dep.x ?? 360),
      y: dep.y && dep.y !== 0 ? dep.y : (dDisp?.y ?? dep.y ?? 200),
      customProperties: normalizeCustomProps(dep.customProperties as Record<string, unknown>),
    });
  }

  for (const pl of doc.links ?? []) {
    if (pl.type === 'istar.DependencyLink') continue;
    const rawLink = pl as PiStarLink & { name?: string };
    const lk = piStarToLinkKind(pl.type, pl.label ?? rawLink.name);
    const link: Link = {
      id: pl.id,
      sourceId: pl.source,
      targetId: pl.target,
      ...lk,
    };
    model.links.push(link);
  }

  return model;
}

export function getBuiltinTemplateClient(templateId: string): DiagramModel {
  if (templateId === 'empty') {
    return {
      id: 'model-1',
      name: 'Untitled i* 2.0 Model',
      version: '2.0',
      actors: [],
      elements: [],
      links: [],
      dependencies: [],
      metadata: {
        author: '',
        description: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };
  }

  if (templateId === 'telemedicine') {
    return {
      id: 'tpl-telemed',
      name: 'Smart Telemedicine Platform (iStar 2.0)',
      version: '2.0',
      actors: [
        {
          id: 'a-patient',
          name: 'Patient',
          kind: 'role',
          x: 90,
          y: 100,
          width: 360,
          height: 310,
          collapsed: false,
          customProperties: {},
        },
        {
          id: 'a-platform',
          name: 'TeleMed Cloud',
          kind: 'agent',
          x: 590,
          y: 90,
          width: 360,
          height: 330,
          collapsed: false,
          customProperties: {},
        },
        {
          id: 'a-doctor',
          name: 'Physician',
          kind: 'role',
          x: 590,
          y: 480,
          width: 360,
          height: 240,
          collapsed: false,
          customProperties: {},
        },
      ],
      elements: [
        {
          id: 'e-care',
          name: 'Receive Timely Care',
          kind: 'goal',
          actorId: 'a-patient',
          x: 195,
          y: 165,
          width: 124,
          height: 50,
          customProperties: {},
        },
        {
          id: 'e-vitals',
          name: 'Share Wearable Vitals',
          kind: 'task',
          actorId: 'a-patient',
          x: 120,
          y: 285,
          width: 130,
          height: 52,
          customProperties: {},
        },
        {
          id: 'e-privacy',
          name: 'Data Privacy',
          kind: 'quality',
          actorId: 'a-patient',
          x: 290,
          y: 285,
          width: 128,
          height: 56,
          customProperties: {},
        },
        {
          id: 'e-triage',
          name: 'Automated Triage',
          kind: 'task',
          actorId: 'a-platform',
          x: 705,
          y: 160,
          width: 130,
          height: 52,
          customProperties: {},
        },
        {
          id: 'e-ehr',
          name: 'Encrypted EHR Store',
          kind: 'resource',
          actorId: 'a-platform',
          x: 625,
          y: 295,
          width: 122,
          height: 48,
          customProperties: {},
        },
        {
          id: 'e-uptime',
          name: 'High Availability',
          kind: 'quality',
          actorId: 'a-platform',
          x: 795,
          y: 295,
          width: 128,
          height: 56,
          customProperties: {},
        },
        {
          id: 'e-diagnose',
          name: 'Diagnose & Prescribe',
          kind: 'task',
          actorId: 'a-doctor',
          x: 705,
          y: 565,
          width: 130,
          height: 52,
          customProperties: {},
        },
      ],
      links: [
        { id: 'tl-1', sourceId: 'e-vitals', targetId: 'e-care', kind: 'orRefinement' },
        { id: 'tl-2', sourceId: 'e-privacy', targetId: 'e-care', kind: 'qualification' },
        { id: 'tl-3', sourceId: 'e-ehr', targetId: 'e-triage', kind: 'neededBy' },
        {
          id: 'tl-4',
          sourceId: 'e-triage',
          targetId: 'e-uptime',
          kind: 'contribution',
          value: 'help',
        },
      ],
      dependencies: [
        {
          id: 'td-1',
          dependerActorId: 'a-patient',
          dependerElementId: 'e-vitals',
          dependeeActorId: 'a-platform',
          dependeeElementId: 'e-triage',
          dependumName: '24/7 Health Triage',
          dependumKind: 'goal',
          x: 455,
          y: 190,
          customProperties: {},
        },
        {
          id: 'td-2',
          dependerActorId: 'a-platform',
          dependerElementId: 'e-triage',
          dependeeActorId: 'a-doctor',
          dependeeElementId: 'e-diagnose',
          dependumName: 'Clinical Review',
          dependumKind: 'task',
          x: 840,
          y: 430,
          customProperties: {},
        },
      ],
      metadata: {
        author: 'LoneStar',
        description: 'Smart Telemedicine iStar 2.0 template',
        createdAt: '',
        updatedAt: '',
      },
    };
  }

  return {
    id: 'tpl-travel',
    name: 'University Travel Reimbursement (iStar 2.0)',
    version: '2.0',
    actors: [
      {
        id: 'a-student',
        name: 'Student',
        kind: 'role',
        x: 80,
        y: 80,
        width: 410,
        height: 380,
        collapsed: false,
        customProperties: {},
      },
      {
        id: 'a-agency',
        name: 'Travel Agency',
        kind: 'agent',
        x: 660,
        y: 70,
        width: 350,
        height: 300,
        collapsed: false,
        customProperties: {},
      },
      {
        id: 'a-university',
        name: 'University Finance',
        kind: 'actor',
        x: 640,
        y: 470,
        width: 370,
        height: 290,
        collapsed: false,
        customProperties: {},
      },
      {
        id: 'a-phd',
        name: 'PhD Candidate',
        kind: 'role',
        x: 120,
        y: 560,
        width: 230,
        height: 170,
        collapsed: false,
        customProperties: {},
      },
    ],
    elements: [
      {
        id: 'e-reimb',
        name: 'Travel Reimbursed',
        kind: 'goal',
        actorId: 'a-student',
        x: 210,
        y: 140,
        width: 124,
        height: 50,
        customProperties: {},
      },
      {
        id: 'e-fast',
        name: 'Fast Approval',
        kind: 'quality',
        actorId: 'a-student',
        x: 335,
        y: 245,
        width: 128,
        height: 56,
        customProperties: {},
      },
      {
        id: 'e-book',
        name: 'Book Conference Trip',
        kind: 'task',
        actorId: 'a-student',
        x: 115,
        y: 255,
        width: 130,
        height: 52,
        customProperties: {},
      },
      {
        id: 'e-submit',
        name: 'Submit Expense Claim',
        kind: 'task',
        actorId: 'a-student',
        x: 115,
        y: 365,
        width: 130,
        height: 52,
        customProperties: {},
      },
      {
        id: 'e-receipts',
        name: 'Travel Receipts',
        kind: 'resource',
        actorId: 'a-student',
        x: 310,
        y: 365,
        width: 122,
        height: 48,
        customProperties: {},
      },
      {
        id: 'e-itinerary',
        name: 'Issue Optimal Itinerary',
        kind: 'task',
        actorId: 'a-agency',
        x: 760,
        y: 155,
        width: 130,
        height: 52,
        customProperties: {},
      },
      {
        id: 'e-lowcost',
        name: 'Low Ticket Cost',
        kind: 'quality',
        actorId: 'a-agency',
        x: 840,
        y: 265,
        width: 128,
        height: 56,
        customProperties: {},
      },
      {
        id: 'e-gds',
        name: 'Airline GDS Feed',
        kind: 'resource',
        actorId: 'a-agency',
        x: 685,
        y: 265,
        width: 122,
        height: 48,
        customProperties: {},
      },
      {
        id: 'e-audit',
        name: 'Expenses Verified',
        kind: 'goal',
        actorId: 'a-university',
        x: 760,
        y: 540,
        width: 124,
        height: 50,
        customProperties: {},
      },
      {
        id: 'e-payout',
        name: 'Approve & Wire Funds',
        kind: 'task',
        actorId: 'a-university',
        x: 760,
        y: 650,
        width: 130,
        height: 52,
        customProperties: {},
      },
    ],
    links: [
      { id: 'l-1', sourceId: 'e-book', targetId: 'e-reimb', kind: 'andRefinement' },
      { id: 'l-2', sourceId: 'e-submit', targetId: 'e-reimb', kind: 'andRefinement' },
      { id: 'l-3', sourceId: 'e-receipts', targetId: 'e-submit', kind: 'neededBy' },
      { id: 'l-4', sourceId: 'e-fast', targetId: 'e-reimb', kind: 'qualification' },
      {
        id: 'l-5',
        sourceId: 'e-submit',
        targetId: 'e-fast',
        kind: 'contribution',
        value: 'help',
      },
      { id: 'l-6', sourceId: 'e-gds', targetId: 'e-itinerary', kind: 'neededBy' },
      {
        id: 'l-7',
        sourceId: 'e-itinerary',
        targetId: 'e-lowcost',
        kind: 'contribution',
        value: 'make',
      },
      { id: 'l-8', sourceId: 'e-payout', targetId: 'e-audit', kind: 'orRefinement' },
      { id: 'l-9', sourceId: 'a-phd', targetId: 'a-student', kind: 'isA' },
    ],
    dependencies: [
      {
        id: 'd-1',
        dependerActorId: 'a-student',
        dependerElementId: 'e-book',
        dependeeActorId: 'a-agency',
        dependeeElementId: 'e-itinerary',
        dependumName: 'Flight Ticket',
        dependumKind: 'resource',
        x: 500,
        y: 185,
        customProperties: {},
      },
      {
        id: 'd-2',
        dependerActorId: 'a-student',
        dependerElementId: null,
        dependeeActorId: 'a-university',
        dependeeElementId: 'e-audit',
        dependumName: 'Reimbursement Approved',
        dependumKind: 'goal',
        x: 500,
        y: 445,
        customProperties: {},
      },
    ],
    metadata: {
      author: 'LoneStar',
      description: 'Canonical iStar 2.0 Travel Reimbursement diagram',
      createdAt: '',
      updatedAt: '',
    },
  };
}

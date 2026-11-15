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

interface PiStarDocument {
  actors: PiStarActor[];
  orphans: PiStarNode[];
  dependencies: PiStarDependency[];
  links: PiStarLink[];
  display: Record<string, { collapsed?: boolean; width?: number; height?: number }>;
  tool: string;
  istar: string;
  saveDate?: string;
  name?: string;
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

export function importAnyJsonModel(rawJson: string): DiagramModel {
  const parsed = JSON.parse(rawJson) as Record<string, unknown>;
  const isNative =
    Array.isArray(parsed.elements) &&
    parsed.orphans === undefined &&
    parsed.tool === undefined;

  if (isNative) {
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
  const model: DiagramModel = {
    id: 'imported-pistar',
    name: doc.name ?? 'Imported piStar Model',
    version: doc.istar ?? '2.0',
    actors: [],
    elements: [],
    links: [],
    dependencies: [],
    metadata: {
      author: '',
      description: 'Imported from piStar 2.0 JSON',
      createdAt: '',
      updatedAt: doc.saveDate ?? new Date().toISOString(),
    },
  };

  const elementToActor = new Map<string, string>();

  for (const pa of doc.actors ?? []) {
    const disp = doc.display?.[pa.id];
    const ax = pa.x ?? 100;
    const ay = pa.y ?? 100;
    let minX = ax;
    let minY = ay;
    let maxX = ax + 280;
    let maxY = ay + 240;

    for (const pn of pa.nodes ?? []) {
      const kind = piStarToElementKind(pn.type);
      const sz = defaultElementSize(kind);
      const ex = pn.x ?? ax + 40;
      const ey = pn.y ?? ay + 70;
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
        customProperties: pn.customProperties ?? {},
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
      customProperties: pa.customProperties ?? {},
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
      customProperties: orphan.customProperties ?? {},
    });
  }

  for (const dep of doc.dependencies ?? []) {
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
      x: dep.x ?? 360,
      y: dep.y ?? 200,
      customProperties: dep.customProperties ?? {},
    });
  }

  for (const pl of doc.links ?? []) {
    if (pl.type === 'istar.DependencyLink') continue;
    const lk = piStarToLinkKind(pl.type, pl.label);
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
          dependerElementId: 'e-care',
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
      { id: 'l-8', sourceId: 'e-payout', targetId: 'e-audit', kind: 'andRefinement' },
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
        dependerElementId: 'e-reimb',
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

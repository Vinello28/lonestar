import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  resolveDragConnection,
  validateModelClient,
  validateProposedLinkClient,
} from '../src/domain/istarRules';
import type { DiagramModel } from '../src/domain/types';
import {
  computeDiagramBounds,
  sanitizeFilename,
} from '../src/infrastructure/exportService';
import {
  exportModelToLoneStarJson,
  exportModelToPiStarJson,
  getBuiltinTemplateClient,
  importAnyJsonModel,
} from '../src/infrastructure/pistarCodec';

describe('iStar 2.0 client metamodel rules', () => {
  it('validates canonical travel and telemedicine templates cleanly', () => {
    for (const id of ['travel', 'telemedicine']) {
      const model = getBuiltinTemplateClient(id);
      const issues = validateModelClient(model);
      expect(issues.filter((i) => i.severity === 'error')).toHaveLength(0);
    }
  });

  it('enforces NeededBy, Contribution, Qualification, Refinement, and IsA constraints', () => {
    const model: DiagramModel = {
      id: 'm1',
      name: 'Test',
      version: '2.0',
      actors: [
        {
          id: 'a1',
          name: 'Student',
          kind: 'role',
          x: 0,
          y: 0,
          width: 300,
          height: 300,
          collapsed: false,
          customProperties: {},
        },
        {
          id: 'a2',
          name: 'Alice',
          kind: 'agent',
          x: 400,
          y: 0,
          width: 300,
          height: 300,
          collapsed: false,
          customProperties: {},
        },
      ],
      elements: [
        {
          id: 'g1',
          name: 'Pass Exam',
          kind: 'goal',
          actorId: 'a1',
          x: 40,
          y: 60,
          width: 124,
          height: 50,
          customProperties: {},
        },
        {
          id: 't1',
          name: 'Study Notes',
          kind: 'task',
          actorId: 'a1',
          x: 40,
          y: 160,
          width: 130,
          height: 52,
          customProperties: {},
        },
        {
          id: 'r1',
          name: 'Textbook',
          kind: 'resource',
          actorId: 'a1',
          x: 180,
          y: 160,
          width: 122,
          height: 48,
          customProperties: {},
        },
        {
          id: 'q1',
          name: 'Deep Understanding',
          kind: 'quality',
          actorId: 'a1',
          x: 180,
          y: 60,
          width: 128,
          height: 56,
          customProperties: {},
        },
        {
          id: 't2',
          name: 'Grade Exam',
          kind: 'task',
          actorId: 'a2',
          x: 440,
          y: 100,
          width: 130,
          height: 52,
          customProperties: {},
        },
      ],
      links: [],
      dependencies: [],
      metadata: { author: '', description: '', createdAt: '', updatedAt: '' },
    };

    expect(
      validateProposedLinkClient(model, 'r1', 't1', { kind: 'neededBy' }),
    ).toBeNull();
    expect(
      validateProposedLinkClient(model, 't1', 'r1', { kind: 'neededBy' }),
    ).not.toBeNull();

    expect(
      validateProposedLinkClient(model, 't1', 'q1', {
        kind: 'contribution',
        value: 'make',
      }),
    ).toBeNull();
    expect(
      validateProposedLinkClient(model, 't1', 'g1', {
        kind: 'contribution',
        value: 'help',
      }),
    ).not.toBeNull();

    expect(
      validateProposedLinkClient(model, 'q1', 'g1', { kind: 'qualification' }),
    ).toBeNull();
    expect(
      validateProposedLinkClient(model, 'g1', 'q1', { kind: 'qualification' }),
    ).not.toBeNull();

    // Cross-boundary element link rejected
    expect(
      validateProposedLinkClient(model, 't2', 'g1', { kind: 'andRefinement' }),
    ).not.toBeNull();

    // Agent -> Role is-a rejected, participates-in allowed
    expect(
      validateProposedLinkClient(model, 'a2', 'a1', { kind: 'isA' }),
    ).not.toBeNull();
    expect(
      validateProposedLinkClient(model, 'a2', 'a1', { kind: 'participatesIn' }),
    ).toBeNull();

    // Smart-connect auto-orients Resource <-> Task and detects Cross-Actor Dependency
    const smartRes = resolveDragConnection(model, 't1', 'r1', 'smart-link');
    expect(smartRes.valid).toBe(true);
    expect(smartRes.mode).toBe('link');
    expect(smartRes.linkKind).toEqual({ kind: 'neededBy' });
    expect(smartRes.orientedSourceId).toBe('r1');
    expect(smartRes.orientedTargetId).toBe('t1');

    const crossActor = resolveDragConnection(model, 't1', 't2', 'smart-link');
    expect(crossActor.valid).toBe(true);
    expect(crossActor.mode).toBe('dependency');
    expect(crossActor.dependerActorId).toBe('a1');
    expect(crossActor.dependeeActorId).toBe('a2');
  });
});

describe('piStar & LoneStar JSON interop', () => {
  it('round-trips models through piStar 2.0 JSON and native LoneStar JSON', () => {
    const original = getBuiltinTemplateClient('travel');
    const pistarRaw = exportModelToPiStarJson(original);
    expect(pistarRaw).toContain('"tool": "pistar.2.1.0"');
    expect(pistarRaw).toContain('"istar.Role"');

    const imported = importAnyJsonModel(pistarRaw);
    expect(imported.actors).toHaveLength(original.actors.length);
    expect(imported.elements).toHaveLength(original.elements.length);
    expect(imported.links).toHaveLength(original.links.length);
    expect(imported.dependencies).toHaveLength(original.dependencies.length);

    const nativeRaw = exportModelToLoneStarJson(original);
    const importedNative = importAnyJsonModel(nativeRaw);
    expect(importedNative.name).toBe(original.name);
    expect(importedNative.actors).toHaveLength(original.actors.length);
  });
});

describe('Export bounds & filename helpers', () => {
  it('computes tight diagram bounds and sanitizes filenames', () => {
    const model = getBuiltinTemplateClient('travel');
    const bounds = computeDiagramBounds(model, 40);
    expect(bounds.width).toBeGreaterThan(800);
    expect(bounds.height).toBeGreaterThan(500);
    expect(sanitizeFilename('University Travel (i* 2.0)!')).toBe(
      'university-travel-i-2-0',
    );
  });
});

describe('Warm theme invariant (no bluish background tint)', () => {
  it('ensures every background surface color in app.css and docs/styles.css has R >= G >= B', () => {
    const cssFiles = [
      resolve(process.cwd(), 'src/app.css'),
      resolve(process.cwd(), 'docs/styles.css'),
    ];

    const bgLineRegex = /--bg-[a-z-]+:\s*([^;]+);/g;
    const hexRegex = /#([0-9a-fA-F]{6})/;
    const rgbaRegex = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/;

    for (const file of cssFiles) {
      const content = readFileSync(file, 'utf8');
      let match: RegExpExecArray | null;
      while ((match = bgLineRegex.exec(content)) !== null) {
        const val = match[1].trim();
        const hexMatch = hexRegex.exec(val);
        const rgbaMatch = rgbaRegex.exec(val);
        let r = 0;
        let g = 0;
        let b = 0;
        if (hexMatch) {
          const hex = hexMatch[1];
          r = parseInt(hex.slice(0, 2), 16);
          g = parseInt(hex.slice(2, 4), 16);
          b = parseInt(hex.slice(4, 6), 16);
        } else if (rgbaMatch) {
          r = parseInt(rgbaMatch[1], 10);
          g = parseInt(rgbaMatch[2], 10);
          b = parseInt(rgbaMatch[3], 10);
        } else {
          continue;
        }
        expect(r, `${file}: ${val} has B > R`).toBeGreaterThanOrEqual(b);
        expect(r, `${file}: ${val} has G > R`).toBeGreaterThanOrEqual(g);
        expect(g, `${file}: ${val} has B > G`).toBeGreaterThanOrEqual(b);
      }
    }
  });
});

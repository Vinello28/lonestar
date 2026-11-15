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
  resolveStandaloneSvgAttributeValues,
  sanitizeFilename,
} from '../src/infrastructure/exportService';
import {
  exportModelToLoneStarJson,
  exportModelToPiStarJson,
  getBuiltinTemplateClient,
  importAnyJsonModel,
} from '../src/infrastructure/pistarCodec';
import { compareSemver } from '../src/application/updateStore.svelte';
import {
  AGENT_PRESET_DEFAULTS,
  agentStore,
  defaultAgentConfig,
} from '../src/application/agentStore.svelte';
import { isTauriRuntime } from '../src/infrastructure/backendAdapter';

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

  it('imports piStar .txt (JSON with BOM/diagram/customProperties) and textual .txt models', () => {
    const pistarTxt = `\uFEFF${JSON.stringify({
      actors: [
        {
          id: 'a1',
          text: 'Student',
          type: 'istar.Role',
          x: 50,
          y: 70,
          customProperties: { Semester: 2 },
          nodes: [
            {
              id: 'g1',
              text: 'Graduate',
              type: 'istar.Goal',
              x: 80,
              y: 120,
              customProperties: { Mandatory: true },
            },
          ],
        },
      ],
      orphans: [],
      dependencies: [],
      links: [],
      display: {},
      diagram: { name: 'University TXT Export', width: 1200, height: 800 },
      tool: 'pistar.2.1.0',
      istar: '2.0',
    })}`;

    const imported = importAnyJsonModel(pistarTxt);
    expect(imported.name).toBe('University TXT Export');
    expect(imported.actors).toHaveLength(1);
    expect(imported.elements[0].customProperties.Mandatory).toBe('true');

    const textual = `
Model: Online Exam TXT
Role: Student
Goal: Pass Exam
Task: Submit Answers
Submit Answers --and--> Pass Exam
Agent: Proctor
Task: Verify Identity
Dependency: Student.Submit Answers -> Proctor.Verify Identity : Exam Auth (resource)
`;
    const fromText = importAnyJsonModel(textual);
    expect(fromText.name).toBe('Online Exam TXT');
    expect(fromText.actors).toHaveLength(2);
    expect(fromText.elements).toHaveLength(3);
    expect(fromText.links).toHaveLength(1);
    expect(fromText.dependencies).toHaveLength(1);
    expect(compareSemver('1.2.0', '1.0.0')).toBeGreaterThan(0);
    expect(compareSemver('v1.0.0', '1.0.0')).toBe(0);
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

  it('resolves CSS var() and rgba() colors to standalone SVG 1.1 attributes', () => {
    const rawSvg = `<svg xmlns="http://www.w3.org/2000/svg"><defs><marker id="m" orient="auto-start-reverse"><path fill="var(--link-stroke)"/></marker></defs><rect fill="var(--bg-actor-boundary)" stroke="var(--border-actor)"/><rect fill="var(--goal-fill)" stroke="var(--goal-stroke)"/><!----><text fill="var(--text-primary)">Book Trip</text></svg>`;

    const lightSvg = resolveStandaloneSvgAttributeValues(rawSvg, 'light');
    expect(lightSvg).not.toContain('var(--');
    expect(lightSvg).not.toContain('rgba(');
    expect(lightSvg).not.toContain('<!---->');
    expect(lightSvg).toContain('orient="auto"');
    expect(lightSvg).toContain('fill="#ebe7de" fill-opacity="0.6"');
    expect(lightSvg).toContain('fill="#fbe2c4"');
    expect(lightSvg).toContain('stroke="#9c5618"');
    expect(lightSvg).toContain('fill="#1f1d1a"');

    const darkSvg = resolveStandaloneSvgAttributeValues(rawSvg, 'dark');
    expect(darkSvg).not.toContain('var(--');
    expect(darkSvg).toContain('fill="#292722" fill-opacity="0.6"');
    expect(darkSvg).toContain('fill="#f3efe7"');
  });
});

describe('UI version placement & GitHub Pages AI documentation', () => {
  it('moves version badge out of top Toolbar into SettingsModal and documents AI Agent on GH Pages', () => {
    const toolbar = readFileSync(
      resolve(process.cwd(), 'src/presentation/Toolbar.svelte'),
      'utf8',
    );
    const settings = readFileSync(
      resolve(process.cwd(), 'src/presentation/SettingsModal.svelte'),
      'utf8',
    );
    const docsHtml = readFileSync(
      resolve(process.cwd(), 'docs/index.html'),
      'utf8',
    );

    expect(toolbar).not.toContain('brand-ver');
    expect(settings).toContain('Version v{updateStore.appVersion}');
    expect(docsHtml).toContain('id="ai-agent"');
    expect(docsHtml).toContain('LM Studio');
    expect(docsHtml).toContain('google/gemma-4-e4b');
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

describe('AI Agent defaults & Web Studio isolation', () => {
  it('defaults to local LM Studio Gemma 4 E4B and switches presets cleanly', () => {
    expect(isTauriRuntime()).toBe(false);

    const defaults = defaultAgentConfig();
    expect(defaults.providerPreset).toBe('lmstudio');
    expect(defaults.baseUrl).toBe('http://localhost:1234/v1');
    expect(defaults.model).toBe('google/gemma-4-e4b');
    expect(defaults.includeIstarDocs).toBe(true);

    expect(AGENT_PRESET_DEFAULTS.ollama.baseUrl).toBe('http://localhost:11434/v1');
    expect(AGENT_PRESET_DEFAULTS.openai.requiresKey).toBe(true);
    expect(AGENT_PRESET_DEFAULTS.openrouter.baseUrl).toBe('https://openrouter.ai/api/v1');

    agentStore.applyPreset('ollama');
    expect(agentStore.config.providerPreset).toBe('ollama');
    expect(agentStore.config.baseUrl).toBe('http://localhost:11434/v1');
    expect(agentStore.config.model).toBe('gemma4:e4b');

    agentStore.applyPreset('lmstudio');
    expect(agentStore.config.providerPreset).toBe('lmstudio');
    expect(agentStore.config.baseUrl).toBe('http://localhost:1234/v1');
  });
});

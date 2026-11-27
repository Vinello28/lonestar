import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  introducedErrorClient,
  resolveDragConnection,
  validateModelClient,
  validateProposedDependencyClient,
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
  isLoneStarJsonDocument,
} from '../src/infrastructure/pistarCodec';
import { compareSemver } from '../src/application/updateStore.svelte';
import {
  AGENT_PRESET_DEFAULTS,
  agentStore,
  defaultAgentConfig,
} from '../src/application/agentStore.svelte';
import {
  extractFileName,
  isFileNotFoundError,
  MAX_RECENT_PROJECTS,
  recentProjectsStore,
} from '../src/application/recentProjectsStore.svelte';
import {
  clampUiZoom,
  DEFAULT_UI_ZOOM,
  isMacPlatform,
  MAX_UI_ZOOM,
  MIN_UI_ZOOM,
  resolveSaveShortcut,
  resolveUiZoomShortcut,
  UI_ZOOM_STEP,
  uiStore,
} from '../src/application/uiStore.svelte';
import { backendAdapter, isTauriRuntime } from '../src/infrastructure/backendAdapter';
import { modelStore } from '../src/application/modelStore.svelte';

describe('iStar 2.0 client metamodel rules', () => {
  it('validates canonical travel and telemedicine templates cleanly without errors or warnings', () => {
    for (const id of ['travel', 'telemedicine']) {
      const model = getBuiltinTemplateClient(id);
      const issues = validateModelClient(model);
      expect(issues).toHaveLength(0);
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

  it('enforces strict iStar 2.0 integrity rules and smart-connect semantics on client', () => {
    const model: DiagramModel = {
      id: 'm-strict',
      name: 'Strict Rules',
      version: '2.0',
      actors: [
        {
          id: 'a1',
          name: 'Student',
          kind: 'role',
          x: 0,
          y: 0,
          width: 350,
          height: 300,
          collapsed: false,
          customProperties: {},
        },
        {
          id: 'a2',
          name: 'Library',
          kind: 'agent',
          x: 450,
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
          name: 'Parent Goal',
          kind: 'goal',
          actorId: 'a1',
          x: 20,
          y: 40,
          width: 124,
          height: 50,
          customProperties: {},
        },
        {
          id: 't1',
          name: 'Task 1',
          kind: 'task',
          actorId: 'a1',
          x: 20,
          y: 140,
          width: 130,
          height: 52,
          customProperties: {},
        },
        {
          id: 't2',
          name: 'Task 2',
          kind: 'task',
          actorId: 'a1',
          x: 170,
          y: 140,
          width: 130,
          height: 52,
          customProperties: {},
        },
        {
          id: 'q1',
          name: 'Speed',
          kind: 'quality',
          actorId: 'a1',
          x: 180,
          y: 40,
          width: 128,
          height: 56,
          customProperties: {},
        },
        {
          id: 'q2',
          name: 'Usability',
          kind: 'quality',
          actorId: 'a1',
          x: 180,
          y: 220,
          width: 128,
          height: 56,
          customProperties: {},
        },
        {
          id: 't_ext',
          name: 'Lend Book',
          kind: 'task',
          actorId: 'a2',
          x: 480,
          y: 80,
          width: 130,
          height: 52,
          customProperties: {},
        },
        {
          id: 'orphan',
          name: 'Floating Goal',
          kind: 'goal',
          actorId: null,
          x: 480,
          y: 220,
          width: 124,
          height: 50,
          customProperties: {},
        },
      ],
      links: [
        { id: 'l-or1', sourceId: 't1', targetId: 'g1', kind: 'orRefinement' },
        { id: 'l-qual', sourceId: 'q1', targetId: 't1', kind: 'qualification' },
        {
          id: 'l-c1',
          sourceId: 'q1',
          targetId: 'q2',
          kind: 'contribution',
          value: 'help',
        },
      ],
      dependencies: [],
      metadata: { author: '', description: '', createdAt: '', updatedAt: '' },
    };

    // Orphan element produces an error
    const issues = validateModelClient(model);
    expect(
      issues.some((i) => i.severity === 'error' && i.rule === 'istar.boundary'),
    ).toBe(true);

    // Mixed AND/OR on g1 rejected; smart-connect matches existing OR refinement
    expect(
      validateProposedLinkClient(model, 't2', 'g1', { kind: 'andRefinement' }),
    ).not.toBeNull();
    const smartOr = resolveDragConnection(model, 't2', 'g1', 'smart-link');
    expect(smartOr.valid).toBe(true);
    expect(smartOr.linkKind).toEqual({ kind: 'orRefinement' });

    // Single AND child warning
    model.links = [
      { id: 'l-and1', sourceId: 't1', targetId: 'g1', kind: 'andRefinement' },
      { id: 'l-qual', sourceId: 'q1', targetId: 't1', kind: 'qualification' },
      {
        id: 'l-c1',
        sourceId: 'q1',
        targetId: 'q2',
        kind: 'contribution',
        value: 'help',
      },
    ];
    expect(
      validateModelClient(model).some(
        (i) => i.severity === 'warning' && i.rule === 'istar.refinement.singleAndChild',
      ),
    ).toBe(true);

    // Contribution + Qualification conflict rejected
    expect(
      validateProposedLinkClient(model, 't1', 'q1', {
        kind: 'contribution',
        value: 'help',
      }),
    ).not.toBeNull();

    // Guide section 8 only forbids a quality contributing to itself; mutual contributions
    // between two qualities (Q2 -> Q1 on top of Q1 -> Q2) are conformant.
    expect(
      validateProposedLinkClient(model, 'q2', 'q1', {
        kind: 'contribution',
        value: 'make',
      }),
    ).toBeNull();
    expect(
      validateProposedLinkClient(model, 'q1', 'q1', {
        kind: 'contribution',
        value: 'make',
      }),
    ).not.toBeNull();

    // Depender element ownership and refinement prohibition
    expect(
      validateProposedDependencyClient(model, {
        dependerActorId: 'a1',
        dependerElementId: 't_ext', // belongs to a2, not a1
        dependeeActorId: 'a2',
        dependeeElementId: null,
        dependumName: 'Bad',
        dependumKind: 'task',
        x: 0,
        y: 0,
      }),
    ).not.toBeNull();

    expect(
      validateProposedDependencyClient(model, {
        dependerActorId: 'a1',
        dependerElementId: 'g1', // refined parent cannot be dependerElmt
        dependeeActorId: 'a2',
        dependeeElementId: 't_ext',
        dependumName: 'Bad',
        dependumKind: 'goal',
        x: 0,
        y: 0,
      }),
    ).not.toBeNull();

    // Dragging a dependency out of refined g1 is blocked cleanly
    const blockedDepDrag = resolveDragConnection(model, 'g1', 't_ext', 'smart-link');
    expect(blockedDepDrag.valid).toBe(false);

    // Adding valid dependency on t2 blocks subsequent refinement/contribution targeting t2
    model.dependencies.push({
      id: 'dep-1',
      dependerActorId: 'a1',
      dependerElementId: 't2',
      dependeeActorId: 'a2',
      dependeeElementId: 't_ext',
      dependumName: 'Book Loan',
      dependumKind: 'task',
      x: 350,
      y: 120,
      customProperties: {},
    });
    expect(
      validateProposedLinkClient(model, 't1', 't2', { kind: 'orRefinement' }),
    ).not.toBeNull();
  });

  it('renders canonical iStar 2.0 Role smile arc, filled NeededBy circle, and label-free refinement links', () => {
    const actorNode = readFileSync(
      resolve(process.cwd(), 'src/presentation/shapes/ActorNode.svelte'),
      'utf8',
    );
    const palette = readFileSync(
      resolve(process.cwd(), 'src/presentation/Palette.svelte'),
      'utf8',
    );
    const linkEdge = readFileSync(
      resolve(process.cwd(), 'src/presentation/shapes/LinkEdge.svelte'),
      'utf8',
    );

    // Downward smile curve (control point below yArc = badgeCy + 0.46 * badgeR)
    expect(actorNode).toContain('badgeCy + badgeR * 0.94');
    expect(palette).toContain('M 9 23 Q 20 29 31 23');

    // NeededBy solid filled circle and no AND/OR text pills
    expect(linkEdge).toContain('fill={strokeColor}');
    expect(linkEdge).not.toContain("return 'AND'");
    expect(linkEdge).not.toContain("return 'OR'");
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

describe('macOS bundle signing', () => {
  it('configures ad-hoc signingIdentity in tauri.conf.json so Info.plist and resources are sealed', () => {
    const tauriConf = JSON.parse(
      readFileSync(
        resolve(process.cwd(), 'src-tauri/tauri.conf.json'),
        'utf8',
      ),
    ) as {
      bundle?: { macOS?: { signingIdentity?: string } };
    };

    expect(tauriConf.bundle?.macOS?.signingIdentity).toBe('-');
  });
});

describe('Toolbar, AgentPanel & SettingsModal icon sizing', () => {
  it('uses symmetric centered SVG icons for AI Agent (Gemma star) and Settings (gear) alongside theme toggle', () => {
    const toolbar = readFileSync(
      resolve(process.cwd(), 'src/presentation/Toolbar.svelte'),
      'utf8',
    );
    const agentPanel = readFileSync(
      resolve(process.cwd(), 'src/presentation/AgentPanel.svelte'),
      'utf8',
    );
    const settingsModal = readFileSync(
      resolve(process.cwd(), 'src/presentation/SettingsModal.svelte'),
      'utf8',
    );

    expect(toolbar).toContain('class="tb-action-icon"');
    expect(toolbar).toContain('class="tb-icon-svg"');
    expect(toolbar).toContain('font-size: 18px');
    expect(toolbar).not.toContain('>✦<');
    expect(toolbar).not.toContain('>⚙<');
    expect(agentPanel).toContain('class="agent-title-icon"');
    expect(agentPanel).toContain('class="mini-btn icon-mini-btn"');
    expect(agentPanel).toContain('class="agent-icon-svg"');
    expect(settingsModal).toContain('class="theme-switch-icon"');
  });
});

describe('Offline Recent Projects store & missing file handling', () => {
  it('tracks up to 10 deduplicated diagram paths, extracts filenames, and handles missing files', () => {
    recentProjectsStore.clearAll();
    expect(MAX_RECENT_PROJECTS).toBe(10);

    expect(extractFileName('/home/user/diagrams/travel.lonestar.json')).toBe('travel.lonestar.json');
    expect(extractFileName('C:\\Users\\Alice\\Models\\telemedicine.pistar.txt')).toBe(
      'telemedicine.pistar.txt',
    );

    for (let i = 1; i <= 12; i++) {
      recentProjectsStore.recordProject(`/tmp/diagrams/project-${i}.lonestar.json`, `Diagram ${i}`);
    }

    expect(recentProjectsStore.entries).toHaveLength(10);
    expect(recentProjectsStore.entries[0].path).toBe('/tmp/diagrams/project-12.lonestar.json');
    expect(recentProjectsStore.entries[9].path).toBe('/tmp/diagrams/project-3.lonestar.json');

    // Recording an existing path promotes it to the top without duplicating
    recentProjectsStore.recordProject('/tmp/diagrams/project-5.lonestar.json', 'Diagram 5 Updated');
    expect(recentProjectsStore.entries).toHaveLength(10);
    expect(recentProjectsStore.entries[0].path).toBe('/tmp/diagrams/project-5.lonestar.json');
    expect(recentProjectsStore.entries[0].name).toBe('Diagram 5 Updated');

    // Missing file error detection and removal
    expect(isFileNotFoundError('FILE_NOT_FOUND: File not found at path: /tmp/missing.json')).toBe(true);
    expect(isFileNotFoundError('Failed to read file: No such file or directory (os error 2)')).toBe(true);
    expect(isFileNotFoundError('Invalid JSON syntax')).toBe(false);

    recentProjectsStore.removeProject('/tmp/diagrams/project-5.lonestar.json');
    expect(recentProjectsStore.entries).toHaveLength(9);
    expect(
      recentProjectsStore.entries.some((e) => e.path === '/tmp/diagrams/project-5.lonestar.json'),
    ).toBe(false);

    recentProjectsStore.clearAll();
  });

  it('guards the Recent Projects menu with isTauriRuntime() and removes missing entries on open failure', () => {
    const toolbar = readFileSync(
      resolve(process.cwd(), 'src/presentation/Toolbar.svelte'),
      'utf8',
    );

    expect(toolbar).toContain('recent-dropdown');
    expect(toolbar).toContain('handleOpenRecentProject');
    expect(toolbar).toContain('isFileNotFoundError');
    expect(toolbar).toContain('recentProjectsStore.removeProject');
    expect(toolbar).toContain('isTauriRuntime()');
  });
});

describe('GUI zoom shortcuts & Tauri webview zoom configuration', () => {
  it('clamps GUI zoom cleanly within [0.5, 2.0] and eliminates floating-point drift', () => {
    expect(MIN_UI_ZOOM).toBe(0.5);
    expect(MAX_UI_ZOOM).toBe(2);
    expect(DEFAULT_UI_ZOOM).toBe(1);
    expect(UI_ZOOM_STEP).toBe(0.1);

    expect(clampUiZoom(0.1)).toBe(0.5);
    expect(clampUiZoom(0.5)).toBe(0.5);
    expect(clampUiZoom(3.5)).toBe(2);
    expect(clampUiZoom(2)).toBe(2);
    expect(clampUiZoom(1 + 0.1 + 0.1 + 0.1)).toBe(1.3);
    expect(clampUiZoom(1 - 0.1 - 0.1 - 0.1)).toBe(0.7);
    expect(clampUiZoom(Number.NaN)).toBe(1);
    expect(clampUiZoom(Number.POSITIVE_INFINITY)).toBe(1);
    expect(clampUiZoom(Number.NEGATIVE_INFINITY)).toBe(1);
  });

  it('detects macOS/Darwin platforms accurately', () => {
    expect(isMacPlatform('macos')).toBe(true);
    expect(isMacPlatform('MacIntel')).toBe(true);
    expect(isMacPlatform('Darwin')).toBe(true);
    expect(isMacPlatform('linux')).toBe(false);
    expect(isMacPlatform('Win32')).toBe(false);
    expect(isMacPlatform('windows')).toBe(false);
    expect(isMacPlatform('')).toBe(false);
  });

  it('resolves Ctrl/Cmd +/-/0 shortcuts across IT/US/numpad layouts while rejecting conflicts', () => {
    // Linux / Windows (Ctrl)
    expect(
      resolveUiZoomShortcut(
        { key: '+', code: 'BracketRight', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false },
        false,
      ),
    ).toBe('in');
    expect(
      resolveUiZoomShortcut(
        { key: '=', code: 'Equal', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false },
        false,
      ),
    ).toBe('in');
    expect(
      resolveUiZoomShortcut(
        { key: '+', code: 'Equal', ctrlKey: true, metaKey: false, altKey: false, shiftKey: true },
        false,
      ),
    ).toBe('in');
    expect(
      resolveUiZoomShortcut(
        { key: '+', code: 'NumpadAdd', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false },
        false,
      ),
    ).toBe('in');
    expect(
      resolveUiZoomShortcut(
        { key: '-', code: 'Slash', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false },
        false,
      ),
    ).toBe('out');
    expect(
      resolveUiZoomShortcut(
        { key: '-', code: 'Minus', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false },
        false,
      ),
    ).toBe('out');
    expect(
      resolveUiZoomShortcut(
        { key: '-', code: 'NumpadSubtract', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false },
        false,
      ),
    ).toBe('out');
    expect(
      resolveUiZoomShortcut(
        { key: '_', code: 'Minus', ctrlKey: true, metaKey: false, altKey: false, shiftKey: true },
        false,
      ),
    ).toBe('out');
    expect(
      resolveUiZoomShortcut(
        { key: '0', code: 'Digit0', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false },
        false,
      ),
    ).toBe('reset');

    // macOS (Cmd)
    expect(
      resolveUiZoomShortcut(
        { key: '+', code: 'BracketRight', ctrlKey: false, metaKey: true, altKey: false, shiftKey: false },
        true,
      ),
    ).toBe('in');
    expect(
      resolveUiZoomShortcut(
        { key: '=', code: 'Equal', ctrlKey: false, metaKey: true, altKey: false, shiftKey: false },
        true,
      ),
    ).toBe('in');
    expect(
      resolveUiZoomShortcut(
        { key: '-', code: 'Slash', ctrlKey: false, metaKey: true, altKey: false, shiftKey: false },
        true,
      ),
    ).toBe('out');
    expect(
      resolveUiZoomShortcut(
        { key: '+', code: 'NumpadAdd', ctrlKey: false, metaKey: true, altKey: false, shiftKey: false },
        true,
      ),
    ).toBe('in');
    expect(
      resolveUiZoomShortcut(
        { key: '-', code: 'NumpadSubtract', ctrlKey: false, metaKey: true, altKey: false, shiftKey: false },
        true,
      ),
    ).toBe('out');
    expect(
      resolveUiZoomShortcut(
        { key: '0', code: 'Digit0', ctrlKey: false, metaKey: true, altKey: false, shiftKey: false },
        true,
      ),
    ).toBe('reset');

    // Rejections
    expect(
      resolveUiZoomShortcut(
        { key: '+', code: 'BracketRight', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false },
        true,
      ),
    ).toBeNull();
    expect(
      resolveUiZoomShortcut(
        { key: '+', code: 'BracketRight', ctrlKey: false, metaKey: true, altKey: false, shiftKey: false },
        false,
      ),
    ).toBeNull();
    expect(
      resolveUiZoomShortcut(
        { key: '+', code: 'BracketRight', ctrlKey: true, metaKey: false, altKey: true, shiftKey: false },
        false,
      ),
    ).toBeNull();
    expect(
      resolveUiZoomShortcut(
        { key: '=', code: 'Digit0', ctrlKey: true, metaKey: false, altKey: false, shiftKey: true },
        false,
      ),
    ).toBe('in');
    expect(
      resolveUiZoomShortcut(
        { key: '0', code: 'Digit0', ctrlKey: true, metaKey: false, altKey: false, shiftKey: true },
        false,
      ),
    ).toBeNull();
    expect(
      resolveUiZoomShortcut(
        { key: '_', code: 'Digit8', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false },
        false,
      ),
    ).toBeNull();
    expect(
      resolveUiZoomShortcut(
        { key: '+', code: 'BracketRight', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false },
        false,
      ),
    ).toBeNull();
    expect(
      resolveUiZoomShortcut(
        { key: '-', code: 'Slash', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false },
        false,
      ),
    ).toBeNull();
    expect(
      resolveUiZoomShortcut(
        { key: '0', code: 'Digit0', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false },
        false,
      ),
    ).toBeNull();
  });

  it('updates uiStore.uiZoom via zoomUiIn, zoomUiOut, and resetUiZoom with clamping', async () => {
    await uiStore.resetUiZoom();
    expect(uiStore.uiZoom).toBe(DEFAULT_UI_ZOOM);

    await uiStore.zoomUiIn();
    expect(uiStore.uiZoom).toBe(1.1);
    await uiStore.zoomUiIn();
    await uiStore.zoomUiIn();
    expect(uiStore.uiZoom).toBe(1.3);

    for (let i = 0; i < 12; i++) {
      await uiStore.zoomUiIn();
    }
    expect(uiStore.uiZoom).toBe(MAX_UI_ZOOM);

    await uiStore.zoomUiOut();
    expect(uiStore.uiZoom).toBe(1.9);

    for (let i = 0; i < 20; i++) {
      await uiStore.zoomUiOut();
    }
    expect(uiStore.uiZoom).toBe(MIN_UI_ZOOM);

    await uiStore.resetUiZoom();
    expect(uiStore.uiZoom).toBe(DEFAULT_UI_ZOOM);
  });

  it('configures Tauri capability permission, avoids zoomHotkeysEnabled conflict, and wires App/Canvas guards', () => {
    const capability = JSON.parse(
      readFileSync(
        resolve(process.cwd(), 'src-tauri/capabilities/default.json'),
        'utf8',
      ),
    ) as { permissions: string[] };
    expect(capability.permissions).toContain('core:webview:allow-set-webview-zoom');

    const tauriConf = JSON.parse(
      readFileSync(resolve(process.cwd(), 'src-tauri/tauri.conf.json'), 'utf8'),
    ) as { app?: { windows?: Array<{ zoomHotkeysEnabled?: boolean }> } };
    for (const win of tauriConf.app?.windows ?? []) {
      expect(win.zoomHotkeysEnabled).not.toBe(true);
    }

    const appSvelte = readFileSync(
      resolve(process.cwd(), 'src/App.svelte'),
      'utf8',
    );
    expect(appSvelte).toContain('resolveUiZoomShortcut');
    expect(appSvelte).toContain('isTauriRuntime()');
    expect(appSvelte).toContain('uiStore.initUiZoom()');
    expect(appSvelte).toContain('{ capture: true }');

    const canvasSvelte = readFileSync(
      resolve(process.cwd(), 'src/presentation/Canvas.svelte'),
      'utf8',
    );
    expect(canvasSvelte).toContain('if (e.ctrlKey || e.metaKey || e.altKey) return;');
  });
});

describe('GitHub Pages workflow configuration', () => {
  it('separates build and deploy jobs to prevent artifact indexing race conditions', () => {
    const pagesWorkflow = readFileSync(
      resolve(process.cwd(), '.github/workflows/pages.yml'),
      'utf8',
    );
    expect(pagesWorkflow).toContain('cancel-in-progress: false');
    expect(pagesWorkflow).toMatch(/\n  build:\n/);
    expect(pagesWorkflow).toMatch(/\n  deploy:\n/);
    expect(pagesWorkflow).toContain('needs: build');
    expect(pagesWorkflow).toContain('actions/upload-pages-artifact@v5');
    expect(pagesWorkflow).toContain('actions/deploy-pages@v5');
  });
});

function guardFixture(): DiagramModel {
  const actor = (id: string, name: string, kind: 'actor' | 'agent' | 'role', x: number) => ({
    id,
    name,
    kind,
    x,
    y: 0,
    width: 300,
    height: 300,
    collapsed: false,
    customProperties: {},
  });
  const element = (
    id: string,
    name: string,
    kind: 'goal' | 'task' | 'quality' | 'resource',
    actorId: string | null,
  ) => ({
    id,
    name,
    kind,
    actorId,
    x: 20,
    y: 40,
    width: 120,
    height: 50,
    customProperties: {},
  });
  return {
    id: 'm-guard',
    name: 'Guard',
    version: '2.0',
    actors: [actor('cust', 'Customer', 'role', 0), actor('bank', 'Bank', 'role', 400)],
    elements: [
      element('buy', 'Buy', 'goal', 'cust'),
      element('pay', 'Pay', 'task', 'cust'),
      element('browse', 'Browse', 'task', 'cust'),
    ],
    links: [
      { id: 'l1', sourceId: 'pay', targetId: 'buy', kind: 'andRefinement' },
      { id: 'l2', sourceId: 'browse', targetId: 'buy', kind: 'andRefinement' },
      { id: 'l3', sourceId: 'cust', targetId: 'bank', kind: 'isA' },
    ],
    dependencies: [],
    metadata: { author: '', description: '', createdAt: '', updatedAt: '' },
  };
}

describe('iStar 2.0 actor-link cycles are checked per link kind', () => {
  const chain = (kind: 'isA' | 'participatesIn') => {
    const model = guardFixture();
    model.actors = ['a1', 'a2', 'a3'].map((id) => ({
      id,
      name: id,
      kind: 'actor' as const,
      x: 0,
      y: 0,
      width: 300,
      height: 300,
      collapsed: false,
      customProperties: {},
    }));
    model.elements = [];
    model.links = [
      { id: 'c1', sourceId: 'a1', targetId: 'a2', kind },
      { id: 'c2', sourceId: 'a2', targetId: 'a3', kind },
    ];
    return model;
  };

  it('rejects a pure is-a cycle and a pure participates-in cycle', () => {
    for (const kind of ['isA', 'participatesIn'] as const) {
      const err = validateProposedLinkClient(chain(kind), 'a3', 'a1', { kind });
      expect(err, kind).not.toBeNull();
      expect(err).toContain('cycle');
    }
  });

  it('allows a loop that mixes is-a and participates-in edges', () => {
    const model = chain('isA');
    model.links[1] = { id: 'c2', sourceId: 'a2', targetId: 'a3', kind: 'participatesIn' };
    expect(
      validateProposedLinkClient(model, 'a3', 'a1', { kind: 'participatesIn' }),
    ).toBeNull();
  });
});

describe('iStar 2.0 conformance of direct edits', () => {
  const reset = () => {
    modelStore.model = guardFixture();
    modelStore.past = [];
    modelStore.future = [];
  };

  it('introducedErrorClient reports only errors the edit adds', () => {
    const before = guardFixture();
    expect(introducedErrorClient(before, before)).toBeNull();

    const renamed = guardFixture();
    renamed.elements[1].name = 'Pay now';
    expect(introducedErrorClient(before, renamed)).toBeNull();

    const reparented = guardFixture();
    reparented.elements[1].actorId = 'bank';
    expect(introducedErrorClient(before, reparented)).not.toBeNull();

    // A pre-existing orphan must not block unrelated edits to it.
    const orphan = guardFixture();
    orphan.elements.push({
      id: 'lonely',
      name: 'Lonely',
      kind: 'goal',
      actorId: null,
      x: 0,
      y: 0,
      width: 120,
      height: 50,
      customProperties: {},
    });
    const orphanRenamed = JSON.parse(JSON.stringify(orphan)) as DiagramModel;
    orphanRenamed.elements[3].name = 'Solo';
    expect(introducedErrorClient(orphan, orphanRenamed)).toBeNull();
  });

  it('modelStore rejects an element kind change that invalidates its links', () => {
    reset();
    const err = modelStore.updateElement('pay', { kind: 'resource' });
    expect(err).not.toBeNull();
    expect(modelStore.model.elements.find((e) => e.id === 'pay')?.kind).toBe('task');
    expect(modelStore.past).toHaveLength(0);
  });

  it('modelStore rejects an actor kind change that invalidates actor links', () => {
    reset();
    const err = modelStore.updateActor('cust', { kind: 'agent' });
    expect(err).not.toBeNull();
    expect(modelStore.model.actors.find((a) => a.id === 'cust')?.kind).toBe('role');
    expect(modelStore.past).toHaveLength(0);
  });

  it('modelStore rejects re-parenting that creates a cross-boundary link', () => {
    reset();
    expect(modelStore.updateElement('pay', { actorId: 'bank' })).not.toBeNull();
    expect(modelStore.model.elements.find((e) => e.id === 'pay')?.actorId).toBe('cust');

    const pay = modelStore.model.elements.find((e) => e.id === 'pay')!;
    const x0 = pay.x;
    expect(modelStore.moveElementBy('pay', 7, 7, 'bank')).not.toBeNull();
    expect(pay.actorId).toBe('cust');
    expect(pay.x).toBe(x0);

    // Dragging a linked element out of every boundary would orphan it.
    expect(modelStore.moveElementBy('pay', 7, 7, null)).not.toBeNull();
    expect(pay.actorId).toBe('cust');
  });

  it('modelStore still applies conformant edits and records history', () => {
    reset();
    expect(modelStore.updateElement('pay', { name: 'Pay now' })).toBeNull();
    expect(modelStore.model.elements.find((e) => e.id === 'pay')?.name).toBe('Pay now');
    expect(modelStore.past).toHaveLength(1);

    const pay = modelStore.model.elements.find((e) => e.id === 'pay')!;
    const x0 = pay.x;
    expect(modelStore.moveElementBy('pay', 5, 5, 'cust')).toBeNull();
    expect(pay.x).toBe(x0 + 5);

    expect(modelStore.updateActor('bank', { kind: 'actor' })).not.toBeNull(); // cust is-a bank: both must be roles
    expect(modelStore.updateActor('bank', { name: 'Bank Ltd' })).toBeNull();
    expect(modelStore.model.actors.find((a) => a.id === 'bank')?.name).toBe('Bank Ltd');
  });
});

describe('Save shortcuts & unsaved-changes tracking', () => {
  const key = (
    k: string,
    mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }>,
  ) => ({
    key: k,
    code: 'KeyS',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...mods,
  });

  it('resolves Ctrl+S / Cmd+S as save and the Shift variant as save-as on the right platform', () => {
    expect(resolveSaveShortcut(key('s', { ctrlKey: true }), false)).toBe('save');
    expect(resolveSaveShortcut(key('S', { ctrlKey: true, shiftKey: true }), false)).toBe('saveAs');
    expect(resolveSaveShortcut(key('s', { metaKey: true }), true)).toBe('save');
    expect(resolveSaveShortcut(key('S', { metaKey: true, shiftKey: true }), true)).toBe('saveAs');

    // Wrong primary modifier for the platform, AltGr, or no modifier at all.
    expect(resolveSaveShortcut(key('s', { metaKey: true }), false)).toBeNull();
    expect(resolveSaveShortcut(key('s', { ctrlKey: true }), true)).toBeNull();
    expect(resolveSaveShortcut(key('s', { ctrlKey: true, altKey: true }), false)).toBeNull();
    expect(resolveSaveShortcut(key('s', {}), false)).toBeNull();
    expect(resolveSaveShortcut(key('z', { ctrlKey: true }), false)).toBeNull();
  });

  it('recognises only native LoneStar JSON as a document Ctrl+S may overwrite', () => {
    const travel = getBuiltinTemplateClient('travel');
    expect(isLoneStarJsonDocument(exportModelToLoneStarJson(travel))).toBe(true);
    expect(isLoneStarJsonDocument(`\uFEFF${exportModelToLoneStarJson(travel)}`)).toBe(true);
    expect(isLoneStarJsonDocument(exportModelToPiStarJson(travel))).toBe(false);
    expect(isLoneStarJsonDocument('Actor: Traveler\nGoal: Trip booked')).toBe(false);
    expect(isLoneStarJsonDocument('{ not json')).toBe(false);
    expect(isLoneStarJsonDocument('')).toBe(false);
  });

  it('opening a document starts clean, bound to its file, with a fresh undo history', () => {
    modelStore.addActor('actor', 0, 0);
    expect(modelStore.canUndo).toBe(true);

    modelStore.openDocument(guardFixture(), '/tmp/diagrams/shop.lonestar.json');
    expect(modelStore.filePath).toBe('/tmp/diagrams/shop.lonestar.json');
    expect(modelStore.isDirty).toBe(false);
    expect(modelStore.canUndo).toBe(false);
    expect(modelStore.canRedo).toBe(false);
  });

  it('tracks edits as unsaved and becomes clean again when undone back to the saved state', () => {
    modelStore.openDocument(guardFixture(), '/tmp/diagrams/shop.lonestar.json');

    modelStore.updateElement('pay', { name: 'Pay now' });
    expect(modelStore.isDirty).toBe(true);

    modelStore.undo();
    expect(modelStore.isDirty).toBe(false);

    modelStore.redo();
    expect(modelStore.isDirty).toBe(true);

    // Direct writes outside history (title input, drags) count as edits too.
    modelStore.undo();
    modelStore.model.name = 'Renamed diagram';
    expect(modelStore.isDirty).toBe(true);
  });

  it('markSaved records what was written, so later edits are dirty again', () => {
    modelStore.openDocument(guardFixture());
    expect(modelStore.filePath).toBeNull();

    modelStore.updateElement('pay', { name: 'Pay now' });
    const written = exportModelToLoneStarJson(modelStore.model);
    modelStore.markSaved('/tmp/diagrams/shop.lonestar.json', written);
    expect(modelStore.isDirty).toBe(false);
    expect(modelStore.filePath).toBe('/tmp/diagrams/shop.lonestar.json');
    expect(modelStore.canUndo).toBe(true); // saving never touches history

    modelStore.updateElement('pay', { name: 'Pay later' });
    expect(modelStore.isDirty).toBe(true);
  });

  it('an edit made while a save is in flight stays unsaved', () => {
    modelStore.openDocument(guardFixture());
    const written = exportModelToLoneStarJson(modelStore.model);
    modelStore.updateElement('pay', { name: 'Edited during save' });
    modelStore.markSaved(null, written);
    expect(modelStore.isDirty).toBe(true);
  });

  it('loading a template starts a new untitled, clean document', async () => {
    modelStore.openDocument(guardFixture(), '/tmp/diagrams/shop.lonestar.json');
    modelStore.updateElement('pay', { name: 'Pay now' });

    await modelStore.loadTemplate('telemedicine');
    expect(modelStore.filePath).toBeNull();
    expect(modelStore.isDirty).toBe(false);
    expect(modelStore.canUndo).toBe(false);
  });

  it('wires the global save shortcut, the save actions and the indicator', () => {
    const appSvelte = readFileSync(resolve(process.cwd(), 'src/App.svelte'), 'utf8');
    expect(appSvelte).toContain('resolveSaveShortcut');
    expect(appSvelte).toContain('toolbarRef?.saveDocument');

    const toolbar = readFileSync(
      resolve(process.cwd(), 'src/presentation/Toolbar.svelte'),
      'utf8',
    );
    expect(toolbar).toContain('export async function saveDocument');
    expect(toolbar).toContain('modelStore.isDirty');
    expect(toolbar).toContain('modelStore.confirmDiscardChanges()');

    const canvas = readFileSync(
      resolve(process.cwd(), 'src/presentation/Canvas.svelte'),
      'utf8',
    );
    expect(canvas).toContain('modelStore.confirmDiscardChanges()');
    expect(canvas).toContain('modelStore.openDocument(');
  });
});

describe('Close guard for unsaved changes & toolbar Save button', () => {
  it('asks before discarding only when there are unsaved changes, and honours the answer', async () => {
    const confirmSpy = vi.spyOn(backendAdapter, 'confirm').mockResolvedValue(false);
    try {
      modelStore.openDocument(guardFixture());
      expect(await modelStore.confirmDiscardChanges()).toBe(true);
      expect(confirmSpy).not.toHaveBeenCalled();

      modelStore.updateElement('pay', { name: 'Pay now' });
      expect(await modelStore.confirmDiscardChanges()).toBe(false);
      expect(confirmSpy).toHaveBeenCalledTimes(1);

      confirmSpy.mockResolvedValue(true);
      expect(await modelStore.confirmDiscardChanges()).toBe(true);
    } finally {
      confirmSpy.mockRestore();
    }
  });

  it('guards window close on desktop and tab close on the web', () => {
    const appSvelte = readFileSync(resolve(process.cwd(), 'src/App.svelte'), 'utf8');
    expect(appSvelte).toContain('.onCloseRequested(() => modelStore.confirmDiscardChanges())');
    expect(appSvelte).toContain("'beforeunload'");

    const capability = JSON.parse(
      readFileSync(resolve(process.cwd(), 'src-tauri/capabilities/default.json'), 'utf8'),
    ) as { permissions: string[] };
    // onCloseRequested destroys the window itself once the guard lets it close.
    expect(capability.permissions).toContain('core:window:allow-destroy');

    const libRs = readFileSync(resolve(process.cwd(), 'src-tauri/src/lib.rs'), 'utf8');
    expect(libRs).toContain('CmdOrCtrl+Q');
    expect(libRs).toContain('on_menu_event');
    expect(libRs).toContain('.close()');
  });

  it('adds an icon Save button next to Open that saves the document', () => {
    const toolbar = readFileSync(
      resolve(process.cwd(), 'src/presentation/Toolbar.svelte'),
      'utf8',
    );
    expect(toolbar).toContain('class="tb-btn hero-control save-btn"');
    expect(toolbar).toContain('class:dirty={modelStore.isDirty}');
    const saveButton = toolbar.slice(toolbar.indexOf('save-btn"'));
    expect(saveButton.slice(0, 1200)).toContain('onclick={() => saveDocument()}');
    expect(saveButton.slice(0, 1200)).toContain('class="tb-icon-svg"');
  });
});

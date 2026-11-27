import {
  defaultElementSize,
  introducedErrorClient,
  validateModelClient,
  validateProposedDependencyClient,
  validateProposedLinkClient,
} from '../domain/istarRules';
import type {
  Actor,
  ActorKind,
  ContributionValue,
  Dependency,
  DiagramModel,
  ElementKind,
  IntentionalElement,
  Link,
  LinkKind,
  ValidationIssue,
} from '../domain/types';
import { backendAdapter } from '../infrastructure/backendAdapter';
import {
  exportModelToLoneStarJson,
  getBuiltinTemplateClient,
} from '../infrastructure/pistarCodec';

function uid(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

function cloneModel(model: DiagramModel): DiagramModel {
  return JSON.parse(JSON.stringify(model)) as DiagramModel;
}

class ModelStore {
  model = $state<DiagramModel>(getBuiltinTemplateClient('travel'));
  past = $state<DiagramModel[]>([]);
  future = $state<DiagramModel[]>([]);

  issues = $derived<ValidationIssue[]>(validateModelClient(this.model));
  errorCount = $derived<number>(
    this.issues.filter((i) => i.severity === 'error').length,
  );
  warningCount = $derived<number>(
    this.issues.filter((i) => i.severity === 'warning').length,
  );
  canUndo = $derived<boolean>(this.past.length > 0);
  canRedo = $derived<boolean>(this.future.length > 0);

  /** LoneStar JSON file the diagram is bound to (desktop only); null = untitled. */
  filePath = $state<string | null>(null);
  /** LoneStar JSON last written to (or loaded from) disk. */
  private savedContents = $state<string>(exportModelToLoneStarJson(this.model));
  /** Unsaved changes: what Save would write differs from what was saved, so undo can make it clean again. */
  isDirty = $derived<boolean>(
    exportModelToLoneStarJson(this.model) !== this.savedContents,
  );

  async initFromBackend(): Promise<void> {
    try {
      this.openDocument(await backendAdapter.loadInitialModel());
    } catch {
      // Fallback already populated
    }
  }

  /**
   * Starts a new document: an opened file, a template or the startup model. History is reset,
   * otherwise undo would bring back the previous diagram while still bound to the new file.
   */
  openDocument(model: DiagramModel, filePath: string | null = null): void {
    this.model = cloneModel(model);
    this.past = [];
    this.future = [];
    this.markSaved(filePath, exportModelToLoneStarJson(this.model));
  }

  /** Records that `contents` (the exact LoneStar JSON written) now lives at `filePath`. */
  markSaved(filePath: string | null, contents: string): void {
    this.filePath = filePath;
    this.savedContents = contents;
  }

  /** True when nothing would be lost by replacing the diagram, or the user agreed to discard. */
  async confirmDiscardChanges(): Promise<boolean> {
    if (!this.isDirty) return true;
    return backendAdapter.confirm(
      `"${this.model.name}" has unsaved changes. Discard them?`,
      'Unsaved Changes',
    );
  }

  pushHistory(): void {
    const snap = cloneModel(this.model);
    this.past = [...this.past.slice(-59), snap];
    this.future = [];
  }

  undo(): void {
    if (this.past.length === 0) return;
    const prev = this.past[this.past.length - 1];
    this.future = [cloneModel(this.model), ...this.future];
    this.past = this.past.slice(0, -1);
    this.model = prev;
  }

  redo(): void {
    if (this.future.length === 0) return;
    const next = this.future[0];
    this.past = [...this.past, cloneModel(this.model)];
    this.future = this.future.slice(1);
    this.model = next;
  }

  replaceModel(newModel: DiagramModel): void {
    this.pushHistory();
    this.model = cloneModel(newModel);
  }

  async loadTemplate(templateId: string): Promise<void> {
    this.openDocument(await backendAdapter.loadTemplate(templateId));
  }

  async applyAutoLayout(): Promise<void> {
    this.pushHistory();
    this.model = await backendAdapter.autoLayoutModel(cloneModel(this.model));
  }

  addActor(kind: ActorKind, x: number, y: number, name?: string): Actor {
    this.pushHistory();
    const labelMap: Record<ActorKind, string> = {
      actor: 'New Actor',
      agent: 'New Agent',
      role: 'New Role',
    };
    const actor: Actor = {
      id: uid('actor'),
      name: name ?? labelMap[kind],
      kind,
      x: Math.round(x - 140),
      y: Math.round(y - 120),
      width: 280,
      height: 240,
      collapsed: false,
      customProperties: {},
    };
    this.model.actors = [...this.model.actors, actor];
    return actor;
  }

  addElement(
    kind: ElementKind,
    x: number,
    y: number,
    actorId: string | null,
    name?: string,
  ): IntentionalElement {
    this.pushHistory();
    const sz = defaultElementSize(kind);
    const labelMap: Record<ElementKind, string> = {
      goal: 'New Goal',
      quality: 'New Quality',
      task: 'New Task',
      resource: 'New Resource',
    };
    const element: IntentionalElement = {
      id: uid('el'),
      name: name ?? labelMap[kind],
      kind,
      actorId,
      x: Math.round(x - sz.width / 2),
      y: Math.round(y - sz.height / 2),
      width: sz.width,
      height: sz.height,
      customProperties: {},
    };
    this.model.elements = [...this.model.elements, element];

    // Auto-expand actor boundary if dropped near the edge
    if (actorId) {
      this.expandActorToFitElement(actorId, element);
    }
    return element;
  }

  expandActorToFitElement(actorId: string, el: IntentionalElement): void {
    const actor = this.model.actors.find((a) => a.id === actorId);
    if (!actor) return;
    const pad = 28;
    const minRight = el.x + el.width + pad;
    const minBottom = el.y + el.height + pad;
    if (el.x - pad < actor.x) {
      const shift = actor.x - (el.x - pad);
      actor.x -= shift;
      actor.width += shift;
    }
    if (el.y - 44 < actor.y) {
      const shift = actor.y - (el.y - 44);
      actor.y -= shift;
      actor.height += shift;
    }
    if (minRight > actor.x + actor.width) {
      actor.width = minRight - actor.x;
    }
    if (minBottom > actor.y + actor.height) {
      actor.height = minBottom - actor.y;
    }
  }

  moveActorBy(actorId: string, dx: number, dy: number): void {
    const actor = this.model.actors.find((a) => a.id === actorId);
    if (!actor) return;
    actor.x += dx;
    actor.y += dy;
    for (const el of this.model.elements) {
      if (el.actorId === actorId) {
        el.x += dx;
        el.y += dy;
      }
    }
  }

  resizeActor(actorId: string, width: number, height: number): void {
    const actor = this.model.actors.find((a) => a.id === actorId);
    if (!actor) return;
    actor.width = Math.max(180, width);
    actor.height = Math.max(150, height);
  }

  /**
   * Why `elementId` cannot be owned by `actorId` (null = no actor), or null when it can.
   * Ownership decides which links are internal vs. cross-boundary, so it is validated like
   * any other edit instead of being trusted to the drag gesture.
   */
  elementOwnerError(elementId: string, actorId: string | null): string | null {
    return this.editError({ type: 'element', id: elementId, patch: { actorId } });
  }

  /** Moves an element; refuses (and leaves it untouched) if the new owner breaks iStar 2.0. */
  moveElementBy(
    elementId: string,
    dx: number,
    dy: number,
    targetActorId?: string | null,
  ): string | null {
    const el = this.model.elements.find((e) => e.id === elementId);
    if (!el) return null;
    if (targetActorId !== undefined && targetActorId !== el.actorId) {
      const err = this.elementOwnerError(elementId, targetActorId);
      if (err) return err;
      el.actorId = targetActorId;
    }
    el.x += dx;
    el.y += dy;
    return null;
  }

  moveDependencyBy(depId: string, dx: number, dy: number): void {
    const dep = this.model.dependencies.find((d) => d.id === depId);
    if (!dep) return;
    dep.x += dx;
    dep.y += dy;
  }

  addLink(
    sourceId: string,
    targetId: string,
    linkKind: LinkKind,
  ): { ok: boolean; error?: string; link?: Link } {
    const err = validateProposedLinkClient(
      this.model,
      sourceId,
      targetId,
      linkKind,
    );
    if (err) {
      return { ok: false, error: err };
    }
    this.pushHistory();
    const link: Link = {
      id: uid('link'),
      sourceId,
      targetId,
      ...linkKind,
    };
    this.model.links = [...this.model.links, link];
    return { ok: true, link };
  }

  addDependency(input: Omit<Dependency, 'id' | 'customProperties'>): {
    ok: boolean;
    error?: string;
    dependency?: Dependency;
  } {
    const err = validateProposedDependencyClient(this.model, input);
    if (err) {
      return { ok: false, error: err };
    }
    this.pushHistory();
    const dep: Dependency = {
      ...input,
      id: uid('dep'),
      customProperties: {},
    };
    this.model.dependencies = [...this.model.dependencies, dep];
    return { ok: true, dependency: dep };
  }

  updateActor(
    actorId: string,
    patch: Partial<Pick<Actor, 'name' | 'kind' | 'collapsed' | 'customProperties'>>,
  ): string | null {
    const actor = this.model.actors.find((a) => a.id === actorId);
    if (!actor) return null;
    const err = this.editError({ type: 'actor', id: actorId, patch });
    if (err) return err;
    this.pushHistory();
    Object.assign(actor, patch);
    return null;
  }

  updateElement(
    elementId: string,
    patch: Partial<
      Pick<IntentionalElement, 'name' | 'kind' | 'actorId' | 'customProperties'>
    >,
  ): string | null {
    const el = this.model.elements.find((e) => e.id === elementId);
    if (!el) return null;
    const err = this.editError({ type: 'element', id: elementId, patch });
    if (err) return err;
    this.pushHistory();
    Object.assign(el, patch);
    return null;
  }

  /**
   * First iStar 2.0 error the edit would introduce, judged on a throwaway copy. Only patches
   * that can change validity (kind / owner) are checked; renames and the like never block.
   */
  private editError(
    edit:
      | { type: 'actor'; id: string; patch: Partial<Actor> }
      | { type: 'element'; id: string; patch: Partial<IntentionalElement> },
  ): string | null {
    const touchesValidity = 'kind' in edit.patch || 'actorId' in edit.patch;
    if (!touchesValidity) return null;
    const candidate: DiagramModel =
      edit.type === 'actor'
        ? {
            ...this.model,
            actors: this.model.actors.map((a) =>
              a.id === edit.id ? { ...a, ...edit.patch } : a,
            ),
          }
        : {
            ...this.model,
            elements: this.model.elements.map((e) =>
              e.id === edit.id ? { ...e, ...edit.patch } : e,
            ),
          };
    return introducedErrorClient(this.model, candidate);
  }

  updateLinkKind(linkId: string, newKind: LinkKind): string | null {
    const link = this.model.links.find((l) => l.id === linkId);
    if (!link) return 'Link not found';

    const isRef = (k: LinkKind['kind']): k is 'andRefinement' | 'orRefinement' =>
      k === 'andRefinement' || k === 'orRefinement';
    if (
      isRef(link.kind) &&
      (newKind.kind === 'andRefinement' || newKind.kind === 'orRefinement')
    ) {
      if (link.kind === newKind.kind) return null;
      const targetKind: LinkKind = newKind;
      const switchedLinks: Link[] = this.model.links.map((l) =>
        l.targetId === link.targetId && isRef(l.kind)
          ? {
              id: l.id,
              sourceId: l.sourceId,
              targetId: l.targetId,
              ...targetKind,
            }
          : l,
      );
      const err = validateProposedLinkClient(
        { ...this.model, links: switchedLinks },
        link.sourceId,
        link.targetId,
        newKind,
        linkId,
      );
      if (err) return err;
      this.pushHistory();
      this.model.links = switchedLinks;
      return null;
    }

    const err = validateProposedLinkClient(
      this.model,
      link.sourceId,
      link.targetId,
      newKind,
      linkId,
    );
    if (err) return err;
    this.pushHistory();
    const updated: Link = {
      id: link.id,
      sourceId: link.sourceId,
      targetId: link.targetId,
      ...newKind,
    };
    this.model.links = this.model.links.map((l) => (l.id === linkId ? updated : l));
    return null;
  }

  cycleContribution(linkId: string): void {
    const link = this.model.links.find((l) => l.id === linkId);
    if (!link || link.kind !== 'contribution') return;
    const order: ContributionValue[] = ['make', 'help', 'hurt', 'break'];
    const next = order[(order.indexOf(link.value) + 1) % order.length];
    this.updateLinkKind(linkId, { kind: 'contribution', value: next });
  }

  toggleRefinement(linkId: string): void {
    const link = this.model.links.find((l) => l.id === linkId);
    if (!link) return;
    if (link.kind === 'andRefinement') {
      this.updateLinkKind(linkId, { kind: 'orRefinement' });
    } else if (link.kind === 'orRefinement') {
      this.updateLinkKind(linkId, { kind: 'andRefinement' });
    }
  }

  updateDependency(
    depId: string,
    patch: Partial<
      Pick<
        Dependency,
        | 'dependumName'
        | 'dependumKind'
        | 'dependerElementId'
        | 'dependeeElementId'
        | 'customProperties'
      >
    >,
  ): string | null {
    const dep = this.model.dependencies.find((d) => d.id === depId);
    if (!dep) return 'Dependency not found';
    if (
      patch.dependerElementId !== undefined ||
      patch.dependeeElementId !== undefined
    ) {
      const candidate = { ...dep, ...patch };
      const err = validateProposedDependencyClient(this.model, candidate, depId);
      if (err) return err;
    }
    this.pushHistory();
    Object.assign(dep, patch);
    return null;
  }

  removeActor(actorId: string): void {
    this.pushHistory();
    const childIds = new Set(
      this.model.elements
        .filter((e) => e.actorId === actorId)
        .map((e) => e.id),
    );
    this.model.actors = this.model.actors.filter((a) => a.id !== actorId);
    this.model.elements = this.model.elements.filter((e) => e.actorId !== actorId);
    this.model.links = this.model.links.filter(
      (l) =>
        l.sourceId !== actorId &&
        l.targetId !== actorId &&
        !childIds.has(l.sourceId) &&
        !childIds.has(l.targetId),
    );
    this.model.dependencies = this.model.dependencies.filter(
      (d) => d.dependerActorId !== actorId && d.dependeeActorId !== actorId,
    );
  }

  removeElement(elementId: string): void {
    this.pushHistory();
    this.model.elements = this.model.elements.filter((e) => e.id !== elementId);
    this.model.links = this.model.links.filter(
      (l) => l.sourceId !== elementId && l.targetId !== elementId,
    );
    this.model.dependencies = this.model.dependencies.map((d) => ({
      ...d,
      dependerElementId: d.dependerElementId === elementId ? null : d.dependerElementId,
      dependeeElementId: d.dependeeElementId === elementId ? null : d.dependeeElementId,
    }));
  }

  removeLink(linkId: string): void {
    this.pushHistory();
    this.model.links = this.model.links.filter((l) => l.id !== linkId);
  }

  removeDependency(depId: string): void {
    this.pushHistory();
    this.model.dependencies = this.model.dependencies.filter((d) => d.id !== depId);
  }
}

export const modelStore = new ModelStore();

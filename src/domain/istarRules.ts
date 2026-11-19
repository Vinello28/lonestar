import type {
  ActiveTool,
  Actor,
  ConnectionResolution,
  Dependency,
  DiagramModel,
  ElementKind,
  IntentionalElement,
  LinkKind,
  ValidationIssue,
} from './types';

export function defaultElementSize(kind: ElementKind): { width: number; height: number } {
  switch (kind) {
    case 'goal':
      return { width: 124, height: 50 };
    case 'quality':
      return { width: 128, height: 56 };
    case 'task':
      return { width: 130, height: 52 };
    case 'resource':
      return { width: 122, height: 48 };
  }
}

export function pointInsideActorBoundary(
  actor: Actor,
  px: number,
  py: number,
): boolean {
  if (actor.collapsed) {
    const cx = actor.x + actor.width / 2;
    const cy = actor.y + 42;
    const dx = px - cx;
    const dy = py - cy;
    return dx * dx + dy * dy <= 44 * 44;
  }
  return (
    px >= actor.x &&
    px <= actor.x + actor.width &&
    py >= actor.y &&
    py <= actor.y + actor.height
  );
}

export function findActorAtPoint(
  actors: Actor[],
  px: number,
  py: number,
): Actor | null {
  for (let i = actors.length - 1; i >= 0; i--) {
    if (pointInsideActorBoundary(actors[i], px, py)) {
      return actors[i];
    }
  }
  return null;
}

function hasDirectedPath(
  edges: Array<{ from: string; to: string }>,
  start: string,
  goal: string,
): boolean {
  if (start === goal) return true;
  const visited = new Set<string>([start]);
  const queue: string[] = [start];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    for (const edge of edges) {
      if (edge.from === curr) {
        if (edge.to === goal) return true;
        if (!visited.has(edge.to)) {
          visited.add(edge.to);
          queue.push(edge.to);
        }
      }
    }
  }
  return false;
}

export function validateProposedLinkClient(
  model: DiagramModel,
  sourceId: string,
  targetId: string,
  linkKind: LinkKind,
  ignoreLinkId?: string,
): string | null {
  if (sourceId === targetId) {
    return 'A link cannot connect an entity to itself.';
  }

  const isActorLink =
    linkKind.kind === 'isA' || linkKind.kind === 'participatesIn';

  if (isActorLink) {
    const srcActor = model.actors.find((a) => a.id === sourceId);
    const dstActor = model.actors.find((a) => a.id === targetId);
    if (!srcActor || !dstActor) {
      return 'Actor links (is-a / participates-in) can only connect Actors.';
    }

    if (linkKind.kind === 'isA') {
      const validPair =
        (srcActor.kind === 'actor' && dstActor.kind === 'actor') ||
        (srcActor.kind === 'role' && dstActor.kind === 'role');
      if (!validPair) {
        return 'Is-a links can only connect two generic Actors or two Roles (not Agents or mixed types).';
      }
    }

    const actorEdges: Array<{ from: string; to: string }> = [];
    for (const existing of model.links) {
      if (existing.id === ignoreLinkId) continue;
      if (existing.kind !== 'isA' && existing.kind !== 'participatesIn') continue;
      const samePair =
        (existing.sourceId === sourceId && existing.targetId === targetId) ||
        (existing.sourceId === targetId && existing.targetId === sourceId);
      if (samePair) {
        return 'Only one structural link (is-a or participates-in) is allowed between a pair of actors.';
      }
      actorEdges.push({ from: existing.sourceId, to: existing.targetId });
    }

    if (hasDirectedPath(actorEdges, targetId, sourceId)) {
      return 'Actor links cannot form a cycle.';
    }
    return null;
  }

  const srcEl = model.elements.find((e) => e.id === sourceId);
  const dstEl = model.elements.find((e) => e.id === targetId);
  if (!srcEl || !dstEl) {
    return 'Internal element links must connect two intentional elements.';
  }
  if (!srcEl.actorId || srcEl.actorId !== dstEl.actorId) {
    return 'Internal iStar 2.0 links must connect elements inside the same Actor boundary.';
  }

  for (const existing of model.links) {
    if (existing.id === ignoreLinkId) continue;
    if (
      existing.sourceId === sourceId &&
      existing.targetId === targetId &&
      existing.kind === linkKind.kind
    ) {
      return 'Duplicate link between these two elements.';
    }
    const conflictContribQual =
      (linkKind.kind === 'contribution' &&
        existing.sourceId === targetId &&
        existing.targetId === sourceId &&
        existing.kind === 'qualification') ||
      (linkKind.kind === 'qualification' &&
        existing.sourceId === targetId &&
        existing.targetId === sourceId &&
        existing.kind === 'contribution');
    if (conflictContribQual) {
      return 'A pair of elements cannot be connected by both a Contribution and a Qualification link.';
    }
  }

  switch (linkKind.kind) {
    case 'andRefinement':
    case 'orRefinement': {
      const validKinds =
        (srcEl.kind === 'goal' || srcEl.kind === 'task') &&
        (dstEl.kind === 'goal' || dstEl.kind === 'task');
      if (!validKinds) {
        return 'Refinement links (AND / OR) can only connect Goals or Tasks.';
      }
      if (model.dependencies.some((d) => d.dependerElementId === targetId)) {
        return 'A depender element cannot be refined or contributed to (the actor delegates it instead of fulfilling it internally).';
      }
      for (const existing of model.links) {
        if (existing.id === ignoreLinkId) continue;
        if (
          existing.targetId === targetId &&
          (existing.kind === 'andRefinement' || existing.kind === 'orRefinement') &&
          existing.kind !== linkKind.kind
        ) {
          return 'A parent Goal or Task cannot mix AND-refinement and OR-refinement links.';
        }
      }
      const refEdges = model.links
        .filter(
          (l) =>
            l.id !== ignoreLinkId &&
            (l.kind === 'andRefinement' || l.kind === 'orRefinement'),
        )
        .map((l) => ({ from: l.sourceId, to: l.targetId }));
      if (hasDirectedPath(refEdges, targetId, sourceId)) {
        return 'Refinement links cannot form a cycle.';
      }
      return null;
    }
    case 'neededBy':
      if (srcEl.kind === 'resource' && dstEl.kind === 'task') return null;
      return 'Needed-by links must connect a Resource (source) to a Task (target).';
    case 'contribution': {
      if (dstEl.kind !== 'quality') {
        return 'Contribution links must target a Quality element.';
      }
      if (model.dependencies.some((d) => d.dependerElementId === targetId)) {
        return 'A depender element cannot be refined or contributed to (the actor delegates it instead of fulfilling it internally).';
      }
      if (srcEl.kind === 'quality') {
        const contribEdges = model.links
          .filter((l) => l.id !== ignoreLinkId && l.kind === 'contribution')
          .map((l) => ({ from: l.sourceId, to: l.targetId }));
        if (hasDirectedPath(contribEdges, targetId, sourceId)) {
          return 'Contribution links between Qualities cannot form a cycle.';
        }
      }
      return null;
    }
    case 'qualification':
      if (
        srcEl.kind === 'quality' &&
        (dstEl.kind === 'goal' || dstEl.kind === 'task' || dstEl.kind === 'resource')
      ) {
        return null;
      }
      return 'Qualification links must go from a Quality to a Goal, Task, or Resource.';
  }
}

export function validateProposedDependencyClient(
  model: DiagramModel,
  dep: Omit<Dependency, 'id' | 'customProperties'>,
  _ignoreDepId?: string,
): string | null {
  if (dep.dependerActorId === dep.dependeeActorId) {
    return 'A dependency must connect two distinct actors (depender != dependee).';
  }
  if (!model.actors.some((a) => a.id === dep.dependerActorId)) {
    return `Depender actor "${dep.dependerActorId}" was not found in the model.`;
  }
  if (!model.actors.some((a) => a.id === dep.dependeeActorId)) {
    return `Dependee actor "${dep.dependeeActorId}" was not found in the model.`;
  }
  if (dep.dependerElementId) {
    const el = model.elements.find((e) => e.id === dep.dependerElementId);
    if (!el) {
      return `Depender element "${dep.dependerElementId}" was not found in the model.`;
    }
    if (el.actorId !== dep.dependerActorId) {
      return 'Depender element does not belong to the depender actor.';
    }
    const hasIncomingRefOrContrib = model.links.some(
      (l) =>
        l.targetId === dep.dependerElementId &&
        (l.kind === 'andRefinement' ||
          l.kind === 'orRefinement' ||
          l.kind === 'contribution'),
    );
    if (hasIncomingRefOrContrib) {
      return 'A depender element cannot be refined or contributed to (the actor delegates it instead of fulfilling it internally).';
    }
  }
  if (dep.dependeeElementId) {
    const el = model.elements.find((e) => e.id === dep.dependeeElementId);
    if (!el) {
      return `Dependee element "${dep.dependeeElementId}" was not found in the model.`;
    }
    if (el.actorId !== dep.dependeeActorId) {
      return 'Dependee element does not belong to the dependee actor.';
    }
  }
  return null;
}

function buildValidatedDependencyResolution(
  model: DiagramModel,
  dependerActorId: string,
  dependerElementId: string | null,
  dependeeActorId: string,
  dependeeElementId: string | null,
  hint: string,
): ConnectionResolution {
  const err = validateProposedDependencyClient(model, {
    dependerActorId,
    dependerElementId,
    dependeeActorId,
    dependeeElementId,
    dependumName: 'Dependum',
    dependumKind: 'goal',
    x: 0,
    y: 0,
  });
  if (err) {
    return { valid: false, mode: 'invalid', hint: err };
  }
  return {
    valid: true,
    mode: 'dependency',
    dependerActorId,
    dependerElementId,
    dependeeActorId,
    dependeeElementId,
    hint,
  };
}

/**
 * Resolves a drag-to-connect gesture between any two nodes (Actor or Element) into
 * the valid iStar 2.0 link or Social Dependency, or explains why the connection is invalid.
 */
export function resolveDragConnection(
  model: DiagramModel,
  sourceId: string,
  targetId: string,
  activeTool: ActiveTool,
): ConnectionResolution {
  if (sourceId === targetId) {
    return {
      valid: false,
      mode: 'invalid',
      hint: 'Cannot connect a node to itself.',
    };
  }

  const srcActor = model.actors.find((a) => a.id === sourceId);
  const dstActor = model.actors.find((a) => a.id === targetId);
  const srcEl = model.elements.find((e) => e.id === sourceId);
  const dstEl = model.elements.find((e) => e.id === targetId);

  const srcOwnerActorId = srcActor ? srcActor.id : srcEl?.actorId ?? null;
  const dstOwnerActorId = dstActor ? dstActor.id : dstEl?.actorId ?? null;

  // Explicit dependency tool or cross-actor drag
  if (
    activeTool === 'dependency' ||
    (activeTool === 'smart-link' &&
      srcOwnerActorId &&
      dstOwnerActorId &&
      srcOwnerActorId !== dstOwnerActorId &&
      !(srcActor && dstActor))
  ) {
    if (!srcOwnerActorId || !dstOwnerActorId) {
      return {
        valid: false,
        mode: 'invalid',
        hint: 'Dependencies must connect elements or boundaries owned by Actors.',
      };
    }
    if (srcOwnerActorId === dstOwnerActorId) {
      return {
        valid: false,
        mode: 'invalid',
        hint: 'A Social Dependency must connect two distinct Actors.',
      };
    }
    return buildValidatedDependencyResolution(
      model,
      srcOwnerActorId,
      srcEl ? srcEl.id : null,
      dstOwnerActorId,
      dstEl ? dstEl.id : null,
      'Create Social Dependency (Depender → Dependum → Dependee)',
    );
  }

  // Actor <-> Actor connections
  if (srcActor && dstActor) {
    if (activeTool === 'isA') {
      const err = validateProposedLinkClient(model, sourceId, targetId, { kind: 'isA' });
      return err
        ? { valid: false, mode: 'invalid', hint: err }
        : {
            valid: true,
            mode: 'link',
            linkKind: { kind: 'isA' },
            orientedSourceId: sourceId,
            orientedTargetId: targetId,
            hint: `is-a (${srcActor.name} is-a ${dstActor.name})`,
          };
    }
    if (activeTool === 'participatesIn') {
      const err = validateProposedLinkClient(model, sourceId, targetId, {
        kind: 'participatesIn',
      });
      return err
        ? { valid: false, mode: 'invalid', hint: err }
        : {
            valid: true,
            mode: 'link',
            linkKind: { kind: 'participatesIn' },
            orientedSourceId: sourceId,
            orientedTargetId: targetId,
            hint: `participates-in (${srcActor.name} → ${dstActor.name})`,
          };
    }

    // In smart-link / select mode, Actor -> Actor defaults to Social Dependency!
    return buildValidatedDependencyResolution(
      model,
      srcActor.id,
      null,
      dstActor.id,
      null,
      `Social Dependency: ${srcActor.name} depends on ${dstActor.name}`,
    );
  }

  // Element <-> Element connections
  if (srcEl && dstEl) {
    if (activeTool !== 'smart-link' && activeTool !== 'select') {
      const explicitKind: LinkKind | null =
        activeTool === 'andRefinement'
          ? { kind: 'andRefinement' }
          : activeTool === 'orRefinement'
            ? { kind: 'orRefinement' }
            : activeTool === 'neededBy'
              ? { kind: 'neededBy' }
              : activeTool === 'contribution'
                ? { kind: 'contribution', value: 'help' }
                : activeTool === 'qualification'
                  ? { kind: 'qualification' }
                  : null;
      if (explicitKind) {
        const err = validateProposedLinkClient(model, sourceId, targetId, explicitKind);
        return err
          ? { valid: false, mode: 'invalid', hint: err }
          : {
              valid: true,
              mode: 'link',
              linkKind: explicitKind,
              orientedSourceId: sourceId,
              orientedTargetId: targetId,
              hint: `Create ${formatLinkLabel(explicitKind)}`,
            };
      }
    }

    // Smart-link automatic inference inside same actor boundary
    if (srcEl.actorId && srcEl.actorId === dstEl.actorId) {
      const candidates: Array<{ src: string; dst: string; kind: LinkKind }> = [];
      if (srcEl.kind === 'resource' && dstEl.kind === 'task') {
        candidates.push({ src: srcEl.id, dst: dstEl.id, kind: { kind: 'neededBy' } });
      } else if (srcEl.kind === 'task' && dstEl.kind === 'resource') {
        candidates.push({ src: dstEl.id, dst: srcEl.id, kind: { kind: 'neededBy' } });
      } else if (dstEl.kind === 'quality') {
        candidates.push({
          src: srcEl.id,
          dst: dstEl.id,
          kind: { kind: 'contribution', value: 'help' },
        });
      } else if (srcEl.kind === 'quality') {
        candidates.push({ src: srcEl.id, dst: dstEl.id, kind: { kind: 'qualification' } });
      } else if (
        (srcEl.kind === 'goal' || srcEl.kind === 'task') &&
        (dstEl.kind === 'goal' || dstEl.kind === 'task')
      ) {
        const hasOr = model.links.some(
          (l) => l.targetId === dstEl.id && l.kind === 'orRefinement',
        );
        candidates.push({
          src: srcEl.id,
          dst: dstEl.id,
          kind: { kind: hasOr ? 'orRefinement' : 'andRefinement' },
        });
      }

      for (const c of candidates) {
        const err = validateProposedLinkClient(model, c.src, c.dst, c.kind);
        if (!err) {
          return {
            valid: true,
            mode: 'link',
            linkKind: c.kind,
            orientedSourceId: c.src,
            orientedTargetId: c.dst,
            hint: `Auto: ${formatLinkLabel(c.kind)}`,
          };
        }
      }
    }

    // Fallback: cross-actor element -> element creates a Social Dependency
    if (srcEl.actorId && dstEl.actorId && srcEl.actorId !== dstEl.actorId) {
      return buildValidatedDependencyResolution(
        model,
        srcEl.actorId,
        srcEl.id,
        dstEl.actorId,
        dstEl.id,
        'Create Social Dependency between Actors',
      );
    }

    return {
      valid: false,
      mode: 'invalid',
      hint: `No valid iStar 2.0 internal link between ${srcEl.kind} and ${dstEl.kind}.`,
    };
  }

  // Actor <-> Element across different actors -> Dependency
  if (srcOwnerActorId && dstOwnerActorId && srcOwnerActorId !== dstOwnerActorId) {
    return buildValidatedDependencyResolution(
      model,
      srcOwnerActorId,
      srcEl ? srcEl.id : null,
      dstOwnerActorId,
      dstEl ? dstEl.id : null,
      'Create Social Dependency across Actors',
    );
  }

  return {
    valid: false,
    mode: 'invalid',
    hint: 'Cannot connect an Actor boundary directly to its own internal element.',
  };
}

export function formatLinkLabel(kind: LinkKind): string {
  switch (kind.kind) {
    case 'isA':
      return 'is-a';
    case 'participatesIn':
      return 'participates-in';
    case 'andRefinement':
      return 'AND-refinement';
    case 'orRefinement':
      return 'OR-refinement';
    case 'neededBy':
      return 'needed-by';
    case 'contribution':
      return `contribution (${kind.value})`;
    case 'qualification':
      return 'qualification';
  }
}

export function validateModelClient(model: DiagramModel): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  let count = 0;
  const push = (
    severity: 'error' | 'warning',
    entityId: string | null,
    rule: string,
    message: string,
  ) => {
    count += 1;
    issues.push({ id: `val-${count}`, severity, entityId, rule, message });
  };

  for (const actor of model.actors) {
    if (!actor.name.trim()) {
      push('warning', actor.id, 'istar.naming', 'Actor has an empty name.');
    }
  }

  for (const el of model.elements) {
    if (!el.actorId) {
      push(
        'error',
        el.id,
        'istar.boundary',
        `Element "${el.name}" is outside an Actor boundary. Drag it inside an Actor.`,
      );
    } else if (!model.actors.some((a) => a.id === el.actorId)) {
      push(
        'error',
        el.id,
        'istar.boundary.missingActor',
        `Element "${el.name}" references missing Actor "${el.actorId}".`,
      );
    }
  }

  const refKindsByParent = new Map<string, Set<string>>();
  const andChildCountByParent = new Map<string, number>();
  for (const link of model.links) {
    const err = validateProposedLinkClient(
      model,
      link.sourceId,
      link.targetId,
      link,
      link.id,
    );
    if (err) {
      push('error', link.id, 'istar.link', err);
    }
    if (link.kind === 'andRefinement' || link.kind === 'orRefinement') {
      const set = refKindsByParent.get(link.targetId) ?? new Set<string>();
      set.add(link.kind);
      refKindsByParent.set(link.targetId, set);
      if (link.kind === 'andRefinement') {
        andChildCountByParent.set(
          link.targetId,
          (andChildCountByParent.get(link.targetId) ?? 0) + 1,
        );
      }
    }
  }

  for (const [parentId, kinds] of refKindsByParent.entries()) {
    if (kinds.size > 1) {
      const parent = model.elements.find((e) => e.id === parentId);
      push(
        'error',
        parentId,
        'istar.refinement.mixed',
        `Parent "${parent?.name ?? parentId}" mixes AND-refinement and OR-refinement links. iStar 2.0 forbids mixing refinement types on the same parent.`,
      );
    }
  }

  for (const [parentId, count] of andChildCountByParent.entries()) {
    if (count === 1) {
      const parent = model.elements.find((e) => e.id === parentId);
      push(
        'warning',
        parentId,
        'istar.refinement.singleAndChild',
        `Parent "${parent?.name ?? parentId}" has only one AND-refinement child. In iStar 2.0, AND-refinement requires at least 2 children (use OR-refinement for a single child).`,
      );
    }
  }

  for (const dep of model.dependencies) {
    const depErr = validateProposedDependencyClient(model, dep, dep.id);
    if (depErr) {
      push('error', dep.id, 'istar.dependency', depErr);
    }
    if (!dep.dependumName.trim()) {
      push(
        'warning',
        dep.id,
        'istar.dependency.naming',
        'Dependency dependum should have a descriptive name.',
      );
    }
  }

  return issues;
}

export function computeNodeCenter(
  entity: Pick<Actor | IntentionalElement, 'x' | 'y' | 'width' | 'height'>,
): { x: number; y: number } {
  return {
    x: entity.x + entity.width / 2,
    y: entity.y + entity.height / 2,
  };
}

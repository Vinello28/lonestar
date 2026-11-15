import type { Actor, Dependency, DiagramModel, IntentionalElement } from '../../domain/types';

export interface BoxBounds {
  cx: number;
  cy: number;
  x: number;
  y: number;
  width: number;
  height: number;
  isCircle: boolean;
  radius: number;
}

export function getActorAnchorBox(actor: Actor, forActorLink = false): BoxBounds {
  if (actor.collapsed || forActorLink) {
    const cx = actor.x + actor.width / 2;
    const cy = actor.collapsed ? actor.y + 42 : actor.y + 16;
    const r = actor.collapsed ? 40 : 34;
    return {
      cx,
      cy,
      x: cx - r,
      y: cy - r,
      width: r * 2,
      height: r * 2,
      isCircle: true,
      radius: r,
    };
  }
  return {
    cx: actor.x + actor.width / 2,
    cy: actor.y + actor.height / 2,
    x: actor.x,
    y: actor.y,
    width: actor.width,
    height: actor.height,
    isCircle: false,
    radius: 0,
  };
}

export function getElementBox(el: IntentionalElement): BoxBounds {
  return {
    cx: el.x + el.width / 2,
    cy: el.y + el.height / 2,
    x: el.x,
    y: el.y,
    width: el.width,
    height: el.height,
    isCircle: false,
    radius: 0,
  };
}

export function getDependencyBox(dep: Dependency): BoxBounds {
  const width = 122;
  const height = 48;
  return {
    cx: dep.x + width / 2,
    cy: dep.y + height / 2,
    x: dep.x,
    y: dep.y,
    width,
    height,
    isCircle: false,
    radius: 0,
  };
}

export function resolveEntityBox(
  model: DiagramModel,
  id: string,
  preferActorCircle = false,
): BoxBounds | null {
  const actor = model.actors.find((a) => a.id === id);
  if (actor) return getActorAnchorBox(actor, preferActorCircle);
  const el = model.elements.find((e) => e.id === id);
  if (el) {
    if (el.actorId) {
      const parent = model.actors.find((a) => a.id === el.actorId);
      if (parent?.collapsed) {
        return getActorAnchorBox(parent, true);
      }
    }
    return getElementBox(el);
  }
  return null;
}

export function clipLineToBox(
  box: BoxBounds,
  towardX: number,
  towardY: number,
  padding = 2,
): { x: number; y: number } {
  const dx = towardX - box.cx;
  const dy = towardY - box.cy;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.001) {
    return { x: box.cx, y: box.cy };
  }

  if (box.isCircle) {
    const r = box.radius + padding;
    return {
      x: box.cx + (dx / dist) * r,
      y: box.cy + (dy / dist) * r,
    };
  }

  const halfW = box.width / 2 + padding;
  const halfH = box.height / 2 + padding;
  const scaleX = Math.abs(dx) > 0.001 ? halfW / Math.abs(dx) : Infinity;
  const scaleY = Math.abs(dy) > 0.001 ? halfH / Math.abs(dy) : Infinity;
  const t = Math.min(scaleX, scaleY);

  return {
    x: box.cx + dx * t,
    y: box.cy + dy * t,
  };
}

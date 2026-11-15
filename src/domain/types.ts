export type ActorKind = 'actor' | 'agent' | 'role';

export type ElementKind = 'goal' | 'quality' | 'task' | 'resource';

export type ContributionValue = 'make' | 'help' | 'hurt' | 'break';

export type LinkKind =
  | { kind: 'isA' }
  | { kind: 'participatesIn' }
  | { kind: 'andRefinement' }
  | { kind: 'orRefinement' }
  | { kind: 'neededBy' }
  | { kind: 'contribution'; value: ContributionValue }
  | { kind: 'qualification' };

export type LinkKindTag = LinkKind['kind'];

export interface Actor {
  id: string;
  name: string;
  kind: ActorKind;
  x: number;
  y: number;
  width: number;
  height: number;
  collapsed: boolean;
  customProperties: Record<string, string>;
}

export interface IntentionalElement {
  id: string;
  name: string;
  kind: ElementKind;
  actorId: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  customProperties: Record<string, string>;
}

export type Link = LinkKind & {
  id: string;
  sourceId: string;
  targetId: string;
};

export interface Dependency {
  id: string;
  dependerActorId: string;
  dependerElementId: string | null;
  dependeeActorId: string;
  dependeeElementId: string | null;
  dependumName: string;
  dependumKind: ElementKind;
  x: number;
  y: number;
  customProperties: Record<string, string>;
}

export interface DiagramMetadata {
  author: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface DiagramModel {
  id: string;
  name: string;
  version: string;
  actors: Actor[];
  elements: IntentionalElement[];
  links: Link[];
  dependencies: Dependency[];
  metadata: DiagramMetadata;
}

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  id: string;
  severity: ValidationSeverity;
  entityId: string | null;
  message: string;
  rule: string;
}

export type SelectionTarget =
  | { type: 'actor'; id: string }
  | { type: 'element'; id: string }
  | { type: 'link'; id: string }
  | { type: 'dependency'; id: string }
  | null;

export type ActiveTool =
  | 'select'
  | 'smart-link'
  | 'andRefinement'
  | 'orRefinement'
  | 'neededBy'
  | 'contribution'
  | 'qualification'
  | 'isA'
  | 'participatesIn'
  | 'dependency';

export interface ConnectionResolution {
  valid: boolean;
  mode: 'link' | 'dependency' | 'invalid';
  linkKind?: LinkKind;
  orientedSourceId?: string;
  orientedTargetId?: string;
  dependerActorId?: string;
  dependerElementId?: string | null;
  dependeeActorId?: string;
  dependeeElementId?: string | null;
  hint: string;
}

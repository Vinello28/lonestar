use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Error)]
#[serde(tag = "code", rename_all = "camelCase")]
pub enum MetamodelError {
    #[error("Entity '{id}' was not found in the model.")]
    EntityNotFound { id: String },

    #[error("A link cannot connect an entity to itself.")]
    SelfLoopNotAllowed,

    #[error("Actor link '{kind}' already exists between these two actors.")]
    DuplicateActorLink { kind: String },

    #[error("A pair of actors can be connected by at most one structural link (is-a or participates-in).")]
    MultipleActorLinksBetweenPair,

    #[error(
        "Is-a links can only connect two generic Actors or two Roles (not Agents or mixed types)."
    )]
    InvalidIsALinkTypes,

    #[error("Actor association links cannot form a cycle.")]
    ActorLinkCycle,

    #[error("Actor links can only connect Actor nodes.")]
    LinkRequiresActors,

    #[error("Intentional element links can only connect intentional elements.")]
    LinkRequiresIntentionalElements,

    #[error("Refinement links can only connect Goals or Tasks.")]
    RefinementRequiresGoalOrTask,

    #[error("Refinement links cannot form a cycle.")]
    RefinementCycle,

    #[error("Needed-by links must connect a Resource (source) to a Task (target).")]
    NeededByRequiresResourceToTask,

    #[error("Contribution links must target a Quality element.")]
    ContributionTargetMustBeQuality,

    #[error(
        "Qualification links must originate from a Quality and target a Goal, Task, or Resource."
    )]
    QualificationInvalidEndpoints,

    #[error("Internal element links must connect elements inside the same Actor boundary.")]
    CrossBoundaryElementLinkNotAllowed,

    #[error("Duplicate link between the same source and target.")]
    DuplicateLink,

    #[error("A dependency must connect two distinct actors (depender != dependee).")]
    DependencySameActorNotAllowed,

    #[error("Depender element does not belong to the depender actor.")]
    DependerElementMismatch,

    #[error("Dependee element does not belong to the dependee actor.")]
    DependeeElementMismatch,
}

#[derive(Debug, Error)]
pub enum DomainError {
    #[error(transparent)]
    Metamodel(#[from] MetamodelError),

    #[error("Invalid model data: {0}")]
    InvalidData(String),

    #[error("Persistence error: {0}")]
    Persistence(String),
}

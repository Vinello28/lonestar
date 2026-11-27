use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};

use super::entities::{ActorKind, Dependency, DiagramModel, ElementKind, Link, LinkKind};
use super::errors::MetamodelError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ValidationSeverity {
    Error,
    Warning,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationIssue {
    pub id: String,
    pub severity: ValidationSeverity,
    pub entity_id: Option<String>,
    pub message: String,
    pub rule: String,
}

fn has_directed_path(adjacency: &HashMap<&str, Vec<&str>>, start: &str, goal: &str) -> bool {
    if start == goal {
        return true;
    }
    let mut visited = HashSet::new();
    let mut queue = VecDeque::new();
    visited.insert(start);
    queue.push_back(start);

    while let Some(curr) = queue.pop_front() {
        if let Some(neighbors) = adjacency.get(curr) {
            for &next in neighbors {
                if next == goal {
                    return true;
                }
                if visited.insert(next) {
                    queue.push_back(next);
                }
            }
        }
    }
    false
}

/// Validates whether adding (or updating) a link between `source_id` and `target_id`
/// satisfies all iStar 2.0 metamodel constraints.
pub fn validate_proposed_link(
    model: &DiagramModel,
    source_id: &str,
    target_id: &str,
    link_kind: LinkKind,
    ignore_link_id: Option<&str>,
) -> Result<(), MetamodelError> {
    if source_id == target_id {
        return Err(MetamodelError::SelfLoopNotAllowed);
    }

    if link_kind.is_actor_link() {
        return validate_actor_link(model, source_id, target_id, link_kind, ignore_link_id);
    }

    validate_element_link(model, source_id, target_id, link_kind, ignore_link_id)
}

fn validate_actor_link(
    model: &DiagramModel,
    source_id: &str,
    target_id: &str,
    link_kind: LinkKind,
    ignore_link_id: Option<&str>,
) -> Result<(), MetamodelError> {
    let source_actor = model
        .find_actor(source_id)
        .ok_or(MetamodelError::LinkRequiresActors)?;
    let target_actor = model
        .find_actor(target_id)
        .ok_or(MetamodelError::LinkRequiresActors)?;

    if link_kind == LinkKind::IsA {
        let valid_pair = matches!(
            (source_actor.kind, target_actor.kind),
            (ActorKind::Actor, ActorKind::Actor) | (ActorKind::Role, ActorKind::Role)
        );
        if !valid_pair {
            return Err(MetamodelError::InvalidIsALinkTypes);
        }
    }

    let mut adjacency: HashMap<&str, Vec<&str>> = HashMap::new();
    for existing in &model.links {
        if Some(existing.id.as_str()) == ignore_link_id {
            continue;
        }
        if !existing.link_kind.is_actor_link() {
            continue;
        }
        let same_pair = (existing.source_id == source_id && existing.target_id == target_id)
            || (existing.source_id == target_id && existing.target_id == source_id);
        if same_pair {
            if existing.link_kind == link_kind && existing.source_id == source_id {
                return Err(MetamodelError::DuplicateActorLink {
                    kind: format!("{:?}", link_kind),
                });
            }
            return Err(MetamodelError::MultipleActorLinksBetweenPair);
        }
        // iStar 2.0 guide, section 8: "no is-a cycles" and "no participates-in cycles" are two
        // independent constraints, so only edges of the proposed kind can close a cycle.
        if existing.link_kind == link_kind {
            adjacency
                .entry(existing.source_id.as_str())
                .or_default()
                .push(existing.target_id.as_str());
        }
    }

    if has_directed_path(&adjacency, target_id, source_id) {
        return Err(MetamodelError::ActorLinkCycle);
    }

    Ok(())
}

fn validate_element_link(
    model: &DiagramModel,
    source_id: &str,
    target_id: &str,
    link_kind: LinkKind,
    ignore_link_id: Option<&str>,
) -> Result<(), MetamodelError> {
    let source = model
        .find_element(source_id)
        .ok_or(MetamodelError::LinkRequiresIntentionalElements)?;
    let target = model
        .find_element(target_id)
        .ok_or(MetamodelError::LinkRequiresIntentionalElements)?;

    if source.actor_id.is_none() || source.actor_id != target.actor_id {
        return Err(MetamodelError::CrossBoundaryElementLinkNotAllowed);
    }

    for existing in &model.links {
        if Some(existing.id.as_str()) == ignore_link_id {
            continue;
        }
        if existing.source_id == source_id && existing.target_id == target_id {
            if existing.link_kind == link_kind {
                return Err(MetamodelError::DuplicateLink);
            }
            if matches!(existing.link_kind, LinkKind::Contribution { .. })
                && matches!(link_kind, LinkKind::Contribution { .. })
            {
                return Err(MetamodelError::DuplicateContributionLink);
            }
        }
        let conflict_contrib_qual = (matches!(link_kind, LinkKind::Contribution { .. })
            && existing.source_id == target_id
            && existing.target_id == source_id
            && existing.link_kind == LinkKind::Qualification)
            || (link_kind == LinkKind::Qualification
                && existing.source_id == target_id
                && existing.target_id == source_id
                && matches!(existing.link_kind, LinkKind::Contribution { .. }));
        if conflict_contrib_qual {
            return Err(MetamodelError::ContributionAndQualificationConflict);
        }
    }

    match link_kind {
        LinkKind::AndRefinement | LinkKind::OrRefinement => {
            let valid_kinds = matches!(source.kind, ElementKind::Goal | ElementKind::Task)
                && matches!(target.kind, ElementKind::Goal | ElementKind::Task);
            if !valid_kinds {
                return Err(MetamodelError::RefinementRequiresGoalOrTask);
            }

            if model
                .dependencies
                .iter()
                .any(|d| d.depender_element_id.as_deref() == Some(target_id))
            {
                return Err(MetamodelError::DependerElementCannotBeRefinedOrContributed);
            }

            let mut adjacency: HashMap<&str, Vec<&str>> = HashMap::new();
            for existing in &model.links {
                if Some(existing.id.as_str()) == ignore_link_id {
                    continue;
                }
                if existing.link_kind.is_refinement() {
                    if existing.target_id == target_id && existing.link_kind != link_kind {
                        return Err(MetamodelError::MixedRefinementOnParent);
                    }
                    adjacency
                        .entry(existing.source_id.as_str())
                        .or_default()
                        .push(existing.target_id.as_str());
                }
            }
            if has_directed_path(&adjacency, target_id, source_id) {
                return Err(MetamodelError::RefinementCycle);
            }
            Ok(())
        }
        LinkKind::NeededBy => {
            if source.kind == ElementKind::Resource && target.kind == ElementKind::Task {
                Ok(())
            } else {
                Err(MetamodelError::NeededByRequiresResourceToTask)
            }
        }
        LinkKind::Contribution { .. } => {
            if target.kind != ElementKind::Quality {
                return Err(MetamodelError::ContributionTargetMustBeQuality);
            }
            if model
                .dependencies
                .iter()
                .any(|d| d.depender_element_id.as_deref() == Some(target_id))
            {
                return Err(MetamodelError::DependerElementCannotBeRefinedOrContributed);
            }
            // The guide only forbids a quality contributing to itself (rejected earlier as a
            // self-loop); it places no acyclicity constraint on contributions between qualities.
            Ok(())
        }
        LinkKind::Qualification => {
            let valid_target = matches!(
                target.kind,
                ElementKind::Goal | ElementKind::Task | ElementKind::Resource
            );
            if source.kind == ElementKind::Quality && valid_target {
                Ok(())
            } else {
                Err(MetamodelError::QualificationInvalidEndpoints)
            }
        }
        LinkKind::IsA | LinkKind::ParticipatesIn => Err(MetamodelError::LinkRequiresActors),
    }
}

pub fn validate_proposed_dependency(
    model: &DiagramModel,
    dep: &Dependency,
) -> Result<(), MetamodelError> {
    if dep.depender_actor_id == dep.dependee_actor_id {
        return Err(MetamodelError::DependencySameActorNotAllowed);
    }
    if model.find_actor(&dep.depender_actor_id).is_none() {
        return Err(MetamodelError::EntityNotFound {
            id: dep.depender_actor_id.clone(),
        });
    }
    if model.find_actor(&dep.dependee_actor_id).is_none() {
        return Err(MetamodelError::EntityNotFound {
            id: dep.dependee_actor_id.clone(),
        });
    }
    if let Some(ref el_id) = dep.depender_element_id {
        let el = model
            .find_element(el_id)
            .ok_or_else(|| MetamodelError::EntityNotFound { id: el_id.clone() })?;
        if el.actor_id.as_deref() != Some(dep.depender_actor_id.as_str()) {
            return Err(MetamodelError::DependerElementMismatch);
        }
        if model.links.iter().any(|l| {
            l.target_id == *el_id
                && matches!(
                    l.link_kind,
                    LinkKind::AndRefinement
                        | LinkKind::OrRefinement
                        | LinkKind::Contribution { .. }
                )
        }) {
            return Err(MetamodelError::DependerElementCannotBeRefinedOrContributed);
        }
    }
    if let Some(ref el_id) = dep.dependee_element_id {
        let el = model
            .find_element(el_id)
            .ok_or_else(|| MetamodelError::EntityNotFound { id: el_id.clone() })?;
        if el.actor_id.as_deref() != Some(dep.dependee_actor_id.as_str()) {
            return Err(MetamodelError::DependeeElementMismatch);
        }
    }
    Ok(())
}

/// Validates an entire diagram model against the iStar 2.0 specification,
/// returning all errors and warnings without mutating the model.
pub fn validate_model(model: &DiagramModel) -> Vec<ValidationIssue> {
    let mut issues = Vec::new();
    let mut idx = 0usize;
    let mut push_issue =
        |severity: ValidationSeverity, entity_id: Option<String>, rule: &str, message: String| {
            idx += 1;
            issues.push(ValidationIssue {
                id: format!("val-{idx}"),
                severity,
                entity_id,
                message,
                rule: rule.to_string(),
            });
        };

    // 1. Check elements outside actor boundaries (orphans) and empty labels
    for actor in &model.actors {
        if actor.name.trim().is_empty() {
            push_issue(
                ValidationSeverity::Warning,
                Some(actor.id.clone()),
                "istar.naming",
                "Actor has an empty name.".to_string(),
            );
        }
    }

    for el in &model.elements {
        match &el.actor_id {
            None => push_issue(
                ValidationSeverity::Error,
                Some(el.id.clone()),
                "istar.boundary",
                format!(
                    "Element '{}' is outside an Actor boundary. Drag it into an Actor to attach it to a Strategic Rationale.",
                    el.name
                ),
            ),
            Some(aid) if model.find_actor(aid).is_none() => push_issue(
                ValidationSeverity::Error,
                Some(el.id.clone()),
                "istar.boundary.missingActor",
                format!(
                    "Element '{}' references missing Actor '{}'.",
                    el.name, aid
                ),
            ),
            _ => {}
        }
    }

    // 2. Validate every link
    let mut refinement_kinds_by_parent: HashMap<&str, HashSet<bool>> = HashMap::new();
    let mut and_child_count_by_parent: HashMap<&str, usize> = HashMap::new();
    for link in &model.links {
        if let Err(err) = validate_link_entry(model, link) {
            push_issue(
                ValidationSeverity::Error,
                Some(link.id.clone()),
                "istar.link",
                err.to_string(),
            );
        }
        if link.link_kind.is_refinement() {
            let is_and = link.link_kind == LinkKind::AndRefinement;
            refinement_kinds_by_parent
                .entry(link.target_id.as_str())
                .or_default()
                .insert(is_and);
            if is_and {
                *and_child_count_by_parent
                    .entry(link.target_id.as_str())
                    .or_default() += 1;
            }
        }
    }

    for (parent_id, kinds) in refinement_kinds_by_parent {
        if kinds.len() > 1 {
            let label = model
                .find_element(parent_id)
                .map(|e| e.name.as_str())
                .unwrap_or(parent_id);
            push_issue(
                ValidationSeverity::Error,
                Some(parent_id.to_string()),
                "istar.refinement.mixed",
                format!(
                    "Parent '{}' mixes AND-refinement and OR-refinement links. iStar 2.0 forbids mixing refinement types on the same parent.",
                    label
                ),
            );
        }
    }

    for (parent_id, count) in and_child_count_by_parent {
        if count == 1 {
            let label = model
                .find_element(parent_id)
                .map(|e| e.name.as_str())
                .unwrap_or(parent_id);
            push_issue(
                ValidationSeverity::Warning,
                Some(parent_id.to_string()),
                "istar.refinement.singleAndChild",
                format!(
                    "Parent '{}' has only one AND-refinement child. In iStar 2.0, AND-refinement requires at least 2 children (use OR-refinement for a single child).",
                    label
                ),
            );
        }
    }

    // 3. Validate dependencies
    for dep in &model.dependencies {
        if let Err(err) = validate_proposed_dependency(model, dep) {
            push_issue(
                ValidationSeverity::Error,
                Some(dep.id.clone()),
                "istar.dependency",
                err.to_string(),
            );
        }
        if dep.dependum_name.trim().is_empty() {
            push_issue(
                ValidationSeverity::Warning,
                Some(dep.id.clone()),
                "istar.dependency.naming",
                "Dependency dependum should have a descriptive name.".to_string(),
            );
        }
    }

    issues
}

fn validate_link_entry(model: &DiagramModel, link: &Link) -> Result<(), MetamodelError> {
    validate_proposed_link(
        model,
        &link.source_id,
        &link.target_id,
        link.link_kind,
        Some(link.id.as_str()),
    )
}

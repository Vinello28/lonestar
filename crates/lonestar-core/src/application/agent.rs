use std::collections::BTreeMap;

use serde::{Deserialize, Deserializer, Serialize};
use serde_json::{json, Value};

use crate::application::ModelService;
use crate::domain::{
    validate_proposed_dependency, ActorKind, ContributionValue, Dependency, DiagramModel,
    ElementKind, LinkKind, ValidationIssue, ValidationSeverity,
};

fn default_actor_kind() -> ActorKind {
    ActorKind::Actor
}

fn default_element_kind() -> ElementKind {
    ElementKind::Goal
}

fn parse_actor_kind_str(s: &str) -> Result<ActorKind, String> {
    match s.trim().to_ascii_lowercase().as_str() {
        "actor" => Ok(ActorKind::Actor),
        "agent" => Ok(ActorKind::Agent),
        "role" => Ok(ActorKind::Role),
        other => Err(format!(
            "Unknown ActorKind '{other}'. Expected 'actor', 'agent', or 'role'."
        )),
    }
}

fn parse_element_kind_str(s: &str) -> Result<ElementKind, String> {
    match s.trim().to_ascii_lowercase().as_str() {
        "goal" | "hardgoal" => Ok(ElementKind::Goal),
        "quality" | "softgoal" | "soft-goal" => Ok(ElementKind::Quality),
        "task" => Ok(ElementKind::Task),
        "resource" => Ok(ElementKind::Resource),
        other => Err(format!(
            "Unknown ElementKind '{other}'. Expected 'goal', 'quality', 'task', or 'resource'."
        )),
    }
}

fn deserialize_actor_kind<'de, D>(deserializer: D) -> Result<ActorKind, D::Error>
where
    D: Deserializer<'de>,
{
    let raw = String::deserialize(deserializer)?;
    parse_actor_kind_str(&raw).map_err(serde::de::Error::custom)
}

fn deserialize_opt_actor_kind<'de, D>(deserializer: D) -> Result<Option<ActorKind>, D::Error>
where
    D: Deserializer<'de>,
{
    let opt = Option::<String>::deserialize(deserializer)?;
    opt.map(|s| parse_actor_kind_str(&s))
        .transpose()
        .map_err(serde::de::Error::custom)
}

fn deserialize_element_kind<'de, D>(deserializer: D) -> Result<ElementKind, D::Error>
where
    D: Deserializer<'de>,
{
    let raw = String::deserialize(deserializer)?;
    parse_element_kind_str(&raw).map_err(serde::de::Error::custom)
}

fn deserialize_opt_element_kind<'de, D>(deserializer: D) -> Result<Option<ElementKind>, D::Error>
where
    D: Deserializer<'de>,
{
    let opt = Option::<String>::deserialize(deserializer)?;
    opt.map(|s| parse_element_kind_str(&s))
        .transpose()
        .map_err(serde::de::Error::custom)
}

fn deserialize_opt_contribution_value<'de, D>(
    deserializer: D,
) -> Result<Option<ContributionValue>, D::Error>
where
    D: Deserializer<'de>,
{
    let opt = Option::<String>::deserialize(deserializer)?;
    opt.map(|s| {
        ContributionValue::from_label(&s).ok_or_else(|| {
            serde::de::Error::custom(format!(
                "Unknown ContributionValue '{s}'. Expected 'make', 'help', 'hurt', or 'break'."
            ))
        })
    })
    .transpose()
}

/// Declarative, ID-or-name-based modeling operations that an AI agent can emit.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "camelCase")]
pub enum AgentOperation {
    #[serde(rename_all = "camelCase")]
    ClearModel { name: Option<String> },

    #[serde(rename_all = "camelCase")]
    AddActor {
        name: String,
        #[serde(
            default = "default_actor_kind",
            deserialize_with = "deserialize_actor_kind"
        )]
        kind: ActorKind,
    },

    #[serde(rename_all = "camelCase")]
    UpdateActor {
        actor: String,
        #[serde(default, alias = "new_name")]
        new_name: Option<String>,
        #[serde(default, deserialize_with = "deserialize_opt_actor_kind")]
        kind: Option<ActorKind>,
        collapsed: Option<bool>,
    },

    #[serde(rename_all = "camelCase")]
    RemoveActor { actor: String },

    #[serde(rename_all = "camelCase")]
    AddElement {
        #[serde(default)]
        actor: String,
        name: String,
        #[serde(
            default = "default_element_kind",
            deserialize_with = "deserialize_element_kind"
        )]
        kind: ElementKind,
    },

    #[serde(rename_all = "camelCase")]
    UpdateElement {
        element: String,
        actor: Option<String>,
        #[serde(default, alias = "new_name")]
        new_name: Option<String>,
        #[serde(default, deserialize_with = "deserialize_opt_element_kind")]
        kind: Option<ElementKind>,
    },

    #[serde(rename_all = "camelCase")]
    RemoveElement {
        element: String,
        actor: Option<String>,
    },

    #[serde(rename_all = "camelCase")]
    AddLink {
        source: String,
        target: String,
        actor: Option<String>,
        #[serde(default)]
        kind: String,
        #[serde(default, deserialize_with = "deserialize_opt_contribution_value")]
        value: Option<ContributionValue>,
    },

    #[serde(rename_all = "camelCase")]
    RemoveLink {
        id: Option<String>,
        source: Option<String>,
        target: Option<String>,
    },

    #[serde(rename_all = "camelCase")]
    AddDependency {
        #[serde(alias = "depender_actor")]
        depender_actor: String,
        #[serde(default, alias = "depender_element")]
        depender_element: Option<String>,
        #[serde(alias = "dependee_actor")]
        dependee_actor: String,
        #[serde(default, alias = "dependee_element")]
        dependee_element: Option<String>,
        #[serde(default, alias = "dependum_name")]
        dependum_name: String,
        #[serde(
            default = "default_element_kind",
            alias = "dependum_kind",
            deserialize_with = "deserialize_element_kind"
        )]
        dependum_kind: ElementKind,
    },

    #[serde(rename_all = "camelCase")]
    RemoveDependency {
        id: Option<String>,
        #[serde(default, alias = "dependum_name")]
        dependum_name: Option<String>,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentOperationBatch {
    pub operations: Vec<AgentOperation>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AgentExecutionReport {
    pub applied_operations: Vec<String>,
    pub repaired_warnings: Vec<String>,
    pub errors: Vec<String>,
    pub validation_issues: Vec<ValidationIssue>,
    pub mutated: bool,
}

fn next_unique_id(prefix: &str, model: &DiagramModel) -> String {
    let mut n = 1usize;
    loop {
        let candidate = format!("{prefix}-{n}");
        let used = model.actors.iter().any(|a| a.id == candidate)
            || model.elements.iter().any(|e| e.id == candidate)
            || model.links.iter().any(|l| l.id == candidate)
            || model.dependencies.iter().any(|d| d.id == candidate);
        if !used {
            return candidate;
        }
        n += 1;
    }
}

fn resolve_actor_id(model: &DiagramModel, query: &str) -> Option<String> {
    let q = query.trim();
    if q.is_empty() {
        return None;
    }
    if let Some(a) = model.actors.iter().find(|a| a.id == q) {
        return Some(a.id.clone());
    }
    model
        .actors
        .iter()
        .find(|a| a.name.trim().eq_ignore_ascii_case(q))
        .map(|a| a.id.clone())
}

fn split_qualified_name(query: &str) -> Option<(&str, &str)> {
    if let Some((a, b)) = query.split_once("::") {
        Some((a.trim(), b.trim()))
    } else if let Some((a, b)) = query.split_once('.') {
        Some((a.trim(), b.trim()))
    } else {
        None
    }
}

fn resolve_element_ids(
    model: &DiagramModel,
    query: &str,
    actor_scope: Option<&str>,
) -> Vec<String> {
    let q = query.trim();
    if q.is_empty() {
        return Vec::new();
    }

    if let Some(scope) = actor_scope {
        if let Some(aid) = resolve_actor_id(model, scope) {
            let scoped_id_match: Vec<String> = model
                .elements
                .iter()
                .filter(|e| e.actor_id.as_deref() == Some(aid.as_str()) && e.id == q)
                .map(|e| e.id.clone())
                .collect();
            if !scoped_id_match.is_empty() {
                return scoped_id_match;
            }
            let scoped_name_match: Vec<String> = model
                .elements
                .iter()
                .filter(|e| {
                    e.actor_id.as_deref() == Some(aid.as_str())
                        && e.name.trim().eq_ignore_ascii_case(q)
                })
                .map(|e| e.id.clone())
                .collect();
            if !scoped_name_match.is_empty() {
                return scoped_name_match;
            }
        }
    }

    // Try qualified Actor.Element notation if unscoped
    if actor_scope.is_none() {
        if let Some((actor_part, el_part)) = split_qualified_name(q) {
            if let Some(aid) = resolve_actor_id(model, actor_part) {
                let matches: Vec<String> = model
                    .elements
                    .iter()
                    .filter(|e| {
                        e.actor_id.as_deref() == Some(aid.as_str())
                            && (e.id == el_part || e.name.trim().eq_ignore_ascii_case(el_part))
                    })
                    .map(|e| e.id.clone())
                    .collect();
                if !matches.is_empty() {
                    return matches;
                }
            }
        }
    }

    if let Some(el) = model.elements.iter().find(|e| e.id == q) {
        return vec![el.id.clone()];
    }

    model
        .elements
        .iter()
        .filter(|e| e.name.trim().eq_ignore_ascii_case(q))
        .map(|e| e.id.clone())
        .collect()
}

fn resolve_element_id(
    model: &DiagramModel,
    query: &str,
    actor_scope: Option<&str>,
) -> Option<String> {
    resolve_element_ids(model, query, actor_scope)
        .into_iter()
        .next()
}

fn resolve_element_pair(
    model: &DiagramModel,
    source: &str,
    target: &str,
    actor_scope: Option<&str>,
) -> Option<(String, String)> {
    let src_candidates = resolve_element_ids(model, source, actor_scope);
    let dst_candidates = resolve_element_ids(model, target, actor_scope);
    if src_candidates.is_empty() || dst_candidates.is_empty() {
        return None;
    }
    // Prefer a pair inside the same actor boundary when multiple elements share a label
    for s in &src_candidates {
        for d in &dst_candidates {
            if s == d {
                continue;
            }
            let s_actor = model.find_element(s).and_then(|e| e.actor_id.as_deref());
            let d_actor = model.find_element(d).and_then(|e| e.actor_id.as_deref());
            if s_actor.is_some() && s_actor == d_actor {
                return Some((s.clone(), d.clone()));
            }
        }
    }
    Some((src_candidates[0].clone(), dst_candidates[0].clone()))
}

fn ensure_actor_id(
    model: &mut DiagramModel,
    actor_ref: &str,
    report: &mut AgentExecutionReport,
) -> Result<String, String> {
    let trimmed = actor_ref.trim();
    if trimmed.is_empty() {
        return Err("Actor reference cannot be empty.".to_string());
    }
    if let Some(existing_id) = resolve_actor_id(model, trimmed) {
        return Ok(existing_id);
    }
    let id = next_unique_id("actor", model);
    let created =
        ModelService::add_actor(model, id.clone(), trimmed, ActorKind::Actor, 100.0, 100.0);
    report.mutated = true;
    report.repaired_warnings.push(format!(
        "Auto-created missing Actor '{}' ({}) to host elements/dependencies.",
        created.name, created.id
    ));
    Ok(id)
}

fn parse_link_kind(kind: &str, value: Option<ContributionValue>) -> Result<LinkKind, String> {
    let normalized: String = kind
        .trim()
        .to_ascii_lowercase()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect();

    match normalized.as_str() {
        "isa" => Ok(LinkKind::IsA),
        "participatesin" => Ok(LinkKind::ParticipatesIn),
        "andrefinement" | "and" | "decomposition" => Ok(LinkKind::AndRefinement),
        "orrefinement" | "or" | "meansends" => Ok(LinkKind::OrRefinement),
        "neededby" => Ok(LinkKind::NeededBy),
        "contribution" => Ok(LinkKind::Contribution {
            value: value.unwrap_or(ContributionValue::Help),
        }),
        "make" => Ok(LinkKind::Contribution {
            value: value.unwrap_or(ContributionValue::Make),
        }),
        "help" => Ok(LinkKind::Contribution {
            value: value.unwrap_or(ContributionValue::Help),
        }),
        "hurt" => Ok(LinkKind::Contribution {
            value: value.unwrap_or(ContributionValue::Hurt),
        }),
        "break" => Ok(LinkKind::Contribution {
            value: value.unwrap_or(ContributionValue::Break),
        }),
        "qualification" => Ok(LinkKind::Qualification),
        _ => Err(format!(
            "Unknown link kind '{kind}'. Expected one of: isA, participatesIn, andRefinement, orRefinement, neededBy, contribution, qualification."
        )),
    }
}

fn format_link_kind_label(kind: LinkKind) -> String {
    match kind {
        LinkKind::IsA => "is-a".to_string(),
        LinkKind::ParticipatesIn => "participates-in".to_string(),
        LinkKind::AndRefinement => "AND-refinement".to_string(),
        LinkKind::OrRefinement => "OR-refinement".to_string(),
        LinkKind::NeededBy => "needed-by".to_string(),
        LinkKind::Contribution { value } => format!("contribution ({})", value.as_str()),
        LinkKind::Qualification => "qualification".to_string(),
    }
}

/// Parses an array or `{ "operations": [...] }` JSON value item-by-item so one malformed
/// operation does not discard valid sibling operations.
pub fn parse_operations_value(val: &Value) -> (Vec<AgentOperation>, Vec<String>) {
    let items_opt = val
        .as_array()
        .or_else(|| val.get("operations").and_then(|v| v.as_array()));

    let Some(items) = items_opt else {
        return (
            Vec::new(),
            vec!["Expected a JSON array or object with an 'operations' array.".to_string()],
        );
    };

    let mut ops = Vec::with_capacity(items.len());
    let mut errors = Vec::new();
    for (idx, item) in items.iter().enumerate() {
        match serde_json::from_value::<AgentOperation>(item.clone()) {
            Ok(op) => ops.push(op),
            Err(err) => errors.push(format!("Operation #{} could not be parsed: {err}", idx + 1)),
        }
    }
    (ops, errors)
}

fn infer_element_link_kind(
    model: &DiagramModel,
    src_kind: ElementKind,
    dst_kind: ElementKind,
    dst_id: &str,
) -> Option<LinkKind> {
    match (src_kind, dst_kind) {
        (ElementKind::Resource, ElementKind::Task) | (ElementKind::Task, ElementKind::Resource) => {
            Some(LinkKind::NeededBy)
        }
        (ElementKind::Quality, ElementKind::Goal | ElementKind::Task | ElementKind::Resource) => {
            Some(LinkKind::Qualification)
        }
        (_, ElementKind::Quality) => Some(LinkKind::Contribution {
            value: ContributionValue::Help,
        }),
        (ElementKind::Goal | ElementKind::Task, ElementKind::Goal | ElementKind::Task) => {
            let has_or = model
                .links
                .iter()
                .any(|l| l.target_id == dst_id && l.link_kind == LinkKind::OrRefinement);
            Some(if has_or {
                LinkKind::OrRefinement
            } else {
                LinkKind::AndRefinement
            })
        }
        _ => None,
    }
}

/// Executes a sequence of declarative agent operations against `model`, performing
/// automatic iStar 2.0 metamodel repairs where unambiguous, running `auto_layout`,
/// and validating the resulting model.
pub fn execute_agent_operations(
    model: &mut DiagramModel,
    ops: &[AgentOperation],
) -> AgentExecutionReport {
    let mut report = AgentExecutionReport::default();
    let mut last_actor_id: Option<String> = model.actors.last().map(|a| a.id.clone());

    for op in ops {
        match op {
            AgentOperation::ClearModel { name } => {
                model.actors.clear();
                model.elements.clear();
                model.links.clear();
                model.dependencies.clear();
                last_actor_id = None;
                if let Some(new_name) = name {
                    if !new_name.trim().is_empty() {
                        model.name = new_name.trim().to_string();
                    }
                }
                report.mutated = true;
                report
                    .applied_operations
                    .push(format!("Cleared diagram model ('{}').", model.name));
            }
            AgentOperation::AddActor { name, kind } => {
                let clean_name = name.trim();
                if clean_name.is_empty() {
                    report
                        .errors
                        .push("Cannot add an actor with an empty name.".to_string());
                    continue;
                }
                if let Some(existing_id) = resolve_actor_id(model, clean_name) {
                    last_actor_id = Some(existing_id.clone());
                    report.applied_operations.push(format!(
                        "Reused existing {:?} '{}' ({existing_id}).",
                        kind, clean_name
                    ));
                    continue;
                }
                let id = next_unique_id("actor", model);
                let actor = ModelService::add_actor(model, id, clean_name, *kind, 100.0, 100.0);
                last_actor_id = Some(actor.id.clone());
                report.mutated = true;
                report.applied_operations.push(format!(
                    "Added {:?} '{}' ({}).",
                    actor.kind, actor.name, actor.id
                ));
            }
            AgentOperation::UpdateActor {
                actor,
                new_name,
                kind,
                collapsed,
            } => {
                let Some(actor_id) = resolve_actor_id(model, actor) else {
                    report
                        .errors
                        .push(format!("UpdateActor failed: Actor '{actor}' not found."));
                    continue;
                };
                last_actor_id = Some(actor_id.clone());
                if let Some(target_actor) = model.find_actor_mut(&actor_id) {
                    if let Some(nn) = new_name {
                        if !nn.trim().is_empty() {
                            target_actor.name = nn.trim().to_string();
                        }
                    }
                    if let Some(k) = kind {
                        target_actor.kind = *k;
                    }
                    if let Some(c) = collapsed {
                        target_actor.collapsed = *c;
                    }
                    report.mutated = true;
                    report.applied_operations.push(format!(
                        "Updated Actor '{}' ({actor_id}).",
                        target_actor.name
                    ));
                }
            }
            AgentOperation::RemoveActor { actor } => {
                let Some(actor_id) = resolve_actor_id(model, actor) else {
                    report
                        .errors
                        .push(format!("RemoveActor failed: Actor '{actor}' not found."));
                    continue;
                };
                let label = model
                    .find_actor(&actor_id)
                    .map(|a| a.name.clone())
                    .unwrap_or_else(|| actor_id.clone());
                ModelService::remove_actor(model, &actor_id);
                if last_actor_id.as_deref() == Some(actor_id.as_str()) {
                    last_actor_id = model.actors.last().map(|a| a.id.clone());
                }
                report.mutated = true;
                report
                    .applied_operations
                    .push(format!("Removed Actor '{label}' ({actor_id})."));
            }
            AgentOperation::AddElement { actor, name, kind } => {
                let clean_name = name.trim();
                if clean_name.is_empty() {
                    report
                        .errors
                        .push("Cannot add an element with an empty name.".to_string());
                    continue;
                }
                let actor_id = if actor.trim().is_empty() {
                    if let Some(active_id) = last_actor_id
                        .as_deref()
                        .filter(|id| model.find_actor(id).is_some())
                        .map(str::to_string)
                    {
                        let active_name = model
                            .find_actor(&active_id)
                            .map(|a| a.name.as_str())
                            .unwrap_or(&active_id);
                        report.repaired_warnings.push(format!(
                            "Attached element '{clean_name}' to actor '{active_name}' because 'actor' field was omitted."
                        ));
                        active_id
                    } else {
                        let aid = next_unique_id("actor", model);
                        let created = ModelService::add_actor(
                            model,
                            aid.clone(),
                            "System Actor",
                            ActorKind::Actor,
                            100.0,
                            100.0,
                        );
                        last_actor_id = Some(created.id.clone());
                        report.mutated = true;
                        report.repaired_warnings.push(format!(
                            "Auto-created 'System Actor' ({}) for element '{clean_name}' because 'actor' was omitted and no actors existed.",
                            created.id
                        ));
                        aid
                    }
                } else {
                    match ensure_actor_id(model, actor, &mut report) {
                        Ok(id) => {
                            last_actor_id = Some(id.clone());
                            id
                        }
                        Err(e) => {
                            report.errors.push(e);
                            continue;
                        }
                    }
                };
                let actor_display = model
                    .find_actor(&actor_id)
                    .map(|a| a.name.clone())
                    .unwrap_or_else(|| actor.clone());

                if let Some(existing) = model.elements.iter().find(|e| {
                    e.actor_id.as_deref() == Some(actor_id.as_str())
                        && e.name.trim().eq_ignore_ascii_case(clean_name)
                }) {
                    report.applied_operations.push(format!(
                        "Reused existing {:?} '{}' ({}) inside actor '{}'.",
                        existing.kind, existing.name, existing.id, actor_display
                    ));
                    continue;
                }
                let id = next_unique_id("el", model);
                let el = ModelService::add_element(
                    model,
                    id,
                    clean_name,
                    *kind,
                    Some(actor_id.clone()),
                    140.0,
                    160.0,
                );
                report.mutated = true;
                report.applied_operations.push(format!(
                    "Added {:?} '{}' ({}) inside actor '{}'.",
                    el.kind, el.name, el.id, actor_display
                ));
            }
            AgentOperation::UpdateElement {
                element,
                actor,
                new_name,
                kind,
            } => {
                let Some(el_id) = resolve_element_id(model, element, actor.as_deref()) else {
                    report.errors.push(format!(
                        "UpdateElement failed: Element '{element}' not found."
                    ));
                    continue;
                };
                if let Some(el) = model.find_element_mut(&el_id) {
                    if let Some(nn) = new_name {
                        if !nn.trim().is_empty() {
                            el.name = nn.trim().to_string();
                        }
                    }
                    if let Some(k) = kind {
                        el.kind = *k;
                        let (w, h) = crate::application::default_element_size(*k);
                        el.width = w;
                        el.height = h;
                    }
                    report.mutated = true;
                    report
                        .applied_operations
                        .push(format!("Updated Element '{}' ({el_id}).", el.name));
                }
            }
            AgentOperation::RemoveElement { element, actor } => {
                let Some(el_id) = resolve_element_id(model, element, actor.as_deref()) else {
                    report.errors.push(format!(
                        "RemoveElement failed: Element '{element}' not found."
                    ));
                    continue;
                };
                let label = model
                    .find_element(&el_id)
                    .map(|e| e.name.clone())
                    .unwrap_or_else(|| el_id.clone());
                ModelService::remove_element(model, &el_id);
                report.mutated = true;
                report
                    .applied_operations
                    .push(format!("Removed Element '{label}' ({el_id})."));
            }
            AgentOperation::AddLink {
                source,
                target,
                actor,
                kind,
                value,
            } => {
                // 1. Check if one endpoint is an Actor and the other is an Element (containment)
                if actor.is_none() {
                    let src_actor = resolve_actor_id(model, source);
                    let src_el = resolve_element_id(model, source, None);
                    let dst_actor = resolve_actor_id(model, target);
                    let dst_el = resolve_element_id(model, target, None);

                    let containment_pair = match (src_actor, src_el, dst_actor, dst_el) {
                        (Some(aid), None, None, Some(eid)) | (None, Some(eid), Some(aid), None) => {
                            Some((aid, eid))
                        }
                        _ => None,
                    };

                    if let Some((aid, eid)) = containment_pair {
                        let actor_name = model
                            .find_actor(&aid)
                            .map(|a| a.name.clone())
                            .unwrap_or_else(|| aid.clone());
                        if let Some(el) = model.find_element_mut(&eid) {
                            let el_name = el.name.clone();
                            let prev_actor = el.actor_id.clone();
                            el.actor_id = Some(aid.clone());
                            if prev_actor.as_deref() != Some(aid.as_str()) {
                                report.mutated = true;
                            }
                            report.repaired_warnings.push(format!(
                                "Assigned element '{el_name}' inside actor '{actor_name}' boundary (iStar 2.0 represents actor ownership via containment, not links)."
                            ));
                            report.applied_operations.push(format!(
                                "Contained element '{el_name}' inside actor '{actor_name}' ({eid})."
                            ));
                        }
                        continue;
                    }
                }

                // 2. Parse or infer link kind when omitted by small local models
                let kind_was_omitted = kind.trim().is_empty();
                let mut parsed_kind = if kind_was_omitted {
                    let src_actor = resolve_actor_id(model, source);
                    let dst_actor = resolve_actor_id(model, target);
                    if let (Some(src_aid), Some(dst_aid)) = (src_actor, dst_actor) {
                        let src_k = model.find_actor(&src_aid).map(|a| a.kind);
                        let dst_k = model.find_actor(&dst_aid).map(|a| a.kind);
                        let inferred = if matches!(
                            (src_k, dst_k),
                            (Some(ActorKind::Actor), Some(ActorKind::Actor))
                                | (Some(ActorKind::Role), Some(ActorKind::Role))
                        ) {
                            LinkKind::IsA
                        } else {
                            LinkKind::ParticipatesIn
                        };
                        report.repaired_warnings.push(format!(
                            "Inferred actor link kind '{}' for '{}' -> '{}' because 'kind' was omitted.",
                            format_link_kind_label(inferred),
                            source,
                            target
                        ));
                        inferred
                    } else if let Some((s_eid, d_eid)) =
                        resolve_element_pair(model, source, target, actor.as_deref())
                    {
                        let Some(s_el) = model.find_element(&s_eid) else {
                            report.errors.push(format!(
                                "AddLink failed: Source element '{source}' not found."
                            ));
                            continue;
                        };
                        let Some(d_el) = model.find_element(&d_eid) else {
                            report.errors.push(format!(
                                "AddLink failed: Target element '{target}' not found."
                            ));
                            continue;
                        };
                        if s_el.actor_id.is_some()
                            && d_el.actor_id.is_some()
                            && s_el.actor_id != d_el.actor_id
                        {
                            // Cross-boundary check below will convert this to a Social Dependency
                            LinkKind::AndRefinement
                        } else if let Some(inferred) =
                            infer_element_link_kind(model, s_el.kind, d_el.kind, &d_eid)
                        {
                            report.repaired_warnings.push(format!(
                                "Inferred link kind '{}' for '{}' -> '{}' because 'kind' was omitted.",
                                format_link_kind_label(inferred),
                                s_el.name,
                                d_el.name
                            ));
                            inferred
                        } else {
                            report.errors.push(format!(
                                "AddLink could not infer a valid iStar 2.0 link kind between '{}' ({:?}) and '{}' ({:?}).",
                                s_el.name, s_el.kind, d_el.name, d_el.kind
                            ));
                            continue;
                        }
                    } else {
                        report.errors.push(format!(
                            "AddLink failed: Could not resolve '{source}' and '{target}' to infer link kind."
                        ));
                        continue;
                    }
                } else {
                    match parse_link_kind(kind, *value) {
                        Ok(k) => k,
                        Err(e) => {
                            report.errors.push(e);
                            continue;
                        }
                    }
                };

                if parsed_kind.is_actor_link() {
                    let Some(src_actor_id) = resolve_actor_id(model, source) else {
                        report.errors.push(format!(
                            "AddLink failed: Source actor '{source}' not found."
                        ));
                        continue;
                    };
                    let Some(dst_actor_id) = resolve_actor_id(model, target) else {
                        report.errors.push(format!(
                            "AddLink failed: Target actor '{target}' not found."
                        ));
                        continue;
                    };

                    if parsed_kind == LinkKind::IsA {
                        let src_kind = model.find_actor(&src_actor_id).map(|a| a.kind);
                        let dst_kind = model.find_actor(&dst_actor_id).map(|a| a.kind);
                        let valid_isa = matches!(
                            (src_kind, dst_kind),
                            (Some(ActorKind::Actor), Some(ActorKind::Actor))
                                | (Some(ActorKind::Role), Some(ActorKind::Role))
                        );
                        if !valid_isa {
                            parsed_kind = LinkKind::ParticipatesIn;
                            report.repaired_warnings.push(format!(
                                "Auto-repaired 'isA' between '{source}' ({:?}) and '{target}' ({:?}) to 'participatesIn' (iStar 2.0 restricts is-a to Actor->Actor or Role->Role).",
                                src_kind, dst_kind
                            ));
                        }
                    }

                    let link_id = next_unique_id("link", model);
                    match ModelService::add_link(
                        model,
                        link_id,
                        &src_actor_id,
                        &dst_actor_id,
                        parsed_kind,
                    ) {
                        Ok(link) => {
                            report.mutated = true;
                            report.applied_operations.push(format!(
                                "Added {} link '{}' -> '{}' ({}).",
                                format_link_kind_label(link.link_kind),
                                source,
                                target,
                                link.id
                            ));
                        }
                        Err(err) => {
                            report
                                .errors
                                .push(format!("AddLink ('{source}' -> '{target}') failed: {err}"));
                        }
                    }
                    continue;
                }

                let Some((mut src_el_id, mut dst_el_id)) =
                    resolve_element_pair(model, source, target, actor.as_deref())
                else {
                    report.errors.push(format!(
                        "AddLink failed: Could not resolve elements '{source}' and '{target}'."
                    ));
                    continue;
                };

                let Some(src_el) = model.find_element(&src_el_id).cloned() else {
                    report.errors.push(format!(
                        "AddLink failed: Source element '{source}' not found."
                    ));
                    continue;
                };
                let Some(dst_el) = model.find_element(&dst_el_id).cloned() else {
                    report.errors.push(format!(
                        "AddLink failed: Target element '{target}' not found."
                    ));
                    continue;
                };

                // Cross-boundary SR link -> auto-repair to Social Dependency
                if let (Some(src_aid), Some(dst_aid)) = (&src_el.actor_id, &dst_el.actor_id) {
                    if src_aid != dst_aid {
                        let dep_id = next_unique_id("dep", model);
                        let dep = Dependency {
                            id: dep_id,
                            depender_actor_id: src_aid.clone(),
                            depender_element_id: Some(src_el.id.clone()),
                            dependee_actor_id: dst_aid.clone(),
                            dependee_element_id: Some(dst_el.id.clone()),
                            dependum_name: dst_el.name.clone(),
                            dependum_kind: dst_el.kind,
                            x: 200.0,
                            y: 200.0,
                            custom_properties: BTreeMap::new(),
                        };
                        match ModelService::add_dependency(model, dep) {
                            Ok(created_dep) => {
                                report.mutated = true;
                                report.repaired_warnings.push(format!(
                                    "Auto-repaired cross-boundary {} link '{}' -> '{}' into a Social Dependency '{}' ({:?}).",
                                    format_link_kind_label(parsed_kind),
                                    src_el.name,
                                    dst_el.name,
                                    created_dep.dependum_name,
                                    created_dep.dependum_kind
                                ));
                                report.applied_operations.push(format!(
                                    "Added Dependency '{}' ({}) from '{}' to '{}'.",
                                    created_dep.dependum_name,
                                    created_dep.id,
                                    src_el.name,
                                    dst_el.name
                                ));
                            }
                            Err(err) => {
                                report.errors.push(format!(
                                    "Cross-boundary auto-repair to Dependency failed: {err}"
                                ));
                            }
                        }
                        continue;
                    }
                }

                // Reversed SR link auto-orientation
                match parsed_kind {
                    LinkKind::NeededBy
                        if src_el.kind == ElementKind::Task
                            && dst_el.kind == ElementKind::Resource =>
                    {
                        std::mem::swap(&mut src_el_id, &mut dst_el_id);
                        report.repaired_warnings.push(format!(
                            "Auto-flipped NeededBy link to Resource '{}' -> Task '{}' (iStar 2.0 requires Resource -> Task).",
                            dst_el.name, src_el.name
                        ));
                    }
                    LinkKind::Qualification
                        if matches!(
                            src_el.kind,
                            ElementKind::Goal | ElementKind::Task | ElementKind::Resource
                        ) && dst_el.kind == ElementKind::Quality =>
                    {
                        std::mem::swap(&mut src_el_id, &mut dst_el_id);
                        report.repaired_warnings.push(format!(
                            "Auto-flipped Qualification link to Quality '{}' -> '{}' (iStar 2.0 requires Quality -> Goal/Task/Resource).",
                            dst_el.name, src_el.name
                        ));
                    }
                    LinkKind::Contribution { .. }
                        if src_el.kind == ElementKind::Quality
                            && dst_el.kind != ElementKind::Quality =>
                    {
                        std::mem::swap(&mut src_el_id, &mut dst_el_id);
                        report.repaired_warnings.push(format!(
                            "Auto-flipped Contribution link to '{}' -> Quality '{}' (iStar 2.0 requires Contribution to target a Quality).",
                            dst_el.name, src_el.name
                        ));
                    }
                    LinkKind::AndRefinement | LinkKind::OrRefinement
                        if kind_was_omitted
                            && src_el.kind == ElementKind::Goal
                            && dst_el.kind == ElementKind::Task =>
                    {
                        std::mem::swap(&mut src_el_id, &mut dst_el_id);
                        report.repaired_warnings.push(format!(
                            "Auto-flipped {} link to Task '{}' -> Goal '{}' (inferred top-down refinement).",
                            format_link_kind_label(parsed_kind),
                            dst_el.name,
                            src_el.name
                        ));
                    }
                    _ => {}
                }

                let link_id = next_unique_id("link", model);
                match ModelService::add_link(model, link_id, &src_el_id, &dst_el_id, parsed_kind) {
                    Ok(link) => {
                        report.mutated = true;
                        let src_name = model
                            .find_element(&link.source_id)
                            .map(|e| e.name.as_str())
                            .unwrap_or(&link.source_id);
                        let dst_name = model
                            .find_element(&link.target_id)
                            .map(|e| e.name.as_str())
                            .unwrap_or(&link.target_id);
                        report.applied_operations.push(format!(
                            "Added {} link '{}' -> '{}' ({}).",
                            format_link_kind_label(link.link_kind),
                            src_name,
                            dst_name,
                            link.id
                        ));
                    }
                    Err(err) => {
                        report.errors.push(format!(
                            "AddLink ('{source}' -> '{target}', {:?}) failed: {err}",
                            parsed_kind
                        ));
                    }
                }
            }
            AgentOperation::RemoveLink { id, source, target } => {
                let before = model.links.len();
                if let Some(link_id) = id {
                    model.links.retain(|l| &l.id != link_id);
                } else if let (Some(src), Some(dst)) = (source, target) {
                    let src_el = resolve_element_id(model, src, None);
                    let dst_el = resolve_element_id(model, dst, None);
                    let src_actor = resolve_actor_id(model, src);
                    let dst_actor = resolve_actor_id(model, dst);
                    model.links.retain(|l| {
                        let el_match = src_el.as_deref() == Some(l.source_id.as_str())
                            && dst_el.as_deref() == Some(l.target_id.as_str());
                        let actor_match = src_actor.as_deref() == Some(l.source_id.as_str())
                            && dst_actor.as_deref() == Some(l.target_id.as_str());
                        !(el_match || actor_match)
                    });
                } else {
                    report.errors.push(
                        "RemoveLink requires either 'id' or both 'source' and 'target'."
                            .to_string(),
                    );
                    continue;
                }
                let removed = before.saturating_sub(model.links.len());
                if removed == 0 {
                    report
                        .errors
                        .push("RemoveLink did not match any existing link.".to_string());
                } else {
                    report.mutated = true;
                    report
                        .applied_operations
                        .push(format!("Removed {removed} link(s)."));
                }
            }
            AgentOperation::AddDependency {
                depender_actor,
                depender_element,
                dependee_actor,
                dependee_element,
                dependum_name,
                dependum_kind,
            } => {
                let depender_aid = match ensure_actor_id(model, depender_actor, &mut report) {
                    Ok(id) => id,
                    Err(e) => {
                        report.errors.push(e);
                        continue;
                    }
                };
                let dependee_aid = match ensure_actor_id(model, dependee_actor, &mut report) {
                    Ok(id) => id,
                    Err(e) => {
                        report.errors.push(e);
                        continue;
                    }
                };

                let depender_eid = if let Some(el_ref) = depender_element.as_deref() {
                    let resolved = resolve_element_id(model, el_ref, Some(&depender_aid));
                    if resolved.is_none() {
                        report.repaired_warnings.push(format!(
                            "Depender element '{el_ref}' was not found inside '{depender_actor}'; anchored dependency to actor boundary instead."
                        ));
                    }
                    resolved
                } else {
                    None
                };

                let dependee_eid = if let Some(el_ref) = dependee_element.as_deref() {
                    let resolved = resolve_element_id(model, el_ref, Some(&dependee_aid));
                    if resolved.is_none() {
                        report.repaired_warnings.push(format!(
                            "Dependee element '{el_ref}' was not found inside '{dependee_actor}'; anchored dependency to actor boundary instead."
                        ));
                    }
                    resolved
                } else {
                    None
                };

                let clean_dependum_name = if dependum_name.trim().is_empty() {
                    let inferred = dependee_eid
                        .as_deref()
                        .and_then(|id| model.find_element(id))
                        .map(|e| e.name.clone())
                        .or_else(|| {
                            depender_eid
                                .as_deref()
                                .and_then(|id| model.find_element(id))
                                .map(|e| e.name.clone())
                        })
                        .unwrap_or_else(|| {
                            format!("{} -> {}", depender_actor.trim(), dependee_actor.trim())
                        });
                    report.repaired_warnings.push(format!(
                        "Inferred dependumName '{inferred}' for dependency '{}' -> '{}' because 'dependumName' was omitted.",
                        depender_actor, dependee_actor
                    ));
                    inferred
                } else {
                    dependum_name.trim().to_string()
                };

                let dep_id = next_unique_id("dep", model);
                let dep = Dependency {
                    id: dep_id,
                    depender_actor_id: depender_aid,
                    depender_element_id: depender_eid,
                    dependee_actor_id: dependee_aid,
                    dependee_element_id: dependee_eid,
                    dependum_name: clean_dependum_name,
                    dependum_kind: *dependum_kind,
                    x: 200.0,
                    y: 200.0,
                    custom_properties: BTreeMap::new(),
                };
                if let Err(err) = validate_proposed_dependency(model, &dep) {
                    report.errors.push(format!(
                        "AddDependency ('{}' -> '{}': '{}') failed: {err}",
                        depender_actor, dependee_actor, dependum_name
                    ));
                    continue;
                }
                match ModelService::add_dependency(model, dep) {
                    Ok(created) => {
                        report.mutated = true;
                        report.applied_operations.push(format!(
                            "Added {:?} dependency '{}' ({}) from '{}' to '{}'.",
                            created.dependum_kind,
                            created.dependum_name,
                            created.id,
                            depender_actor,
                            dependee_actor
                        ));
                    }
                    Err(err) => {
                        report.errors.push(format!("AddDependency failed: {err}"));
                    }
                }
            }
            AgentOperation::RemoveDependency { id, dependum_name } => {
                let before = model.dependencies.len();
                if let Some(dep_id) = id {
                    model.dependencies.retain(|d| &d.id != dep_id);
                } else if let Some(name) = dependum_name {
                    let target_name = name.trim();
                    model
                        .dependencies
                        .retain(|d| !d.dependum_name.trim().eq_ignore_ascii_case(target_name));
                } else {
                    report.errors.push(
                        "RemoveDependency requires either 'id' or 'dependumName'.".to_string(),
                    );
                    continue;
                }
                let removed = before.saturating_sub(model.dependencies.len());
                if removed == 0 {
                    report.errors.push(
                        "RemoveDependency did not match any existing dependency.".to_string(),
                    );
                } else {
                    report.mutated = true;
                    report
                        .applied_operations
                        .push(format!("Removed {removed} dependency(s)."));
                }
            }
        }
    }

    if report.mutated {
        ModelService::auto_layout(model);
    }
    report.validation_issues = ModelService::validate(model);
    report
}

fn entity_label(model: &DiagramModel, id: &str) -> String {
    if let Some(a) = model.find_actor(id) {
        return format!("{} [{}]", a.name, a.id);
    }
    if let Some(e) = model.find_element(id) {
        return format!("{} [{}]", e.name, e.id);
    }
    id.to_string()
}

/// Builds a compact semantic summary of the current diagram for LLM context without SVG coordinates.
pub fn summarize_model_context(model: &DiagramModel, selected_entity_id: Option<&str>) -> String {
    let mut out = String::new();
    out.push_str(&format!(
        "Diagram: \"{}\" (id: {}, actors: {}, elements: {}, links: {}, dependencies: {})\n",
        model.name,
        model.id,
        model.actors.len(),
        model.elements.len(),
        model.links.len(),
        model.dependencies.len()
    ));

    if let Some(sel_id) = selected_entity_id {
        if let Some(a) = model.find_actor(sel_id) {
            out.push_str(&format!(
                "Selected Entity: Actor \"{}\" (id: {}, kind: {:?})\n",
                a.name, a.id, a.kind
            ));
        } else if let Some(e) = model.find_element(sel_id) {
            let owner = e
                .actor_id
                .as_deref()
                .and_then(|aid| model.find_actor(aid))
                .map(|a| a.name.as_str())
                .unwrap_or("ORPHAN");
            out.push_str(&format!(
                "Selected Entity: Element \"{}\" (id: {}, kind: {:?}, inside Actor: \"{}\")\n",
                e.name, e.id, e.kind, owner
            ));
        } else if let Some(l) = model.links.iter().find(|l| l.id == sel_id) {
            out.push_str(&format!(
                "Selected Entity: Link {} ({} -> {})\n",
                l.id,
                entity_label(model, &l.source_id),
                entity_label(model, &l.target_id)
            ));
        } else if let Some(d) = model.dependencies.iter().find(|d| d.id == sel_id) {
            out.push_str(&format!(
                "Selected Entity: Dependency \"{}\" ({:?}, id: {})\n",
                d.dependum_name, d.dependum_kind, d.id
            ));
        }
    }

    if model.actors.is_empty() && model.elements.is_empty() {
        out.push_str("Actors: (none — empty canvas)\n");
    } else {
        out.push_str("\nActors & Strategic Rationale Elements:\n");
        for actor in &model.actors {
            out.push_str(&format!(
                "- {:?} \"{}\" [id: {}]{}\n",
                actor.kind,
                actor.name,
                actor.id,
                if actor.collapsed { " (collapsed)" } else { "" }
            ));
            let inner: Vec<_> = model
                .elements
                .iter()
                .filter(|e| e.actor_id.as_deref() == Some(actor.id.as_str()))
                .collect();
            if inner.is_empty() {
                out.push_str("    (no internal elements)\n");
            } else {
                for el in inner {
                    out.push_str(&format!(
                        "    * {:?} \"{}\" [id: {}]\n",
                        el.kind, el.name, el.id
                    ));
                }
            }
        }
        let orphans: Vec<_> = model
            .elements
            .iter()
            .filter(|e| e.actor_id.is_none())
            .collect();
        if !orphans.is_empty() {
            out.push_str("- Orphan Elements (outside any actor):\n");
            for el in orphans {
                out.push_str(&format!(
                    "    * {:?} \"{}\" [id: {}]\n",
                    el.kind, el.name, el.id
                ));
            }
        }
    }

    if !model.links.is_empty() {
        out.push_str("\nLinks:\n");
        for l in &model.links {
            out.push_str(&format!(
                "- [{}] {} --({})--> {}\n",
                l.id,
                entity_label(model, &l.source_id),
                format_link_kind_label(l.link_kind),
                entity_label(model, &l.target_id)
            ));
        }
    }

    if !model.dependencies.is_empty() {
        out.push_str("\nSocial Dependencies (Depender -> Dependum -> Dependee):\n");
        for d in &model.dependencies {
            let depender_actor = entity_label(model, &d.depender_actor_id);
            let dependee_actor = entity_label(model, &d.dependee_actor_id);
            let depender_el = d
                .depender_element_id
                .as_deref()
                .map(|id| format!(" ({})", entity_label(model, id)))
                .unwrap_or_default();
            let dependee_el = d
                .dependee_element_id
                .as_deref()
                .map(|id| format!(" ({})", entity_label(model, id)))
                .unwrap_or_default();
            out.push_str(&format!(
                "- [{}] {}{} depends on {}{} for {:?} \"{}\"\n",
                d.id,
                depender_actor,
                depender_el,
                dependee_actor,
                dependee_el,
                d.dependum_kind,
                d.dependum_name
            ));
        }
    }

    let issues = ModelService::validate(model);
    if !issues.is_empty() {
        out.push_str("\nActive Validation Issues:\n");
        for issue in issues {
            let sev = match issue.severity {
                ValidationSeverity::Error => "ERROR",
                ValidationSeverity::Warning => "WARN",
            };
            out.push_str(&format!("- [{}] ({}) {}\n", sev, issue.rule, issue.message));
        }
    }

    out
}

/// Returns the system prompt guiding the LLM on iStar 2.0 modeling in LoneStar.
pub fn build_agent_system_prompt(include_istar_docs: bool) -> String {
    let mut prompt = String::from(
        "You are LoneStar AI, an expert Requirements Engineering & iStar 2.0 (i*) modeling assistant integrated inside the LoneStar Desktop Studio.\n\
         Your job is to help the user build, refine, analyze, and validate iStar 2.0 diagrams.\n\n\
         HOW TO MODIFY THE DIAGRAM:\n\
         - Prefer calling the `apply_istar_operations` function tool whenever you want to add, update, link, or delete nodes.\n\
         - If tool calling is unavailable or disabled by your runtime, output a single fenced block tagged ```istar-ops containing a JSON array of operation objects.\n\
         - You may reference actors and intentional elements by exact `name` (or `id`). Never invent or compute x/y coordinates; LoneStar runs automatic layout after every change.\n\
         - When generating a full new model from scratch, start with `{\"op\": \"clearModel\", \"name\": \"...\"}`.\n\
         - Supported `op` values:\n\
           * `clearModel`: { op, name? }\n\
           * `addActor`: { op, name, kind: \"actor\"|\"agent\"|\"role\" }\n\
           * `updateActor`: { op, actor, newName?, kind?, collapsed? }\n\
           * `removeActor`: { op, actor }\n\
           * `addElement`: { op, actor, name, kind: \"goal\"|\"quality\"|\"task\"|\"resource\" }\n\
           * `updateElement`: { op, element, actor?, newName?, kind? }\n\
           * `removeElement`: { op, element, actor? }\n\
           * `addLink`: { op, source, target, actor?, kind: \"isA\"|\"participatesIn\"|\"andRefinement\"|\"orRefinement\"|\"neededBy\"|\"contribution\"|\"qualification\", value?: \"make\"|\"help\"|\"hurt\"|\"break\" }\n\
           * `removeLink`: { op, id?, source?, target? }\n\
           * `addDependency`: { op, dependerActor, dependerElement?, dependeeActor, dependeeElement?, dependumName, dependumKind: \"goal\"|\"quality\"|\"task\"|\"resource\" }\n\
           * `removeDependency`: { op, id?, dependumName? }\n\
         - Keep explanations concise and respond in the user's language (Italian or English).\n",
    );

    if include_istar_docs {
        prompt.push_str(
            "\niSTAR 2.0 METAMODEL RULES (STRICTLY ENFORCED BY LONESTAR):\n\
             1. Actors: `actor` (general), `role` (abstract characterization of behavior), `agent` (concrete human/software/hardware entity).\n\
             2. Actor Links: `isA` connects ONLY `actor -> actor` or `role -> role` (never `agent`, never mixed). `participatesIn` connects any actor pair (e.g., `agent -> role`). At most 1 structural link between an actor pair; no cycles.\n\
             3. Intentional Elements (always inside an Actor boundary):\n\
                - `goal`: state of affairs an actor wants to achieve.\n\
                - `quality` (softgoal): attribute/NFR for which achievement criteria are not sharply defined.\n\
                - `task`: concrete action or process to execute.\n\
                - `resource`: physical or informational entity.\n\
             4. Internal Strategic Rationale (SR) Links (source and target MUST belong to the SAME Actor):\n\
                - `andRefinement` / `orRefinement`: connects child `goal`/`task` -> parent `goal`/`task` (both `Task -> Goal` and sub-`Goal -> Task` refinements are valid; acyclic; mixing AND and OR on the same parent is forbidden, and `andRefinement` requires >= 2 children).\n\
                - `neededBy`: connects `resource` (source) -> `task` (target).\n\
                - `contribution`: connects `goal`/`task`/`resource`/`quality` (source) -> `quality` (target), with `value` in `make` | `help` | `hurt` | `break` (at most 1 contribution between the same pair; Quality-to-Quality contributions must be acyclic).\n\
                - `qualification`: connects `quality` (source) -> `goal`/`task`/`resource` (target). Contribution and Qualification cannot connect the same two elements.\n\
             5. Social Dependencies (`addDependency`):\n\
                - Connects TWO DISTINCT actors: `dependerActor` depends on `dependeeActor` for a `dependumName` (`goal`|`quality`|`task`|`resource`).\n\
                - Optional `dependerElement` (must belong to `dependerActor`) and `dependeeElement` (must belong to `dependeeActor`). A `dependerElement` cannot be refined or contributed to.\n",
        );
    }

    prompt
}

/// Returns the OpenAI-compatible function tool definition for `apply_istar_operations`.
pub fn agent_tool_schema() -> Value {
    json!({
        "type": "function",
        "function": {
            "name": "apply_istar_operations",
            "description": "Apply a batch of iStar 2.0 modeling operations to the LoneStar diagram. Reference actors and elements by name or id. Auto-layout is applied automatically.",
            "parameters": {
                "type": "object",
                "properties": {
                    "operations": {
                        "type": "array",
                        "description": "Ordered list of operations to modify the iStar 2.0 diagram.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "op": {
                                    "type": "string",
                                    "enum": [
                                        "clearModel",
                                        "addActor",
                                        "updateActor",
                                        "removeActor",
                                        "addElement",
                                        "updateElement",
                                        "removeElement",
                                        "addLink",
                                        "removeLink",
                                        "addDependency",
                                        "removeDependency"
                                    ]
                                },
                                "name": {
                                    "type": "string",
                                    "description": "Display name for addActor, addElement, or clearModel."
                                },
                                "kind": {
                                    "type": "string",
                                    "description": "Actor kind (actor|agent|role), element kind (goal|quality|task|resource), or link kind (isA|participatesIn|andRefinement|orRefinement|neededBy|contribution|qualification)."
                                },
                                "actor": {
                                    "type": "string",
                                    "description": "Owner actor name or id (REQUIRED for addElement, optional scope for addLink/updateElement/removeElement)."
                                },
                                "newName": { "type": "string" },
                                "collapsed": { "type": "boolean" },
                                "element": { "type": "string" },
                                "source": {
                                    "type": "string",
                                    "description": "Source element or actor name/id for addLink (e.g., child Task for andRefinement, Resource for neededBy, Quality for qualification)."
                                },
                                "target": {
                                    "type": "string",
                                    "description": "Target element or actor name/id for addLink (e.g., parent Goal for andRefinement, Task for neededBy, Quality for contribution)."
                                },
                                "value": { "type": "string", "enum": ["make", "help", "hurt", "break"] },
                                "id": { "type": "string" },
                                "dependerActor": { "type": "string" },
                                "dependerElement": { "type": "string" },
                                "dependeeActor": { "type": "string" },
                                "dependeeElement": { "type": "string" },
                                "dependumName": {
                                    "type": "string",
                                    "description": "Descriptive label of the dependum (what is depended on) for addDependency."
                                },
                                "dependumKind": { "type": "string", "enum": ["goal", "quality", "task", "resource"] }
                            },
                            "required": ["op"]
                        }
                    }
                },
                "required": ["operations"]
            }
        }
    })
}

fn try_parse_operations_json(raw: &str) -> Option<Vec<AgentOperation>> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    if let Ok(ops) = serde_json::from_str::<Vec<AgentOperation>>(trimmed) {
        return Some(ops);
    }
    if let Ok(batch) = serde_json::from_str::<AgentOperationBatch>(trimmed) {
        return Some(batch.operations);
    }
    if let Ok(val) = serde_json::from_str::<Value>(trimmed) {
        let (ops, _errs) = parse_operations_value(&val);
        if !ops.is_empty() {
            return Some(ops);
        }
    }
    None
}

/// Extracts operations from fenced ```istar-ops or ```json code blocks when a local model
/// does not use native OpenAI `tool_calls`. Returns `(operations, cleaned_display_text)`.
pub fn extract_operations_from_text(text: &str) -> Option<(Vec<AgentOperation>, String)> {
    let mut all_ops = Vec::new();
    let mut cleaned = String::with_capacity(text.len());
    let mut cursor = 0usize;
    let mut found_any = false;

    while let Some(rel_start) = text[cursor..].find("```") {
        let fence_start = cursor + rel_start;
        let after_ticks = fence_start + 3;
        let Some(rel_newline) = text[after_ticks..].find('\n') else {
            break;
        };
        let lang = text[after_ticks..after_ticks + rel_newline].trim();
        let body_start = after_ticks + rel_newline + 1;
        let Some(rel_end) = text[body_start..].find("```") else {
            break;
        };
        let body_end = body_start + rel_end;
        let fence_end = body_end + 3;
        let body = &text[body_start..body_end];

        let lang_lower = lang.to_ascii_lowercase();
        let candidate_lang =
            lang_lower == "istar-ops" || lang_lower == "json" || lang_lower.is_empty();

        if candidate_lang {
            if let Some(ops) = try_parse_operations_json(body) {
                found_any = true;
                all_ops.extend(ops);
                cleaned.push_str(&text[cursor..fence_start]);
                cursor = fence_end;
                continue;
            }
        }

        cleaned.push_str(&text[cursor..fence_end]);
        cursor = fence_end;
    }

    if found_any {
        cleaned.push_str(&text[cursor..]);
        let collapsed_lines: Vec<&str> = cleaned.lines().collect();
        let display = collapsed_lines.join("\n").trim().to_string();
        return Some((all_ops, display));
    }

    // Fallback: if the entire message is raw JSON
    if let Some(ops) = try_parse_operations_json(text) {
        return Some((ops, String::new()));
    }

    None
}

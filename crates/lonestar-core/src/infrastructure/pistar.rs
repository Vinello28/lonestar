use crate::application::{default_element_size, ModelService, PiStarInteropPort};
use crate::domain::{
    Actor, ActorKind, ContributionValue, Dependency, DiagramMetadata, DiagramModel, DomainError,
    ElementKind, IntentionalElement, Link, LinkKind,
};
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, HashMap};

fn deserialize_flexible_props<'de, D>(deserializer: D) -> Result<BTreeMap<String, String>, D::Error>
where
    D: Deserializer<'de>,
{
    let opt = Option::<BTreeMap<String, Value>>::deserialize(deserializer)?;
    let mut out = BTreeMap::new();
    if let Some(map) = opt {
        for (k, v) in map {
            let s = match v {
                Value::String(s) => s,
                Value::Null => String::new(),
                Value::Bool(b) => b.to_string(),
                Value::Number(n) => n.to_string(),
                other => other.to_string(),
            };
            out.insert(k, s);
        }
    }
    Ok(out)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PiStarNode {
    pub id: String,
    #[serde(default)]
    pub text: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub x: f64,
    #[serde(default)]
    pub y: f64,
    #[serde(default, deserialize_with = "deserialize_flexible_props")]
    pub custom_properties: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PiStarActor {
    pub id: String,
    #[serde(default)]
    pub text: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub x: f64,
    #[serde(default)]
    pub y: f64,
    #[serde(default, deserialize_with = "deserialize_flexible_props")]
    pub custom_properties: BTreeMap<String, String>,
    #[serde(default)]
    pub nodes: Vec<PiStarNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PiStarDependency {
    pub id: String,
    #[serde(default)]
    pub text: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub x: f64,
    #[serde(default)]
    pub y: f64,
    pub source: String,
    pub target: String,
    #[serde(default, deserialize_with = "deserialize_flexible_props")]
    pub custom_properties: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PiStarLink {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub source: String,
    pub target: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PiStarDisplayEntry {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub collapsed: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub x: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub y: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<f64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PiStarDiagramMeta {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<f64>,
    #[serde(default, deserialize_with = "deserialize_flexible_props")]
    pub custom_properties: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PiStarDocument {
    #[serde(default)]
    pub actors: Vec<PiStarActor>,
    #[serde(default)]
    pub orphans: Vec<PiStarNode>,
    #[serde(default)]
    pub dependencies: Vec<PiStarDependency>,
    #[serde(default)]
    pub links: Vec<PiStarLink>,
    #[serde(default)]
    pub display: HashMap<String, PiStarDisplayEntry>,
    #[serde(default = "default_tool")]
    pub tool: String,
    #[serde(default = "default_istar")]
    pub istar: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub save_date: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub diagram: Option<PiStarDiagramMeta>,
}

fn default_tool() -> String {
    "pistar.2.1.0".to_string()
}

fn default_istar() -> String {
    "2.0".to_string()
}

pub struct PiStarJsonAdapter;

impl PiStarJsonAdapter {
    /// Imports LoneStar JSON, piStar `.json`/`.txt` exports, or structured human-readable i* `.txt` files.
    pub fn import_any_json(raw_input: &str) -> Result<DiagramModel, DomainError> {
        let stripped = raw_input.trim_start_matches('\u{feff}').trim();
        let cleaned = strip_data_uri_prefix(stripped);

        if cleaned.is_empty() {
            return Err(DomainError::InvalidData("File is empty".to_string()));
        }

        if cleaned.starts_with('{') {
            let value: Value = serde_json::from_str(cleaned)
                .map_err(|e| DomainError::InvalidData(format!("Invalid JSON: {e}")))?;

            let is_lonestar_native = value.get("elements").is_some()
                && value.get("orphans").is_none()
                && value.get("tool").is_none();

            if is_lonestar_native {
                serde_json::from_value::<DiagramModel>(value)
                    .map_err(|e| DomainError::InvalidData(format!("Invalid LoneStar JSON: {e}")))
            } else {
                PiStarJsonAdapter.import_pistar_json(cleaned)
            }
        } else {
            import_textual_istar_txt(cleaned)
        }
    }
}

fn strip_data_uri_prefix(input: &str) -> &str {
    if let Some(rest) = input.strip_prefix("data:") {
        if let Some((_, payload)) = rest.split_once(',') {
            return payload.trim();
        }
    }
    input
}

impl PiStarInteropPort for PiStarJsonAdapter {
    fn export_pistar_json(&self, model: &DiagramModel) -> Result<String, DomainError> {
        let mut display: HashMap<String, PiStarDisplayEntry> = HashMap::new();
        let mut pistar_actors = Vec::with_capacity(model.actors.len());

        for actor in &model.actors {
            let mut nodes = Vec::new();
            for el in &model.elements {
                if el.actor_id.as_deref() == Some(actor.id.as_str()) {
                    nodes.push(PiStarNode {
                        id: el.id.clone(),
                        text: el.name.clone(),
                        kind: element_kind_to_pistar(el.kind).to_string(),
                        x: el.x,
                        y: el.y,
                        custom_properties: el.custom_properties.clone(),
                    });
                }
            }
            display.insert(
                actor.id.clone(),
                PiStarDisplayEntry {
                    collapsed: Some(actor.collapsed),
                    x: None,
                    y: None,
                    width: Some(actor.width),
                    height: Some(actor.height),
                },
            );
            pistar_actors.push(PiStarActor {
                id: actor.id.clone(),
                text: actor.name.clone(),
                kind: actor_kind_to_pistar(actor.kind).to_string(),
                x: actor.x,
                y: actor.y,
                custom_properties: actor.custom_properties.clone(),
                nodes,
            });
        }

        let orphans = model
            .elements
            .iter()
            .filter(|e| e.actor_id.is_none())
            .map(|el| PiStarNode {
                id: el.id.clone(),
                text: el.name.clone(),
                kind: element_kind_to_pistar(el.kind).to_string(),
                x: el.x,
                y: el.y,
                custom_properties: el.custom_properties.clone(),
            })
            .collect();

        let dependencies = model
            .dependencies
            .iter()
            .map(|dep| PiStarDependency {
                id: dep.id.clone(),
                text: dep.dependum_name.clone(),
                kind: element_kind_to_pistar(dep.dependum_kind).to_string(),
                x: dep.x,
                y: dep.y,
                source: dep
                    .depender_element_id
                    .clone()
                    .unwrap_or_else(|| dep.depender_actor_id.clone()),
                target: dep
                    .dependee_element_id
                    .clone()
                    .unwrap_or_else(|| dep.dependee_actor_id.clone()),
                custom_properties: dep.custom_properties.clone(),
            })
            .collect();

        let links = model
            .links
            .iter()
            .map(|link| {
                let (kind_str, label) = link_kind_to_pistar(link.link_kind);
                PiStarLink {
                    id: link.id.clone(),
                    kind: kind_str.to_string(),
                    source: link.source_id.clone(),
                    target: link.target_id.clone(),
                    label,
                    name: None,
                }
            })
            .collect();

        let doc = PiStarDocument {
            actors: pistar_actors,
            orphans,
            dependencies,
            links,
            display,
            tool: default_tool(),
            istar: default_istar(),
            save_date: if model.metadata.updated_at.is_empty() {
                None
            } else {
                Some(model.metadata.updated_at.clone())
            },
            name: Some(model.name.clone()),
            diagram: None,
        };

        serde_json::to_string_pretty(&doc)
            .map_err(|e| DomainError::InvalidData(format!("Serialization error: {e}")))
    }

    fn import_pistar_json(&self, raw_json: &str) -> Result<DiagramModel, DomainError> {
        let doc: PiStarDocument = serde_json::from_str(raw_json)
            .map_err(|e| DomainError::InvalidData(format!("Invalid piStar JSON: {e}")))?;

        let resolved_name = doc
            .name
            .or_else(|| doc.diagram.and_then(|d| d.name))
            .filter(|n| !n.trim().is_empty())
            .unwrap_or_else(|| "Imported piStar Model".to_string());

        let mut model = DiagramModel::new("imported-model", resolved_name);
        model.version = doc.istar;
        if let Some(save_date) = doc.save_date {
            model.metadata = DiagramMetadata {
                updated_at: save_date,
                ..Default::default()
            };
        }

        let mut element_to_actor: HashMap<String, String> = HashMap::new();

        for pa in doc.actors {
            let actor_id = pa.id.clone();
            let display_entry = doc.display.get(&actor_id);
            let collapsed = display_entry.and_then(|d| d.collapsed).unwrap_or(false);

            let base_x = if pa.x == 0.0 {
                display_entry.and_then(|d| d.x).unwrap_or(pa.x)
            } else {
                pa.x
            };
            let base_y = if pa.y == 0.0 {
                display_entry.and_then(|d| d.y).unwrap_or(pa.y)
            } else {
                pa.y
            };

            let mut min_x = base_x;
            let mut min_y = base_y;
            let mut max_x = base_x + 280.0;
            let mut max_y = base_y + 240.0;

            for pn in &pa.nodes {
                let kind = pistar_to_element_kind(&pn.kind)?;
                let (w, h) = default_element_size(kind);
                let node_disp = doc.display.get(&pn.id);
                let nx = if pn.x == 0.0 {
                    node_disp.and_then(|d| d.x).unwrap_or(pn.x)
                } else {
                    pn.x
                };
                let ny = if pn.y == 0.0 {
                    node_disp.and_then(|d| d.y).unwrap_or(pn.y)
                } else {
                    pn.y
                };

                element_to_actor.insert(pn.id.clone(), actor_id.clone());
                min_x = min_x.min(nx - 24.0);
                min_y = min_y.min(ny - 44.0);
                max_x = max_x.max(nx + w + 24.0);
                max_y = max_y.max(ny + h + 24.0);

                model.elements.push(IntentionalElement {
                    id: pn.id.clone(),
                    name: pn.text.clone(),
                    kind,
                    actor_id: Some(actor_id.clone()),
                    x: nx,
                    y: ny,
                    width: w,
                    height: h,
                    custom_properties: pn.custom_properties.clone(),
                });
            }

            let width = display_entry
                .and_then(|d| d.width)
                .unwrap_or_else(|| (max_x - min_x).max(280.0));
            let height = display_entry
                .and_then(|d| d.height)
                .unwrap_or_else(|| (max_y - min_y).max(240.0));

            model.actors.push(Actor {
                id: actor_id,
                name: pa.text,
                kind: pistar_to_actor_kind(&pa.kind)?,
                x: min_x,
                y: min_y,
                width,
                height,
                collapsed,
                custom_properties: pa.custom_properties,
            });
        }

        for orphan in doc.orphans {
            let kind = pistar_to_element_kind(&orphan.kind)?;
            let (w, h) = default_element_size(kind);
            model.elements.push(IntentionalElement {
                id: orphan.id,
                name: orphan.text,
                kind,
                actor_id: None,
                x: orphan.x,
                y: orphan.y,
                width: w,
                height: h,
                custom_properties: orphan.custom_properties,
            });
        }

        for dep in doc.dependencies {
            let (depender_actor_id, depender_element_id) =
                if let Some(actor_id) = element_to_actor.get(&dep.source) {
                    (actor_id.clone(), Some(dep.source.clone()))
                } else {
                    (dep.source.clone(), None)
                };

            let (dependee_actor_id, dependee_element_id) =
                if let Some(actor_id) = element_to_actor.get(&dep.target) {
                    (actor_id.clone(), Some(dep.target.clone()))
                } else {
                    (dep.target.clone(), None)
                };

            let dep_disp = doc.display.get(&dep.id);
            let dx = if dep.x == 0.0 {
                dep_disp.and_then(|d| d.x).unwrap_or(dep.x)
            } else {
                dep.x
            };
            let dy = if dep.y == 0.0 {
                dep_disp.and_then(|d| d.y).unwrap_or(dep.y)
            } else {
                dep.y
            };

            model.dependencies.push(Dependency {
                id: dep.id,
                depender_actor_id,
                depender_element_id,
                dependee_actor_id,
                dependee_element_id,
                dependum_name: dep.text,
                dependum_kind: pistar_to_element_kind(&dep.kind)?,
                x: dx,
                y: dy,
                custom_properties: dep.custom_properties,
            });
        }

        for link in doc.links {
            // piStar stores dependency half-segments as istar.DependencyLink in some versions; skip those as they are derived from `dependencies`.
            if link.kind == "istar.DependencyLink" {
                continue;
            }
            let contrib_label = link.label.as_deref().or(link.name.as_deref());
            let link_kind = pistar_to_link_kind(&link.kind, contrib_label)?;
            model.links.push(Link {
                id: link.id,
                source_id: link.source,
                target_id: link.target,
                link_kind,
            });
        }

        Ok(model)
    }
}

fn import_textual_istar_txt(raw: &str) -> Result<DiagramModel, DomainError> {
    let mut model = DiagramModel::new("imported-txt", "Imported i* 2.0 (.txt)");
    let mut actor_by_name: HashMap<String, String> = HashMap::new();
    let mut element_by_short_name: HashMap<String, String> = HashMap::new();
    let mut current_actor_id: Option<String> = None;

    let mut actor_seq = 0usize;
    let mut el_seq = 0usize;
    let mut link_seq = 0usize;
    let mut dep_seq = 0usize;

    for raw_line in raw.lines() {
        let line = raw_line.trim();
        if line.is_empty() || line.starts_with('#') || line.starts_with("//") {
            continue;
        }

        if let Some(rest) =
            strip_prefix_ci(line, "Name:").or_else(|| strip_prefix_ci(line, "Model:"))
        {
            let title = rest.trim();
            if !title.is_empty() {
                model.name = title.to_string();
            }
            continue;
        }

        if let Some((actor_kind, rest)) = parse_actor_declaration(line) {
            let name = strip_trailing_paren(rest).trim();
            if !name.is_empty() {
                actor_seq += 1;
                let id = format!("txt-actor-{actor_seq}");
                actor_by_name.insert(name.to_ascii_lowercase(), id.clone());
                current_actor_id = Some(id.clone());
                model.actors.push(Actor {
                    id,
                    name: name.to_string(),
                    kind: actor_kind,
                    x: 100.0,
                    y: 100.0,
                    width: 280.0,
                    height: 240.0,
                    collapsed: false,
                    custom_properties: BTreeMap::new(),
                });
            }
            continue;
        }

        if let Some((el_kind, rest)) = parse_element_declaration(line) {
            let (name_part, explicit_actor) = extract_bracket_actor(rest);
            let target_actor_id = explicit_actor
                .and_then(|aname| actor_by_name.get(&aname.to_ascii_lowercase()).cloned())
                .or_else(|| current_actor_id.clone());
            let clean_name = name_part.trim();
            if !clean_name.is_empty() {
                el_seq += 1;
                let id = format!("txt-el-{el_seq}");
                let (w, h) = default_element_size(el_kind);
                element_by_short_name.insert(clean_name.to_ascii_lowercase(), id.clone());
                model.elements.push(IntentionalElement {
                    id,
                    name: clean_name.to_string(),
                    kind: el_kind,
                    actor_id: target_actor_id,
                    x: 0.0,
                    y: 0.0,
                    width: w,
                    height: h,
                    custom_properties: BTreeMap::new(),
                });
            }
            continue;
        }

        if let Some(rest) = strip_prefix_ci(line, "Dependency:") {
            if let Some((src_raw, dst_raw, dependum_raw, dep_kind)) = parse_dependency_line(rest) {
                let (dep_actor, dep_el) = resolve_endpoint(
                    src_raw,
                    &actor_by_name,
                    &element_by_short_name,
                    &model.elements,
                );
                let (ee_actor, ee_el) = resolve_endpoint(
                    dst_raw,
                    &actor_by_name,
                    &element_by_short_name,
                    &model.elements,
                );
                if let (Some(dep_actor_id), Some(ee_actor_id)) = (dep_actor, ee_actor) {
                    dep_seq += 1;
                    model.dependencies.push(Dependency {
                        id: format!("txt-dep-{dep_seq}"),
                        depender_actor_id: dep_actor_id,
                        depender_element_id: dep_el,
                        dependee_actor_id: ee_actor_id,
                        dependee_element_id: ee_el,
                        dependum_name: dependum_raw.to_string(),
                        dependum_kind: dep_kind,
                        x: 0.0,
                        y: 0.0,
                        custom_properties: BTreeMap::new(),
                    });
                }
            }
            continue;
        }

        if let Some((src_raw, dst_raw, kind)) = parse_link_line(line) {
            let src_id = resolve_node_id(src_raw, &actor_by_name, &element_by_short_name);
            let dst_id = resolve_node_id(dst_raw, &actor_by_name, &element_by_short_name);
            if let (Some(source_id), Some(target_id)) = (src_id, dst_id) {
                link_seq += 1;
                model.links.push(Link {
                    id: format!("txt-link-{link_seq}"),
                    source_id,
                    target_id,
                    link_kind: kind,
                });
            }
        }
    }

    if model.actors.is_empty() && model.elements.is_empty() {
        return Err(DomainError::InvalidData(
            "Unrecognized .txt content: expected piStar JSON or iStar 2.0 text declarations (Actor:, Goal:, Task:, ...)".to_string(),
        ));
    }

    ModelService::auto_layout(&mut model);
    Ok(model)
}

fn strip_prefix_ci<'a>(line: &'a str, prefix: &str) -> Option<&'a str> {
    let head = line.get(..prefix.len())?;
    if head.eq_ignore_ascii_case(prefix) {
        Some(&line[prefix.len()..])
    } else {
        None
    }
}

fn strip_trailing_paren(text: &str) -> &str {
    text.split('(').next().unwrap_or(text)
}

fn parse_actor_declaration(line: &str) -> Option<(ActorKind, &str)> {
    if let Some(rest) = strip_prefix_ci(line, "Agent:") {
        Some((ActorKind::Agent, rest))
    } else if let Some(rest) = strip_prefix_ci(line, "Role:") {
        Some((ActorKind::Role, rest))
    } else if let Some(rest) = strip_prefix_ci(line, "Actor:") {
        let lower = rest.to_ascii_lowercase();
        let kind = if lower.contains("(agent)") {
            ActorKind::Agent
        } else if lower.contains("(role)") {
            ActorKind::Role
        } else {
            ActorKind::Actor
        };
        Some((kind, rest))
    } else {
        None
    }
}

fn parse_element_declaration(line: &str) -> Option<(ElementKind, &str)> {
    if let Some(rest) = strip_prefix_ci(line, "Goal:") {
        Some((ElementKind::Goal, rest))
    } else if let Some(rest) = strip_prefix_ci(line, "Quality:") {
        Some((ElementKind::Quality, rest))
    } else if let Some(rest) = strip_prefix_ci(line, "Softgoal:") {
        Some((ElementKind::Quality, rest))
    } else if let Some(rest) = strip_prefix_ci(line, "Task:") {
        Some((ElementKind::Task, rest))
    } else if let Some(rest) = strip_prefix_ci(line, "Resource:") {
        Some((ElementKind::Resource, rest))
    } else {
        None
    }
}

fn extract_bracket_actor(text: &str) -> (&str, Option<&str>) {
    if let Some(open) = text.rfind('[') {
        if let Some(close) = text[open..].find(']') {
            let actor = text[open + 1..open + close].trim();
            let before = text[..open].trim();
            return (before, Some(actor));
        }
    }
    (text.trim(), None)
}

fn parse_dependency_line(rest: &str) -> Option<(&str, &str, &str, ElementKind)> {
    let (lhs, rhs_full) = rest.split_once("->")?;
    let (dst_raw, dependum_part) = rhs_full.split_once(':')?;
    let (dep_name, dep_kind) = if let Some(open) = dependum_part.rfind('(') {
        let kind_str = dependum_part[open + 1..].trim_end_matches(')').trim();
        let kind = parse_element_kind_word(kind_str).unwrap_or(ElementKind::Goal);
        (dependum_part[..open].trim(), kind)
    } else {
        (dependum_part.trim(), ElementKind::Goal)
    };
    Some((lhs.trim(), dst_raw.trim(), dep_name, dep_kind))
}

fn parse_element_kind_word(word: &str) -> Option<ElementKind> {
    match word.to_ascii_lowercase().as_str() {
        "goal" => Some(ElementKind::Goal),
        "quality" | "softgoal" => Some(ElementKind::Quality),
        "task" => Some(ElementKind::Task),
        "resource" => Some(ElementKind::Resource),
        _ => None,
    }
}

fn parse_link_line(line: &str) -> Option<(&str, &str, LinkKind)> {
    let body = strip_prefix_ci(line, "Link:").unwrap_or(line).trim();
    if let Some((src, rest)) = body.split_once("--") {
        if let Some((mid, dst)) = rest.split_once("-->") {
            let kind = parse_link_kind_word(mid).unwrap_or(LinkKind::AndRefinement);
            return Some((src.trim(), dst.trim(), kind));
        }
    }
    if let Some((src, rhs)) = body.split_once("->") {
        if let Some(open) = rhs.rfind('(') {
            let dst = rhs[..open].trim();
            let kind_str = rhs[open + 1..].trim_end_matches(')');
            let kind = parse_link_kind_word(kind_str).unwrap_or(LinkKind::AndRefinement);
            return Some((src.trim(), dst, kind));
        }
        return Some((src.trim(), rhs.trim(), LinkKind::AndRefinement));
    }
    None
}

fn parse_link_kind_word(word: &str) -> Option<LinkKind> {
    let w = word.trim().to_ascii_lowercase();
    if w == "isa" || w == "is-a" || w == "is_a" {
        return Some(LinkKind::IsA);
    }
    if w.starts_with("participates") {
        return Some(LinkKind::ParticipatesIn);
    }
    if w == "and" || w == "andrefinement" || w == "and-refinement" {
        return Some(LinkKind::AndRefinement);
    }
    if w == "or" || w == "orrefinement" || w == "or-refinement" {
        return Some(LinkKind::OrRefinement);
    }
    if w == "neededby" || w == "needed-by" || w == "needed_by" {
        return Some(LinkKind::NeededBy);
    }
    if w == "qualification" || w == "qualifies" {
        return Some(LinkKind::Qualification);
    }
    if let Some(val) = ContributionValue::from_label(&w) {
        return Some(LinkKind::Contribution { value: val });
    }
    if w.starts_with("contribution") {
        if let Some(inner_start) = w.find('(') {
            let inner = w[inner_start + 1..].trim_end_matches(')').trim();
            let val = ContributionValue::from_label(inner).unwrap_or(ContributionValue::Help);
            return Some(LinkKind::Contribution { value: val });
        }
        return Some(LinkKind::Contribution {
            value: ContributionValue::Help,
        });
    }
    None
}

fn resolve_node_id(
    raw: &str,
    actors: &HashMap<String, String>,
    elements: &HashMap<String, String>,
) -> Option<String> {
    let key = raw.trim().to_ascii_lowercase();
    if let Some((_, el_name)) = key.split_once('.') {
        if let Some(id) = elements.get(el_name.trim()) {
            return Some(id.clone());
        }
    }
    elements.get(&key).or_else(|| actors.get(&key)).cloned()
}

fn resolve_endpoint(
    raw: &str,
    actors: &HashMap<String, String>,
    elements_by_name: &HashMap<String, String>,
    elements: &[IntentionalElement],
) -> (Option<String>, Option<String>) {
    let key = raw.trim().to_ascii_lowercase();
    if let Some((actor_part, el_part)) = key.split_once('.') {
        let a_id = actors.get(actor_part.trim()).cloned();
        let e_id = elements
            .iter()
            .find(|e| {
                e.name.eq_ignore_ascii_case(el_part.trim())
                    && (a_id.is_none() || e.actor_id == a_id)
            })
            .map(|e| e.id.clone());
        return (a_id, e_id);
    }
    if let Some(a_id) = actors.get(&key) {
        return (Some(a_id.clone()), None);
    }
    if let Some(e_id) = elements_by_name.get(&key) {
        let a_id = elements
            .iter()
            .find(|e| &e.id == e_id)
            .and_then(|e| e.actor_id.clone());
        return (a_id, Some(e_id.clone()));
    }
    (None, None)
}

fn actor_kind_to_pistar(kind: ActorKind) -> &'static str {
    match kind {
        ActorKind::Actor => "istar.Actor",
        ActorKind::Agent => "istar.Agent",
        ActorKind::Role => "istar.Role",
    }
}

fn pistar_to_actor_kind(raw: &str) -> Result<ActorKind, DomainError> {
    match raw {
        "istar.Actor" | "Actor" => Ok(ActorKind::Actor),
        "istar.Agent" | "Agent" => Ok(ActorKind::Agent),
        "istar.Role" | "Role" => Ok(ActorKind::Role),
        other => Err(DomainError::InvalidData(format!(
            "Unsupported piStar actor type '{other}'"
        ))),
    }
}

fn element_kind_to_pistar(kind: ElementKind) -> &'static str {
    match kind {
        ElementKind::Goal => "istar.Goal",
        ElementKind::Quality => "istar.Quality",
        ElementKind::Task => "istar.Task",
        ElementKind::Resource => "istar.Resource",
    }
}

fn pistar_to_element_kind(raw: &str) -> Result<ElementKind, DomainError> {
    match raw {
        "istar.Goal" | "Goal" => Ok(ElementKind::Goal),
        "istar.Quality" | "Quality" => Ok(ElementKind::Quality),
        "istar.Task" | "Task" => Ok(ElementKind::Task),
        "istar.Resource" | "Resource" => Ok(ElementKind::Resource),
        other => Err(DomainError::InvalidData(format!(
            "Unsupported piStar element type '{other}'"
        ))),
    }
}

fn link_kind_to_pistar(kind: LinkKind) -> (&'static str, Option<String>) {
    match kind {
        LinkKind::IsA => ("istar.IsALink", None),
        LinkKind::ParticipatesIn => ("istar.ParticipatesInLink", None),
        LinkKind::AndRefinement => ("istar.AndRefinementLink", None),
        LinkKind::OrRefinement => ("istar.OrRefinementLink", None),
        LinkKind::NeededBy => ("istar.NeededByLink", None),
        LinkKind::Contribution { value } => {
            ("istar.ContributionLink", Some(value.as_str().to_string()))
        }
        LinkKind::Qualification => ("istar.QualificationLink", None),
    }
}

fn pistar_to_link_kind(raw: &str, label: Option<&str>) -> Result<LinkKind, DomainError> {
    match raw {
        "istar.IsALink" | "IsALink" => Ok(LinkKind::IsA),
        "istar.ParticipatesInLink" | "ParticipatesInLink" => Ok(LinkKind::ParticipatesIn),
        "istar.AndRefinementLink" | "AndRefinementLink" => Ok(LinkKind::AndRefinement),
        "istar.OrRefinementLink" | "OrRefinementLink" => Ok(LinkKind::OrRefinement),
        "istar.NeededByLink" | "NeededByLink" => Ok(LinkKind::NeededBy),
        "istar.QualificationLink" | "QualificationLink" => Ok(LinkKind::Qualification),
        "istar.ContributionLink" | "ContributionLink" => {
            let value = label
                .and_then(ContributionValue::from_label)
                .unwrap_or(ContributionValue::Help);
            Ok(LinkKind::Contribution { value })
        }
        other => Err(DomainError::InvalidData(format!(
            "Unsupported piStar link type '{other}'"
        ))),
    }
}

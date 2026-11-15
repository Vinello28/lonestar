use crate::application::{default_element_size, PiStarInteropPort};
use crate::domain::{
    Actor, ActorKind, ContributionValue, Dependency, DiagramMetadata, DiagramModel, DomainError,
    ElementKind, IntentionalElement, Link, LinkKind,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, HashMap};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PiStarNode {
    pub id: String,
    pub text: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub x: f64,
    #[serde(default)]
    pub y: f64,
    #[serde(default)]
    pub custom_properties: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PiStarActor {
    pub id: String,
    pub text: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub x: f64,
    #[serde(default)]
    pub y: f64,
    #[serde(default)]
    pub custom_properties: BTreeMap<String, String>,
    #[serde(default)]
    pub nodes: Vec<PiStarNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PiStarDependency {
    pub id: String,
    pub text: String,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(default)]
    pub x: f64,
    #[serde(default)]
    pub y: f64,
    pub source: String,
    pub target: String,
    #[serde(default)]
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
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PiStarDisplayEntry {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub collapsed: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub height: Option<f64>,
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
}

fn default_tool() -> String {
    "pistar.2.1.0".to_string()
}

fn default_istar() -> String {
    "2.0".to_string()
}

pub struct PiStarJsonAdapter;

impl PiStarJsonAdapter {
    pub fn import_any_json(raw_json: &str) -> Result<DiagramModel, DomainError> {
        let value: Value = serde_json::from_str(raw_json)
            .map_err(|e| DomainError::InvalidData(format!("Invalid JSON: {e}")))?;

        let is_lonestar_native = value.get("elements").is_some()
            && value.get("orphans").is_none()
            && value.get("tool").is_none();

        if is_lonestar_native {
            serde_json::from_value::<DiagramModel>(value)
                .map_err(|e| DomainError::InvalidData(format!("Invalid LoneStar JSON: {e}")))
        } else {
            PiStarJsonAdapter.import_pistar_json(raw_json)
        }
    }
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
        };

        serde_json::to_string_pretty(&doc)
            .map_err(|e| DomainError::InvalidData(format!("Serialization error: {e}")))
    }

    fn import_pistar_json(&self, raw_json: &str) -> Result<DiagramModel, DomainError> {
        let doc: PiStarDocument = serde_json::from_str(raw_json)
            .map_err(|e| DomainError::InvalidData(format!("Invalid piStar JSON: {e}")))?;

        let mut model = DiagramModel::new(
            "imported-model",
            doc.name.unwrap_or_else(|| "Imported i* Model".to_string()),
        );
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

            let mut min_x = pa.x;
            let mut min_y = pa.y;
            let mut max_x = pa.x + 280.0;
            let mut max_y = pa.y + 240.0;

            for pn in &pa.nodes {
                let kind = pistar_to_element_kind(&pn.kind)?;
                let (w, h) = default_element_size(kind);
                element_to_actor.insert(pn.id.clone(), actor_id.clone());
                min_x = min_x.min(pn.x - 24.0);
                min_y = min_y.min(pn.y - 44.0);
                max_x = max_x.max(pn.x + w + 24.0);
                max_y = max_y.max(pn.y + h + 24.0);

                model.elements.push(IntentionalElement {
                    id: pn.id.clone(),
                    name: pn.text.clone(),
                    kind,
                    actor_id: Some(actor_id.clone()),
                    x: pn.x,
                    y: pn.y,
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

            model.dependencies.push(Dependency {
                id: dep.id,
                depender_actor_id,
                depender_element_id,
                dependee_actor_id,
                dependee_element_id,
                dependum_name: dep.text,
                dependum_kind: pistar_to_element_kind(&dep.kind)?,
                x: dep.x,
                y: dep.y,
                custom_properties: dep.custom_properties,
            });
        }

        for link in doc.links {
            // piStar stores dependency half-segments as istar.DependencyLink in some versions; skip those as they are derived from `dependencies`.
            if link.kind == "istar.DependencyLink" {
                continue;
            }
            let link_kind = pistar_to_link_kind(&link.kind, link.label.as_deref())?;
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

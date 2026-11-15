use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ActorKind {
    Actor,
    Agent,
    Role,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Actor {
    pub id: String,
    pub name: String,
    pub kind: ActorKind,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    #[serde(default)]
    pub collapsed: bool,
    #[serde(default)]
    pub custom_properties: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ElementKind {
    Goal,
    Quality,
    Task,
    Resource,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IntentionalElement {
    pub id: String,
    pub name: String,
    pub kind: ElementKind,
    pub actor_id: Option<String>,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    #[serde(default)]
    pub custom_properties: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ContributionValue {
    Make,
    Help,
    Hurt,
    Break,
}

impl ContributionValue {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Make => "make",
            Self::Help => "help",
            Self::Hurt => "hurt",
            Self::Break => "break",
        }
    }

    pub fn from_label(label: &str) -> Option<Self> {
        match label.trim().to_ascii_lowercase().as_str() {
            "make" => Some(Self::Make),
            "help" => Some(Self::Help),
            "hurt" => Some(Self::Hurt),
            "break" => Some(Self::Break),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum LinkKind {
    IsA,
    ParticipatesIn,
    AndRefinement,
    OrRefinement,
    NeededBy,
    Contribution { value: ContributionValue },
    Qualification,
}

impl LinkKind {
    pub fn is_actor_link(self) -> bool {
        matches!(self, Self::IsA | Self::ParticipatesIn)
    }

    pub fn is_refinement(self) -> bool {
        matches!(self, Self::AndRefinement | Self::OrRefinement)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Link {
    pub id: String,
    pub source_id: String,
    pub target_id: String,
    #[serde(flatten)]
    pub link_kind: LinkKind,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Dependency {
    pub id: String,
    pub depender_actor_id: String,
    pub depender_element_id: Option<String>,
    pub dependee_actor_id: String,
    pub dependee_element_id: Option<String>,
    pub dependum_name: String,
    pub dependum_kind: ElementKind,
    pub x: f64,
    pub y: f64,
    #[serde(default)]
    pub custom_properties: BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagramMetadata {
    pub author: String,
    pub description: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagramModel {
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub actors: Vec<Actor>,
    #[serde(default)]
    pub elements: Vec<IntentionalElement>,
    #[serde(default)]
    pub links: Vec<Link>,
    #[serde(default)]
    pub dependencies: Vec<Dependency>,
    #[serde(default)]
    pub metadata: DiagramMetadata,
}

impl DiagramModel {
    pub fn new(id: impl Into<String>, name: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            version: "2.0".to_string(),
            actors: Vec::new(),
            elements: Vec::new(),
            links: Vec::new(),
            dependencies: Vec::new(),
            metadata: DiagramMetadata::default(),
        }
    }

    pub fn find_actor(&self, id: &str) -> Option<&Actor> {
        self.actors.iter().find(|a| a.id == id)
    }

    pub fn find_actor_mut(&mut self, id: &str) -> Option<&mut Actor> {
        self.actors.iter_mut().find(|a| a.id == id)
    }

    pub fn find_element(&self, id: &str) -> Option<&IntentionalElement> {
        self.elements.iter().find(|e| e.id == id)
    }

    pub fn find_element_mut(&mut self, id: &str) -> Option<&mut IntentionalElement> {
        self.elements.iter_mut().find(|e| e.id == id)
    }
}

use crate::domain::{
    validate_model, validate_proposed_dependency, validate_proposed_link, Actor, ActorKind,
    Dependency, DiagramModel, DomainError, ElementKind, IntentionalElement, Link, LinkKind,
    ValidationIssue, ValidationSeverity,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelStats {
    pub actor_count: usize,
    pub element_count: usize,
    pub link_count: usize,
    pub dependency_count: usize,
    pub error_count: usize,
    pub warning_count: usize,
}

/// Application layer Use Cases operating purely on domain entities and validation rules.
pub struct ModelService;

impl ModelService {
    pub fn create_empty_model(name: impl Into<String>) -> DiagramModel {
        DiagramModel::new("model-1", name)
    }

    pub fn add_actor(
        model: &mut DiagramModel,
        id: impl Into<String>,
        name: impl Into<String>,
        kind: ActorKind,
        x: f64,
        y: f64,
    ) -> Actor {
        let actor = Actor {
            id: id.into(),
            name: name.into(),
            kind,
            x,
            y,
            width: 280.0,
            height: 240.0,
            collapsed: false,
            custom_properties: BTreeMap::new(),
        };
        model.actors.push(actor.clone());
        actor
    }

    pub fn add_element(
        model: &mut DiagramModel,
        id: impl Into<String>,
        name: impl Into<String>,
        kind: ElementKind,
        actor_id: Option<String>,
        x: f64,
        y: f64,
    ) -> IntentionalElement {
        let (width, height) = default_element_size(kind);
        let el = IntentionalElement {
            id: id.into(),
            name: name.into(),
            kind,
            actor_id,
            x,
            y,
            width,
            height,
            custom_properties: BTreeMap::new(),
        };
        model.elements.push(el.clone());
        el
    }

    pub fn add_link(
        model: &mut DiagramModel,
        id: impl Into<String>,
        source_id: impl Into<String>,
        target_id: impl Into<String>,
        link_kind: LinkKind,
    ) -> Result<Link, DomainError> {
        let source_id = source_id.into();
        let target_id = target_id.into();
        validate_proposed_link(model, &source_id, &target_id, link_kind, None)?;

        let link = Link {
            id: id.into(),
            source_id,
            target_id,
            link_kind,
        };
        model.links.push(link.clone());
        Ok(link)
    }

    pub fn add_dependency(
        model: &mut DiagramModel,
        dep: Dependency,
    ) -> Result<Dependency, DomainError> {
        validate_proposed_dependency(model, &dep)?;
        model.dependencies.push(dep.clone());
        Ok(dep)
    }

    pub fn remove_actor(model: &mut DiagramModel, actor_id: &str) {
        let removed_elements: Vec<String> = model
            .elements
            .iter()
            .filter(|e| e.actor_id.as_deref() == Some(actor_id))
            .map(|e| e.id.clone())
            .collect();

        model.actors.retain(|a| a.id != actor_id);
        model
            .elements
            .retain(|e| e.actor_id.as_deref() != Some(actor_id));
        model.links.retain(|l| {
            l.source_id != actor_id
                && l.target_id != actor_id
                && !removed_elements.contains(&l.source_id)
                && !removed_elements.contains(&l.target_id)
        });
        model
            .dependencies
            .retain(|d| d.depender_actor_id != actor_id && d.dependee_actor_id != actor_id);
    }

    pub fn remove_element(model: &mut DiagramModel, element_id: &str) {
        model.elements.retain(|e| e.id != element_id);
        model
            .links
            .retain(|l| l.source_id != element_id && l.target_id != element_id);
        for dep in &mut model.dependencies {
            if dep.depender_element_id.as_deref() == Some(element_id) {
                dep.depender_element_id = None;
            }
            if dep.dependee_element_id.as_deref() == Some(element_id) {
                dep.dependee_element_id = None;
            }
        }
    }

    pub fn validate_connection(
        model: &DiagramModel,
        source_id: &str,
        target_id: &str,
        link_kind: LinkKind,
    ) -> Result<(), DomainError> {
        validate_proposed_link(model, source_id, target_id, link_kind, None)
            .map_err(DomainError::from)
    }

    pub fn validate(model: &DiagramModel) -> Vec<ValidationIssue> {
        validate_model(model)
    }

    pub fn stats(model: &DiagramModel) -> ModelStats {
        let issues = validate_model(model);
        let error_count = issues
            .iter()
            .filter(|i| i.severity == ValidationSeverity::Error)
            .count();
        let warning_count = issues
            .iter()
            .filter(|i| i.severity == ValidationSeverity::Warning)
            .count();

        ModelStats {
            actor_count: model.actors.len(),
            element_count: model.elements.len(),
            link_count: model.links.len(),
            dependency_count: model.dependencies.len(),
            error_count,
            warning_count,
        }
    }

    /// Cleanly organizes actors into a balanced grid and arranges internal SR elements inside each actor boundary.
    pub fn auto_layout(model: &mut DiagramModel) {
        if model.actors.is_empty() {
            return;
        }
        let cols = ((model.actors.len() as f64).sqrt().ceil() as usize).max(1);
        let col_gap = 420.0;
        let row_gap = 380.0;
        let margin_x = 100.0;
        let margin_y = 100.0;

        for (idx, actor) in model.actors.iter_mut().enumerate() {
            let col = idx % cols;
            let row = idx / cols;
            let new_x = margin_x + (col as f64) * col_gap;
            let new_y = margin_y + (row as f64) * row_gap;
            actor.x = new_x;
            actor.y = new_y;

            let actor_id = actor.id.clone();
            let mut inner_indices: Vec<usize> = model
                .elements
                .iter()
                .enumerate()
                .filter(|(_, e)| e.actor_id.as_deref() == Some(actor_id.as_str()))
                .map(|(i, _)| i)
                .collect();

            if inner_indices.is_empty() {
                continue;
            }

            let inner_cols = ((inner_indices.len() as f64).sqrt().ceil() as usize).max(1);
            let inner_rows = inner_indices.len().div_ceil(inner_cols);
            let cell_w = 150.0;
            let cell_h = 84.0;
            let required_w = (inner_cols as f64 * cell_w + 80.0).max(280.0);
            let required_h = (inner_rows as f64 * cell_h + 95.0).max(240.0);
            actor.width = required_w;
            actor.height = required_h;

            for (inner_pos, el_idx) in inner_indices.drain(..).enumerate() {
                let ic = inner_pos % inner_cols;
                let ir = inner_pos / inner_cols;
                let el = &mut model.elements[el_idx];
                el.x = new_x + 40.0 + (ic as f64) * cell_w;
                el.y = new_y + 72.0 + (ir as f64) * cell_h;
            }
        }

        // Re-center each dependency midpoint between its depender and dependee anchors
        for dep in &mut model.dependencies {
            let start_pt = dep
                .depender_element_id
                .as_deref()
                .and_then(|id| model.elements.iter().find(|e| e.id == id))
                .map(|e| (e.x + e.width * 0.5, e.y + e.height * 0.5))
                .or_else(|| {
                    model
                        .actors
                        .iter()
                        .find(|a| a.id == dep.depender_actor_id)
                        .map(|a| (a.x + a.width * 0.5, a.y + a.height * 0.5))
                });
            let end_pt = dep
                .dependee_element_id
                .as_deref()
                .and_then(|id| model.elements.iter().find(|e| e.id == id))
                .map(|e| (e.x + e.width * 0.5, e.y + e.height * 0.5))
                .or_else(|| {
                    model
                        .actors
                        .iter()
                        .find(|a| a.id == dep.dependee_actor_id)
                        .map(|a| (a.x + a.width * 0.5, a.y + a.height * 0.5))
                });

            if let (Some((sx, sy)), Some((ex, ey))) = (start_pt, end_pt) {
                dep.x = (sx + ex) * 0.5 - 55.0;
                dep.y = (sy + ey) * 0.5 - 22.0;
            }
        }
    }
}

pub fn default_element_size(kind: ElementKind) -> (f64, f64) {
    match kind {
        ElementKind::Goal => (124.0, 50.0),
        ElementKind::Quality => (128.0, 56.0),
        ElementKind::Task => (130.0, 52.0),
        ElementKind::Resource => (122.0, 48.0),
    }
}

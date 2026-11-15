use crate::domain::{DiagramModel, DomainError};
use std::path::Path;

/// Outbound port for diagram persistence (Dependency Inversion Principle).
pub trait ModelRepository {
    fn save_model(&self, path: &Path, model: &DiagramModel) -> Result<(), DomainError>;
    fn load_model(&self, path: &Path) -> Result<DiagramModel, DomainError>;
}

/// Outbound port for importing and exporting models in external formats (e.g., piStar 2.0 JSON).
pub trait PiStarInteropPort {
    fn export_pistar_json(&self, model: &DiagramModel) -> Result<String, DomainError>;
    fn import_pistar_json(&self, raw_json: &str) -> Result<DiagramModel, DomainError>;
}

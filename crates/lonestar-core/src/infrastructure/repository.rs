use crate::application::ModelRepository;
use crate::domain::{DiagramModel, DomainError};
use std::fs;
use std::path::Path;

pub struct JsonFileRepository;

impl ModelRepository for JsonFileRepository {
    fn save_model(&self, path: &Path, model: &DiagramModel) -> Result<(), DomainError> {
        let json = serde_json::to_string_pretty(model)
            .map_err(|e| DomainError::Persistence(format!("Serialize failed: {e}")))?;
        fs::write(path, json).map_err(|e| DomainError::Persistence(format!("Write failed: {e}")))
    }

    fn load_model(&self, path: &Path) -> Result<DiagramModel, DomainError> {
        let raw = fs::read_to_string(path)
            .map_err(|e| DomainError::Persistence(format!("Read failed: {e}")))?;
        crate::infrastructure::PiStarJsonAdapter::import_any_json(&raw)
    }
}

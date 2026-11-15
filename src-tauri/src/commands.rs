use lonestar_core::application::{ModelService, ModelStats, PiStarInteropPort};
use lonestar_core::domain::{DiagramModel, LinkKind, ValidationIssue};
use lonestar_core::infrastructure::{builtin_template, PiStarJsonAdapter};
use std::fs;
use std::path::Path;

#[tauri::command]
pub fn get_initial_model() -> DiagramModel {
    builtin_template("travel")
}

#[tauri::command]
pub fn load_template(template_id: String) -> DiagramModel {
    builtin_template(&template_id)
}

#[tauri::command]
pub fn validate_model(model: DiagramModel) -> Vec<ValidationIssue> {
    ModelService::validate(&model)
}

#[tauri::command]
pub fn get_model_stats(model: DiagramModel) -> ModelStats {
    ModelService::stats(&model)
}

#[tauri::command]
pub fn validate_link_connection(
    model: DiagramModel,
    source_id: String,
    target_id: String,
    link_kind: LinkKind,
) -> Result<(), String> {
    ModelService::validate_connection(&model, &source_id, &target_id, link_kind)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_pistar_json(model: DiagramModel) -> Result<String, String> {
    PiStarJsonAdapter
        .export_pistar_json(&model)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_json_model(raw_json: String) -> Result<DiagramModel, String> {
    PiStarJsonAdapter::import_any_json(&raw_json).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn auto_layout_model(mut model: DiagramModel) -> DiagramModel {
    ModelService::auto_layout(&mut model);
    model
}

#[tauri::command]
pub fn save_file_to_disk(path: String, contents: String, is_base64: bool) -> Result<(), String> {
    let target = Path::new(&path);
    if is_base64 {
        let bytes = decode_base64(&contents)?;
        fs::write(target, bytes).map_err(|e| format!("Failed to write file: {e}"))
    } else {
        fs::write(target, contents).map_err(|e| format!("Failed to write file: {e}"))
    }
}

#[tauri::command]
pub fn read_file_from_disk(path: String) -> Result<String, String> {
    fs::read_to_string(Path::new(&path)).map_err(|e| format!("Failed to read file: {e}"))
}

fn decode_base64(input: &str) -> Result<Vec<u8>, String> {
    let clean: Vec<u8> = input.bytes().filter(|b| !b.is_ascii_whitespace()).collect();
    if !clean.len().is_multiple_of(4) {
        return Err("Invalid base64 payload length".to_string());
    }
    let mut out = Vec::with_capacity((clean.len() / 4) * 3);
    for chunk in clean.as_chunks::<4>().0 {
        let v0 = b64_val(chunk[0])?;
        let v1 = b64_val(chunk[1])?;
        let v2 = if chunk[2] == b'=' {
            0
        } else {
            b64_val(chunk[2])?
        };
        let v3 = if chunk[3] == b'=' {
            0
        } else {
            b64_val(chunk[3])?
        };

        out.push((v0 << 2) | (v1 >> 4));
        if chunk[2] != b'=' {
            out.push((v1 << 4) | (v2 >> 2));
        }
        if chunk[3] != b'=' {
            out.push((v2 << 6) | v3);
        }
    }
    Ok(out)
}

fn b64_val(byte: u8) -> Result<u8, String> {
    match byte {
        b'A'..=b'Z' => Ok(byte - b'A'),
        b'a'..=b'z' => Ok(byte - b'a' + 26),
        b'0'..=b'9' => Ok(byte - b'0' + 52),
        b'+' => Ok(62),
        b'/' => Ok(63),
        other => Err(format!("Unexpected base64 character: {other}")),
    }
}

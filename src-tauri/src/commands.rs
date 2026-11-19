use lonestar_core::application::{ModelService, ModelStats, PiStarInteropPort};
use lonestar_core::domain::{DiagramModel, LinkKind, ValidationIssue};
use lonestar_core::infrastructure::{builtin_template, PiStarJsonAdapter};
use serde::Serialize;
use std::fs;
use std::path::Path;

use crate::agent::{list_provider_models, run_agent_turn, AgentTurnRequest, AgentTurnResponse};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppRuntimeInfo {
    pub version: String,
    pub platform: String,
    pub arch: String,
}

#[tauri::command]
pub fn get_app_info(app: tauri::AppHandle) -> AppRuntimeInfo {
    AppRuntimeInfo {
        version: app.package_info().version.to_string(),
        platform: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
    }
}

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
    let target = Path::new(&path);
    if !target.exists() {
        return Err(format!("FILE_NOT_FOUND: File not found at path: {path}"));
    }
    fs::read_to_string(target).map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            format!("FILE_NOT_FOUND: File not found at path: {path}")
        } else {
            format!("Failed to read file: {e}")
        }
    })
}

#[tauri::command]
pub async fn agent_list_models(
    base_url: String,
    api_key: Option<String>,
) -> Result<Vec<String>, String> {
    list_provider_models(&base_url, api_key.as_deref()).await
}

#[tauri::command]
pub async fn agent_run_turn(request: AgentTurnRequest) -> Result<AgentTurnResponse, String> {
    run_agent_turn(request).await
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

#[cfg(test)]
mod tests {
    use super::read_file_from_disk;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn read_file_from_disk_returns_file_not_found_for_missing_path() {
        let missing = std::env::temp_dir().join("lonestar_definitely_missing_diagram_12345.json");
        let _ = fs::remove_file(&missing);
        let res = read_file_from_disk(missing.to_string_lossy().into_owned());
        assert!(res.is_err());
        let err = res.expect_err("expected missing file error");
        assert!(
            err.starts_with("FILE_NOT_FOUND:"),
            "expected FILE_NOT_FOUND prefix, got: {err}"
        );
    }

    #[test]
    fn read_file_from_disk_reads_existing_file() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let temp_path = std::env::temp_dir().join(format!(
            "lonestar_test_read_{}_{}.json",
            std::process::id(),
            nonce
        ));
        let expected = "{\"name\":\"Recent Test\"}";
        fs::write(&temp_path, expected).expect("write temp test file");

        let result = read_file_from_disk(temp_path.to_string_lossy().into_owned());
        let _ = fs::remove_file(&temp_path);

        assert_eq!(result.expect("read existing temp file"), expected);
    }
}

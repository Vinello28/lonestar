use std::time::Duration;

use lonestar_core::application::{
    agent_tool_schema, build_agent_system_prompt, execute_agent_operations,
    extract_operations_from_text, parse_operations_value, summarize_model_context, AgentOperation,
    ModelService,
};
use lonestar_core::domain::{DiagramModel, ValidationIssue};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

fn default_temperature() -> f32 {
    0.2
}

fn default_include_istar_docs() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProviderConfig {
    pub provider_preset: String,
    pub base_url: String,
    pub model: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default = "default_temperature")]
    pub temperature: f32,
    #[serde(default = "default_include_istar_docs")]
    pub include_istar_docs: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTurnRequest {
    pub config: AgentProviderConfig,
    pub model_state: DiagramModel,
    pub selected_entity_id: Option<String>,
    #[serde(default)]
    pub history: Vec<AgentChatMessage>,
    pub user_prompt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTurnResponse {
    pub assistant_message: String,
    pub updated_model: DiagramModel,
    pub applied_operations: Vec<String>,
    pub repaired_warnings: Vec<String>,
    pub errors: Vec<String>,
    pub validation_issues: Vec<ValidationIssue>,
}

fn ensure_rustls_provider() {
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
}

fn build_http_client(timeout_secs: u64) -> Result<reqwest::Client, String> {
    ensure_rustls_provider();
    reqwest::Client::builder()
        .timeout(Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| format!("Failed to initialize HTTP client: {e}"))
}

fn normalize_base_url(raw: &str) -> String {
    let trimmed = raw.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return "http://localhost:1234/v1".to_string();
    }
    let trimmed = trimmed
        .strip_suffix("/chat/completions")
        .or_else(|| trimmed.strip_suffix("/models"))
        .unwrap_or(trimmed)
        .trim_end_matches('/');

    // Append /v1 only if there is no path segment after host[:port]
    if let Some(scheme_idx) = trimmed.find("://") {
        let after_scheme = &trimmed[scheme_idx + 3..];
        if !after_scheme.contains('/') {
            return format!("{trimmed}/v1");
        }
    }
    trimmed.to_string()
}

fn extract_models_from_json(json_val: &Value) -> Vec<String> {
    let mut models = Vec::new();
    let is_chat_model = |id: &str| {
        let lower = id.to_ascii_lowercase();
        !lower.contains("embed")
    };
    if let Some(arr) = json_val.get("data").and_then(|v| v.as_array()) {
        for item in arr {
            if let Some(id) = item.get("id").and_then(|v| v.as_str()) {
                let clean = id.trim();
                if !clean.is_empty() && is_chat_model(clean) && !models.iter().any(|m| m == clean) {
                    models.push(clean.to_string());
                }
            }
        }
    }
    if models.is_empty() {
        if let Some(arr) = json_val.get("models").and_then(|v| v.as_array()) {
            for item in arr {
                let candidate = item
                    .get("name")
                    .or_else(|| item.get("id"))
                    .and_then(|v| v.as_str());
                if let Some(id) = candidate {
                    let clean = id.trim();
                    if !clean.is_empty()
                        && is_chat_model(clean)
                        && !models.iter().any(|m| m == clean)
                    {
                        models.push(clean.to_string());
                    }
                }
            }
        }
    }
    models
}

pub async fn list_provider_models(
    base_url: &str,
    api_key: Option<&str>,
) -> Result<Vec<String>, String> {
    let normalized = normalize_base_url(base_url);
    let url = format!("{normalized}/models");
    let client = build_http_client(6)?;

    let mut req = client.get(&url);
    if let Some(key) = api_key {
        let key = key.trim();
        if !key.is_empty() {
            req = req.bearer_auth(key);
        }
    }

    let resp = req
        .send()
        .await
        .map_err(|e| format!("Could not reach {url}: {e}"))?;

    let status = resp.status();
    let body_text = resp
        .text()
        .await
        .map_err(|e| format!("Failed to read models response: {e}"))?;

    if !status.is_success() {
        return Err(format!(
            "Provider returned HTTP {} from {url}: {}",
            status.as_u16(),
            body_text.chars().take(300).collect::<String>()
        ));
    }

    let json_val: Value =
        serde_json::from_str(&body_text).map_err(|e| format!("Invalid JSON from {url}: {e}"))?;

    Ok(extract_models_from_json(&json_val))
}

struct CompletionOutput {
    content: String,
    operations: Vec<AgentOperation>,
    parse_errors: Vec<String>,
}

fn extract_content_string(msg: &Value) -> String {
    if let Some(s) = msg.get("content").and_then(|v| v.as_str()) {
        return s.to_string();
    }
    if let Some(parts) = msg.get("content").and_then(|v| v.as_array()) {
        let mut combined = String::new();
        for part in parts {
            if let Some(text) = part.get("text").and_then(|v| v.as_str()) {
                combined.push_str(text);
            }
        }
        return combined;
    }
    String::new()
}

fn parse_tool_call_operations(tool_calls: &[Value]) -> (Vec<AgentOperation>, Vec<String>) {
    let mut ops = Vec::new();
    let mut parse_errors = Vec::new();

    for call in tool_calls {
        let Some(func) = call.get("function") else {
            continue;
        };
        let name = func.get("name").and_then(|v| v.as_str()).unwrap_or("");
        if name != "apply_istar_operations" {
            continue;
        }
        let Some(args_val) = func.get("arguments") else {
            parse_errors.push("Tool call 'apply_istar_operations' omitted arguments.".to_string());
            continue;
        };

        let parsed_val: Result<Value, String> = match args_val {
            Value::String(s) => serde_json::from_str::<Value>(s)
                .map_err(|e| format!("Failed to parse tool call JSON arguments: {e}")),
            Value::Object(_) | Value::Array(_) => Ok(args_val.clone()),
            _ => Err("Unexpected tool call argument JSON type.".to_string()),
        };

        match parsed_val {
            Ok(val) => {
                let (parsed_ops, errs) = parse_operations_value(&val);
                ops.extend(parsed_ops);
                parse_errors.extend(errs);
            }
            Err(err) => parse_errors.push(err),
        }
    }

    (ops, parse_errors)
}

async fn send_chat_completion(
    client: &reqwest::Client,
    url: &str,
    api_key: &str,
    model: &str,
    temperature: f32,
    messages: &[Value],
    use_tools: bool,
) -> Result<(u16, String), String> {
    let mut body = json!({
        "model": model,
        "messages": messages,
        "temperature": temperature
    });
    if use_tools {
        if let Some(obj) = body.as_object_mut() {
            obj.insert("tools".to_string(), json!([agent_tool_schema()]));
            obj.insert("tool_choice".to_string(), json!("auto"));
        }
    }

    let mut req = client.post(url).json(&body);
    let key = api_key.trim();
    if !key.is_empty() {
        req = req.bearer_auth(key);
    }

    let resp = req
        .send()
        .await
        .map_err(|e| format!("Request to {url} failed: {e}"))?;
    let status = resp.status().as_u16();
    let text = resp
        .text()
        .await
        .map_err(|e| format!("Failed reading response body from {url}: {e}"))?;
    Ok((status, text))
}

async fn invoke_completion(
    client: &reqwest::Client,
    base_url: &str,
    config: &AgentProviderConfig,
    messages: &[Value],
) -> Result<CompletionOutput, String> {
    let url = format!("{base_url}/chat/completions");

    let (mut status, mut body_text) = send_chat_completion(
        client,
        &url,
        &config.api_key,
        config.model.trim(),
        config.temperature,
        messages,
        true,
    )
    .await?;

    // Fallback for local models (e.g. LM Studio Jinja templates without tool-calling support)
    if status == 400 || status == 422 {
        let (retry_status, retry_text) = send_chat_completion(
            client,
            &url,
            &config.api_key,
            config.model.trim(),
            config.temperature,
            messages,
            false,
        )
        .await?;
        status = retry_status;
        body_text = retry_text;
    }

    if !(200..300).contains(&status) {
        return Err(format!(
            "LLM provider returned HTTP {status}: {}",
            body_text.chars().take(500).collect::<String>()
        ));
    }

    let json_val: Value = serde_json::from_str(&body_text)
        .map_err(|e| format!("Invalid JSON response from LLM: {e}"))?;

    let msg = json_val
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|first| first.get("message"))
        .ok_or_else(|| "LLM response did not contain choices[0].message".to_string())?;

    let raw_content = extract_content_string(msg);
    let mut ops = Vec::new();
    let mut parse_errors = Vec::new();

    if let Some(tool_calls) = msg.get("tool_calls").and_then(|v| v.as_array()) {
        let (tool_ops, errs) = parse_tool_call_operations(tool_calls);
        ops.extend(tool_ops);
        parse_errors.extend(errs);
    }

    let cleaned_content =
        if let Some((text_ops, cleaned)) = extract_operations_from_text(&raw_content) {
            if ops.is_empty() {
                ops.extend(text_ops);
            }
            cleaned
        } else {
            raw_content.trim().to_string()
        };

    Ok(CompletionOutput {
        content: cleaned_content,
        operations: ops,
        parse_errors,
    })
}

pub async fn run_agent_turn(req: AgentTurnRequest) -> Result<AgentTurnResponse, String> {
    if req.config.model.trim().is_empty() {
        return Err("No model selected. Configure a model in Agent Settings first.".to_string());
    }
    if req.user_prompt.trim().is_empty() {
        return Err("Prompt cannot be empty.".to_string());
    }

    let base_url = normalize_base_url(&req.config.base_url);
    let client = build_http_client(120)?;

    let mut working_model = req.model_state.clone();
    let system_prompt = format!(
        "{}\n\nCURRENT DIAGRAM STATE:\n{}",
        build_agent_system_prompt(req.config.include_istar_docs),
        summarize_model_context(&working_model, req.selected_entity_id.as_deref())
    );

    let mut messages = Vec::new();
    messages.push(json!({
        "role": "system",
        "content": system_prompt
    }));

    let history_start = req.history.len().saturating_sub(12);
    for msg in &req.history[history_start..] {
        let role = match msg.role.as_str() {
            "assistant" => "assistant",
            _ => "user",
        };
        if !msg.content.trim().is_empty() {
            messages.push(json!({
                "role": role,
                "content": msg.content
            }));
        }
    }

    messages.push(json!({
        "role": "user",
        "content": req.user_prompt
    }));

    let initial = invoke_completion(&client, &base_url, &req.config, &messages).await?;

    let mut applied_operations = Vec::new();
    let mut repaired_warnings = Vec::new();
    let mut current_errors = initial.parse_errors.clone();
    let mut assistant_message = initial.content.clone();

    if !initial.operations.is_empty() {
        let report = execute_agent_operations(&mut working_model, &initial.operations);
        applied_operations.extend(report.applied_operations);
        repaired_warnings.extend(report.repaired_warnings);
        current_errors.extend(report.errors);
    }

    // Self-correction loop (up to 2 repair rounds) if any operations failed validation or JSON parsing
    for _round in 0..2 {
        if current_errors.is_empty() {
            break;
        }

        if !assistant_message.is_empty() {
            messages.push(json!({
                "role": "assistant",
                "content": assistant_message
            }));
        }

        let repair_prompt = format!(
            "Some operations could not be applied due to iStar 2.0 metamodel or schema errors:\n- {}\n\n\
             Already applied in this turn:\n{}\n\n\
             Updated diagram state:\n{}\n\n\
             Please emit ONLY the corrected or remaining operations (via `apply_istar_operations` or ```istar-ops) to resolve those errors.",
            current_errors.join("\n- "),
            if applied_operations.is_empty() {
                "(none)".to_string()
            } else {
                applied_operations.join("\n")
            },
            summarize_model_context(&working_model, req.selected_entity_id.as_deref())
        );

        messages.push(json!({
            "role": "user",
            "content": repair_prompt
        }));

        let repair = invoke_completion(&client, &base_url, &req.config, &messages).await?;
        if !repair.content.is_empty() {
            assistant_message = repair.content;
        }

        current_errors = repair.parse_errors;
        if repair.operations.is_empty() {
            break;
        }

        let report = execute_agent_operations(&mut working_model, &repair.operations);
        applied_operations.extend(report.applied_operations);
        repaired_warnings.extend(report.repaired_warnings);
        current_errors.extend(report.errors);
    }

    if assistant_message.trim().is_empty() {
        if !applied_operations.is_empty() {
            assistant_message = format!(
                "Applied {} operation(s) to the iStar 2.0 diagram.",
                applied_operations.len()
            );
        } else if !current_errors.is_empty() {
            assistant_message =
                "The model returned operations that could not be applied cleanly.".to_string();
        } else {
            assistant_message = "Done.".to_string();
        }
    }

    let validation_issues = ModelService::validate(&working_model);

    Ok(AgentTurnResponse {
        assistant_message,
        updated_model: working_model,
        applied_operations,
        repaired_warnings,
        errors: current_errors,
        validation_issues,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore = "Requires local LM Studio server running on http://localhost:1234/v1"]
    fn live_lmstudio_gemma4_e4b_end_to_end() {
        tauri::async_runtime::block_on(async {
            let models = list_provider_models("http://localhost:1234/v1", None)
                .await
                .expect("LM Studio /v1/models should respond");
            println!("Detected chat models: {models:?}");
            assert!(!models.iter().any(|m| m.contains("embed")));
            assert!(models.iter().any(|m| m == "google/gemma-4-e4b"));

            let req = AgentTurnRequest {
                config: AgentProviderConfig {
                    provider_preset: "lmstudio".to_string(),
                    base_url: "http://localhost:1234/v1".to_string(),
                    model: "google/gemma-4-e4b".to_string(),
                    api_key: String::new(),
                    temperature: 0.2,
                    include_istar_docs: true,
                },
                model_state: DiagramModel::new("live-1", "Live Test"),
                selected_entity_id: None,
                history: vec![],
                user_prompt: "Crea un modello iStar 2.0 per il prestito libri in biblioteca con il ruolo Studente, l'agente Biblioteca, obiettivi/task/risorse interni e una dipendenza sociale tra loro.".to_string(),
            };

            let resp = run_agent_turn(req)
                .await
                .expect("run_agent_turn should succeed on LM Studio");
            println!("Assistant message:\n{}\n", resp.assistant_message);
            println!(
                "Applied ops ({}): {:#?}",
                resp.applied_operations.len(),
                resp.applied_operations
            );
            println!(
                "Repaired warnings ({}): {:#?}",
                resp.repaired_warnings.len(),
                resp.repaired_warnings
            );
            println!("Errors ({}): {:#?}", resp.errors.len(), resp.errors);
            println!(
                "Validation issues ({}): {:#?}",
                resp.validation_issues.len(),
                resp.validation_issues
            );

            assert!(!resp.applied_operations.is_empty());
            assert!(!resp.updated_model.actors.is_empty());
            assert!(
                resp.errors.is_empty(),
                "Unexpected errors: {:?}",
                resp.errors
            );
        });
    }
}

pub mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::get_initial_model,
            commands::load_template,
            commands::validate_model,
            commands::get_model_stats,
            commands::validate_link_connection,
            commands::export_pistar_json,
            commands::import_json_model,
            commands::auto_layout_model,
            commands::save_file_to_disk,
            commands::read_file_from_disk,
        ])
        .run(tauri::generate_context!())
        .expect("error while running LoneStar Tauri application");
}

pub mod agent;
pub mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            #[cfg(target_os = "macos")]
            install_guarded_quit_menu(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_app_info,
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
            commands::agent_list_models,
            commands::agent_run_turn,
        ])
        .run(tauri::generate_context!())
        .expect("error while running LoneStar Tauri application");
}

/// macOS: the default menu's Quit item (Cmd+Q) calls `-[NSApp terminate:]`, which exits without
/// a window `CloseRequested` event, so the frontend's unsaved-changes guard would never run.
/// It is swapped for an item that closes the windows, which goes through that guard.
#[cfg(target_os = "macos")]
fn install_guarded_quit_menu(app: &tauri::AppHandle) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem, MenuItemKind};
    use tauri::Manager;

    const QUIT_ID: &str = "lonestar-quit";

    let menu = Menu::default(app)?;
    if let Some(MenuItemKind::Submenu(app_menu)) = menu.items()?.into_iter().next() {
        let quit_position = app_menu.items()?.iter().position(|item| {
            matches!(item, MenuItemKind::Predefined(p) if p.text().is_ok_and(|t| t.starts_with("Quit")))
        });
        if let Some(position) = quit_position {
            let label = format!("Quit {}", app.package_info().name);
            let quit = MenuItem::with_id(app, QUIT_ID, label, true, Some("CmdOrCtrl+Q"))?;
            app_menu.remove_at(position)?;
            app_menu.insert(&quit, position)?;
        }
    }
    app.set_menu(menu)?;

    app.on_menu_event(|app, event| {
        if event.id() == QUIT_ID {
            for window in app.webview_windows().values() {
                // Emits CloseRequested like the red button; the frontend decides.
                let _ = window.close();
            }
        }
    });
    Ok(())
}

mod commands;
mod database;
mod db_factory;
mod models;
mod state;
mod utils;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use std::sync::{mpsc, Arc, Mutex};
    let (tx, rx) = mpsc::channel::<String>();
    let app_state = Arc::new(state::AppState {
        project_event_tx: Mutex::new(tx),
        terminal_sessions: Mutex::new(std::collections::HashMap::new()),
    });

    let db_manager = state::DbConnectionManager {
        connections: Mutex::new(std::collections::HashMap::new()),
    };

    // Spawn background thread to listen for project_created events
    let thread_state = app_state.clone();
    std::thread::spawn(move || {
        for project_id in rx {
            // Directly pass Arc<AppState> reference
            let _ =
                crate::commands::project_commands::setup_project(project_id, thread_state.clone());
        }
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(app_state.clone())
        .manage(db_manager)
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::project_commands::create_project,
            commands::project_commands::get_projects,
            commands::db_tool_commands::get_project_tables,
            commands::db_tool_commands::get_table_data,
            commands::db_tool_commands::get_table_total_count,
            commands::db_tool_commands::execute_query,
            commands::db_tool_commands::delete_row,
            commands::db_tool_commands::update_row,
            commands::db_tool_commands::save_db_credentials,
            commands::db_tool_commands::get_db_connection_type,
            commands::project_commands::get_project_config,
            commands::project_commands::update_project,
            commands::project_commands::delete_project,
            commands::project_commands::open_folder,
            commands::project_commands::open_in_editor,
            commands::project_commands::get_laravel_commands,
            commands::log_commands::get_log_files,
            commands::log_commands::read_log_file,
            commands::terminal_commands::spawn_pty,
            commands::terminal_commands::write_pty,
            commands::terminal_commands::resize_pty
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

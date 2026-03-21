// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn open_in_editor(command: String, path: String) -> Result<(), String> {
    match std::process::Command::new(&command).arg(&path).spawn() {
        Ok(_) => Ok(()),
        Err(e) => Err(format!("Failed to open editor: {}", e)),
    }
}

mod terminal;
mod project;
mod db_viewer;
mod logs;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(terminal::TerminalState::default())
        .manage(db_viewer::DbState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            open_in_editor,
            terminal::create_terminal,
            terminal::write_to_terminal,
            terminal::resize_terminal,
            project::get_project_info,
            project::detect_and_save_project_info,
            project::remove_project_info,
            project::get_saved_queries,
            project::save_query,
            project::get_artisan_commands,
            db_viewer::get_laravel_db_config,
            db_viewer::list_tables,
            db_viewer::get_table_data,
            db_viewer::get_table_schema,
            db_viewer::update_table_row,
            db_viewer::get_table_count,
            db_viewer::cleanup_expired_sessions,
            db_viewer::execute_raw_sql,
            logs::list_laravel_logs,
            logs::read_laravel_log,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

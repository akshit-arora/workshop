// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn find_php_method_line(path: String, method: String) -> Result<i32, String> {
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file at {}: {}", path, e))?;
    
    let search_term = format!("function {}", method);
    for (idx, line) in content.lines().enumerate() {
        if line.contains(&search_term) {
            return Ok((idx + 1) as i32);
        }
    }
    
    Ok(1) // Fallback to line 1 if method not found
}

#[tauri::command]
fn open_in_editor(command: String, path: String) -> Result<(), String> {
    // Check if path has a line number (format "absolute_path:line")
    let (file_path, line) = if path.contains(':') && !path.starts_with("http") {
        let parts: Vec<&str> = path.rsplitn(2, ':').collect();
        (parts[1], Some(parts[0]))
    } else {
        (path.as_str(), None)
    };
    
    let cmd_lower = command.to_lowercase();
    
    // Determine the correct command and arguments based on the editor type
    let final_cmd = if let Some(l) = line {
        if cmd_lower.contains("code") || cmd_lower.contains("cursor") || cmd_lower.contains("antigravity") || cmd_lower.contains("zed") {
            // VS Code, Cursor, and Zed use -g file:line or just file:line
            format!("{} -g \"{}:{}\"", command, file_path, l)
        } else if cmd_lower.contains("pstorm") || cmd_lower.contains("phpstorm") || cmd_lower.contains("idea") || cmd_lower.contains("webstorm") || cmd_lower.contains("goland") {
            // JetBrains family uses --line line file
            format!("{} --line {} \"{}\"", command, l, file_path)
        } else if cmd_lower.contains("subl") || cmd_lower.contains("atom") {
            // Sublime Text and Atom use file:line
            format!("{} \"{}:{}\"", command, file_path, l)
        } else if cmd_lower.contains("vim") || cmd_lower.contains("nvim") || cmd_lower.contains("nano") || cmd_lower.contains("emacs") || cmd_lower.contains("bbedit") {
            // Terminal editors and BBEdit often use +line file
            format!("{} +{} \"{}\"", command, l, file_path)
        } else if cmd_lower.contains("mate") {
            // TextMate uses -l line file
            format!("{} -l {} \"{}\"", command, l, file_path)
        } else {
            // Fallback for others: usually path:line
            format!("{} \"{}:{}\"", command, file_path, l)
        }
    } else {
        // Just open the path (folder or file)
        format!("{} \"{}\"", command, file_path)
    };

    #[cfg(target_os = "macos")]
    {
        match std::process::Command::new("sh")
            .arg("-c")
            .arg(&final_cmd)
            .spawn() {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("Failed to open editor through shell: {}. Command was: {}", e, final_cmd)),
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        // For non-mac, we still use shell if possible for simplicity with our formatted string
        match std::process::Command::new("sh")
            .arg("-c")
            .arg(&final_cmd)
            .spawn() {
            Ok(_) => Ok(()),
            Err(_) => {
                // Last ditch effort for Windows/others without sh
                let cmd_parts: Vec<&str> = final_cmd.split_whitespace().collect();
                let mut process = std::process::Command::new(cmd_parts[0]);
                for arg in &cmd_parts[1..] {
                    process.arg(arg);
                }
                process.spawn().map(|_| ()).map_err(|e| e.to_string())
            }
        }
    }
}

mod db_viewer;
mod logs;
mod project;
mod terminal;
mod telescope;

#[cfg(test)]
mod db_viewer_tests;
#[cfg(test)]
mod logs_tests;
#[cfg(test)]
mod project_tests;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(terminal::TerminalState::default())
        .manage(db_viewer::DbState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            find_php_method_line,
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
            project::save_custom_db_config,
            project::check_telescope_installed,
            db_viewer::get_laravel_db_config,
            db_viewer::test_db_connection,
            db_viewer::list_tables,
            db_viewer::get_table_data,
            db_viewer::get_table_schema,
            db_viewer::update_table_row,
            db_viewer::get_table_count,
            db_viewer::cleanup_expired_sessions,
            db_viewer::execute_raw_sql,
            logs::list_laravel_logs,
            logs::read_laravel_log,
            telescope::get_telescope_summary,
            telescope::get_telescope_slow_queries,
            telescope::get_telescope_exceptions,
            telescope::get_telescope_cache_insights,
            telescope::get_telescope_http_insights,
            telescope::get_telescope_n_plus_one,
            telescope::get_telescope_recent_requests,
            telescope::get_telescope_batch_entries,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

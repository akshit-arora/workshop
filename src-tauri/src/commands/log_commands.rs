use crate::database::Database;
use crate::utils::get_db_path;
use std::fs;
use std::path::Path;
use tauri::command;

#[command]
pub fn get_log_files(id: String) -> Result<Vec<String>, String> {
    let db_path = get_db_path()?;
    let db = Database::new(db_path).map_err(|e| e.to_string())?;
    let project = db
        .get_project_by_id(&id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Project not found".to_string())?;

    let log_dir = Path::new(&project.location).join("storage/logs");

    if !log_dir.exists() {
        return Ok(vec![]);
    }

    let mut files = Vec::new();
    if let Ok(entries) = fs::read_dir(log_dir) {
        for entry in entries {
            if let Ok(entry) = entry {
                if let Ok(file_type) = entry.file_type() {
                    if file_type.is_file() {
                        if let Ok(file_name) = entry.file_name().into_string() {
                            if file_name.ends_with(".log") {
                                files.push(file_name);
                            }
                        }
                    }
                }
            }
        }
    }

    files.sort();
    files.reverse();

    Ok(files)
}

#[command]
pub fn read_log_file(id: String, filename: String) -> Result<String, String> {
    let db_path = get_db_path()?;
    let db = Database::new(db_path).map_err(|e| e.to_string())?;
    let project = db
        .get_project_by_id(&id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Project not found".to_string())?;

    // Prevent directory traversal
    if filename.contains("..") || filename.contains("/") || filename.contains("\\") {
        return Err("Invalid filename".to_string());
    }

    let log_path = Path::new(&project.location)
        .join("storage/logs")
        .join(filename);

    if !log_path.exists() {
        return Err("Log file not found".to_string());
    }

    // Read the file. If it's too large, we might want to read only the last N lines, but for now read all.
    // Laravel logs can be large. Maybe limit to 1MB or something?
    // User asked to "show the log", usually implies the whole thing or tail.
    // Let's read the whole thing for now, assuming they are rotated or not massive.

    fs::read_to_string(log_path).map_err(|e| e.to_string())
}

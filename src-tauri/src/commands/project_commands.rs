use tauri::command;
use tauri::State;
use std::sync::Arc;
use crate::state::AppState;
use crate::models::project::{Project, ProjectStatus};
use crate::database::{Database};
use chrono::Utc;

const DB_PATH: &str = "projects.db";

#[command]
pub fn create_project(
    name: String,
    description: String,
    location: String,
    status: ProjectStatus,
    state: State<Arc<AppState>>
) -> Result<Project, String> {
    let db = Database::new(DB_PATH).map_err(|e| e.to_string())?;
    let project = Project::new(name, description, location, status);

    db.create_project(&project).map_err(|e| e.to_string())?;

    // Emit event to channel
    let _ = state.project_event_tx.lock().unwrap().send(project.id.clone());

    Ok(project)
}

#[command]
pub fn get_projects() -> Result<Vec<Project>, String> {
    let db = Database::new(DB_PATH).map_err(|e| e.to_string())?;
    db.get_projects().map_err(|e| e.to_string())
}

#[command]
pub fn update_project(id: String, name: Option<String>, description: Option<String>, location: Option<String>, status: Option<ProjectStatus>) -> Result<Project, String> {
    let db = Database::new(DB_PATH).map_err(|e| e.to_string())?;

    // First, get the existing project
    let mut existing_projects = db.get_projects().map_err(|e| e.to_string())?;
    let existing_project = existing_projects.iter_mut()
        .find(|p| p.id == id)
        .ok_or("Project not found".to_string())?;

    // Update fields if provided
    if let Some(new_name) = name {
        existing_project.name = new_name;
    }
    if let Some(new_desc) = description {
        existing_project.description = new_desc;
    }
    if let Some(new_location) = location {
        existing_project.location = new_location;
    }
    if let Some(new_status) = status {
        existing_project.status = new_status;
    }

    // Update timestamp
    existing_project.updated_at = Utc::now().to_rfc3339();

    db.update_project(&id, existing_project).map_err(|e| e.to_string())?;
    Ok(existing_project.clone())
}

#[command]
pub fn delete_project(id: String) -> Result<bool, String> {
    let db = Database::new(DB_PATH).map_err(|e| e.to_string())?;
    db.delete_project(&id).map_err(|e| e.to_string())
}

#[command]
pub fn open_folder(location: String) -> Result<(), String> {
    // Use std::process::Command to launch the editor
    if cfg!(windows) {
        std::process::Command::new("explorer")
            .arg(location)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    } else if cfg!(target_os = "macos") {
        std::process::Command::new("open")
            .arg(location)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    } else if cfg!(unix) {
        std::process::Command::new("xdg-open")
            .arg(location)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    } else {
        return Err("Unsupported OS".to_string());
    }
}

#[command]
pub fn open_in_editor(editor: String, location: String) -> Result<(), String> {
    // Validate editor to prevent potential command injection
    let safe_editors = vec![
        "code",   // VSCode
        "subl",   // Sublime Text
        "phpstorm", // PHPStorm
        "windsurf", // Windsurf
        "zed"     // Zed
    ];

    if !safe_editors.contains(&editor.as_str()) {
        return Err(format!("Unsupported editor: {}", editor));
    }

    // Use std::process::Command to launch the editor
    std::process::Command::new(editor)
        .arg(location)
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[command]
pub fn get_project_type(id: String) -> Result<String, String> {
    let db = Database::new(DB_PATH).map_err(|e| e.to_string())?;

    // First, get the existing project
    let mut existing_projects = db.get_projects().map_err(|e| e.to_string())?;
    let existing_project = existing_projects.iter_mut()
        .find(|p| p.id == id)
        .ok_or("Project not found".to_string())?;

    // Get the location of the project
    let location = &existing_project.location;

    // try getting the file `composer.json` from the project location
    let composer_path = format!("{}/composer.json", location);
    if std::path::Path::new(&composer_path).exists() {
        // If the file exists, read the file to determine the project type
        let content = std::fs::read_to_string(&composer_path).map_err(|e| e.to_string())?;
        let json: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;
        // Check if the file has `laravel/framework` in the dependencies
        if let Some(dependencies) = json.get("require").and_then(|r| r.as_object()) {
            if dependencies.contains_key("laravel/framework") {
                // The project is a Laravel project. Send as response

                return Ok("Laravel".to_string());
            }
        }
    }

    // Placeholder: return Ok until implementation is complete
    return Ok("Unknown".to_string());
}

#[command]
pub fn setup_project(id: String, _state: std::sync::Arc<AppState>) -> Result<String, String> {
    let db = Database::new(DB_PATH).map_err(|e| e.to_string())?;
    // Get the project
    let project = db.get_project_by_id(&id).map_err(|e| e.to_string())?
        .ok_or_else(|| "Project not found".to_string())?;
    let location = &project.location;

    // Check/create .workshop folder
    let workshop_dir = format!("{}/.workshop", location);
    if !std::path::Path::new(&workshop_dir).exists() {
        std::fs::create_dir_all(&workshop_dir).map_err(|e| e.to_string())?;
    }

    // Get project type
    let project_type = get_project_type(id)?;

    // Write project.json only if it doesn't exist
    let json_path = format!("{}/project.json", workshop_dir);
    if !std::path::Path::new(&json_path).exists() {
        let json_content = serde_json::json!({ "project_type": project_type });
        std::fs::write(&json_path, serde_json::to_string_pretty(&json_content).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;
    }

    Ok(project_type)
}

#[command]
pub fn get_project_config(id: String, key: String) -> Result<Option<String>, String> {
    let db = Database::new(DB_PATH).map_err(|e| e.to_string())?;

    // Get the project location
    let project = db.get_project_by_id(&id).map_err(|e| e.to_string())?
        .ok_or_else(|| "Project not found".to_string())?;

    // Check if project.json exists
    let config_path = format!("{}/.workshop/project.json", project.location);
    if !std::path::Path::new(&config_path).exists() {
        return Ok(None);
    }

    // Read and parse the JSON file
    let content = std::fs::read_to_string(&config_path).map_err(|e| e.to_string())?;
    let json: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    // Get the value for the requested key
    if let Some(value) = json.get(&key) {
        if let Some(str_value) = value.as_str() {
            return Ok(Some(str_value.to_string()));
        }
    }

    Ok(None)
}


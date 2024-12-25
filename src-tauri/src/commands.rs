use tauri::command;
use crate::models::project::{Project, ProjectStatus};
use crate::database::{Database, DatabaseError};
use chrono::Utc;

const DB_PATH: &str = "projects.db";

#[command]
pub fn create_project(name: String, description: String, location: String, status: ProjectStatus) -> Result<Project, String> {
    let db = Database::new(DB_PATH).map_err(|e| e.to_string())?;
    let project = Project::new(name, description, location, status);
    
    db.create_project(&project).map_err(|e| e.to_string())?;
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
    let mut existing_project = existing_projects.iter_mut()
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

#[tauri::command]
pub fn open_folder(location: String) -> Result<(), String> {
    std::process::Command::new("xdg-open")
        .arg(location)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
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
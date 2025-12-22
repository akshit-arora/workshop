use crate::database::Database;
use crate::models::project::{Project, ProjectStatus};
use crate::state::AppState;
use crate::utils::get_db_path;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::command;
use tauri::State;

/// Helper function to configure a Command with proper environment variables
/// This ensures that PHP, composer, and other system commands are accessible
fn configure_command_env(cmd: &mut std::process::Command) {
    // Get the user's actual PATH by running a login shell
    // This is necessary because when the app is launched from Finder,
    // it doesn't have the user's PATH from .zshrc, .bash_profile, etc.
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());

    // Try to get the PATH from a login shell
    if let Ok(output) = std::process::Command::new(&shell)
        .arg("-l")
        .arg("-c")
        .arg("echo $PATH")
        .output()
    {
        if output.status.success() {
            if let Ok(path) = String::from_utf8(output.stdout) {
                let path = path.trim();
                if !path.is_empty() {
                    cmd.env("PATH", path);
                }
            }
        }
    }

    // Fallback: try to inherit PATH from current process
    if let Ok(path) = std::env::var("PATH") {
        // Only set if we didn't already set it from the shell
        if cmd.get_envs().all(|(k, _)| k != "PATH") {
            cmd.env("PATH", path);
        }
    }

    // Also inherit HOME for proper shell initialization
    if let Ok(home) = std::env::var("HOME") {
        cmd.env("HOME", home);
    }

    // Inherit USER
    if let Ok(user) = std::env::var("USER") {
        cmd.env("USER", user);
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LaravelCommand {
    pub name: String,
    pub description: Option<String>,
}

#[command]
pub fn create_project(
    name: String,
    description: String,
    location: String,
    status: ProjectStatus,
    state: State<Arc<AppState>>,
) -> Result<Project, String> {
    let db_path = get_db_path()?;
    let db = Database::new(db_path).map_err(|e| e.to_string())?;
    let project = Project::new(name, description, location, status);

    db.create_project(&project).map_err(|e| e.to_string())?;

    // Emit event to channel
    let _ = state
        .project_event_tx
        .lock()
        .unwrap()
        .send(project.id.clone());

    Ok(project)
}

#[command]
pub fn get_projects() -> Result<Vec<Project>, String> {
    let db_path = get_db_path()?;
    let db = Database::new(db_path).map_err(|e| e.to_string())?;
    db.get_projects().map_err(|e| e.to_string())
}

#[command]
pub fn update_project(
    id: String,
    name: Option<String>,
    description: Option<String>,
    location: Option<String>,
    status: Option<ProjectStatus>,
) -> Result<Project, String> {
    let db_path = get_db_path()?;
    let db = Database::new(db_path).map_err(|e| e.to_string())?;

    // First, get the existing project
    let mut existing_projects = db.get_projects().map_err(|e| e.to_string())?;
    let existing_project = existing_projects
        .iter_mut()
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

    db.update_project(&id, existing_project)
        .map_err(|e| e.to_string())?;
    Ok(existing_project.clone())
}

#[command]
pub fn delete_project(id: String) -> Result<bool, String> {
    let db_path = get_db_path()?;
    let db = Database::new(db_path).map_err(|e| e.to_string())?;
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
pub fn open_in_editor(editor: String, location: String, line: Option<u32>) -> Result<(), String> {
    // Map display names to actual commands
    let command = match editor.as_str() {
        "VSCode" | "code" => "code",
        "Sublime Text" | "subl" => "subl",
        "PHPStorm" | "phpstorm" => "phpstorm",
        "Windsurf" | "windsurf" => "windsurf",
        "Zed" | "zed" => "zed",
        _ => return Err(format!("Unsupported editor: {}", editor)),
    };

    // Use std::process::Command to launch the editor
    let mut cmd = std::process::Command::new(command);

    if let Some(l) = line {
        match command {
            "code" | "windsurf" | "zed" => {
                cmd.arg("-g").arg(format!("{}:{}", location, l));
            }
            "subl" => {
                cmd.arg(format!("{}:{}", location, l));
            }
            "phpstorm" => {
                cmd.arg("--line").arg(l.to_string()).arg(&location);
            }
            _ => {
                // Fallback for others or if unknown
                cmd.arg(format!("{}:{}", location, l));
            }
        }
    } else {
        cmd.arg(location);
    }

    // Configure environment to ensure editor commands are accessible
    configure_command_env(&mut cmd);

    cmd.spawn().map_err(|e| e.to_string())?;

    Ok(())
}

#[command]
pub fn get_project_type(id: String) -> Result<String, String> {
    let db_path = get_db_path()?;
    let db = Database::new(db_path).map_err(|e| e.to_string())?;

    // First, get the existing project
    let mut existing_projects = db.get_projects().map_err(|e| e.to_string())?;
    let existing_project = existing_projects
        .iter_mut()
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
    let db_path = get_db_path()?;
    let db = Database::new(db_path).map_err(|e| e.to_string())?;
    // Get the project
    let project = db
        .get_project_by_id(&id)
        .map_err(|e| e.to_string())?
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
        std::fs::write(
            &json_path,
            serde_json::to_string_pretty(&json_content).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(project_type)
}

#[command]
pub fn get_project_config(id: String, key: String) -> Result<Option<String>, String> {
    let db_path = get_db_path()?;
    let db = Database::new(db_path).map_err(|e| e.to_string())?;

    // Get the project location
    let project = db
        .get_project_by_id(&id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Project not found".to_string())?;

    // Check if project.json exists
    let config_path = format!("{}/.workshop/project.json", project.location);
    if !std::path::Path::new(&config_path).exists() {
        // Fallback for project_type if file doesn't exist
        if key == "project_type" {
            if let Ok(project_type) = get_project_type(id) {
                if project_type != "Unknown" {
                    return Ok(Some(project_type));
                }
            }
        }
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

    // Fallback for project_type if not found in config
    if key == "project_type" {
        if let Ok(project_type) = get_project_type(id.clone()) {
            // Optionally save it back to project.json? For now just return it.
            // To save it, we would need to update the json and write it back.
            // Let's just return it to be safe and fast.
            if project_type != "Unknown" {
                return Ok(Some(project_type));
            }
        }
    }

    Ok(None)
}

#[command]
pub fn get_laravel_commands(id: String) -> Result<Vec<LaravelCommand>, String> {
    let db_path = get_db_path()?;
    let db = Database::new(db_path).map_err(|e| e.to_string())?;

    // Get the project location
    let project = db
        .get_project_by_id(&id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Project not found".to_string())?;

    let location = project.location;
    let artisan_path = format!("{}/artisan", location);

    if !std::path::Path::new(&artisan_path).exists() {
        return Err("Artisan not found".to_string());
    }

    // Run php artisan list --format=json from the project directory
    let mut cmd = std::process::Command::new("php");
    cmd.current_dir(&location) // Set working directory to project root
        .arg("artisan") // Use relative path to artisan
        .arg("list")
        .arg("--format=json");

    // Configure environment to ensure PHP is accessible
    configure_command_env(&mut cmd);

    let output = cmd.output().map_err(|e| {
        format!(
            "Failed to execute php artisan: {}. Make sure PHP is installed and in your PATH.",
            e
        )
    })?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let content = String::from_utf8(output.stdout).map_err(|e| e.to_string())?;
    let json: serde_json::Value = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    let mut commands = Vec::new();

    if let Some(cmds) = json.get("commands").and_then(|c| c.as_array()) {
        for cmd in cmds {
            if let (Some(name), description) = (
                cmd.get("name").and_then(|n| n.as_str()),
                cmd.get("description").and_then(|d| d.as_str()),
            ) {
                commands.push(LaravelCommand {
                    name: name.to_string(),
                    description: description.map(|d| d.to_string()),
                });
            }
        }
    }

    Ok(commands)
}

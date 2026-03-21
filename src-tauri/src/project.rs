use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::time::SystemTime;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SavedQuery {
    pub name: String,
    pub sql: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ArtisanCommand {
    pub name: String,
    pub description: String,
    pub usage: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct ArtisanList {
    pub commands: Vec<ArtisanCommand>,
}

#[tauri::command]
pub fn get_artisan_commands(path: String) -> Result<Vec<ArtisanCommand>, String> {
    let project_path = Path::new(&path);
    if !project_path.join("artisan").exists() {
        return Err("Not a Laravel project (artisan not found)".to_string());
    }

    let output = std::process::Command::new("php")
        .arg("artisan")
        .arg("list")
        .arg("--format=json")
        .current_dir(project_path)
        .output()
        .map_err(|e| format!("Failed to execute php artisan: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    let list: ArtisanList = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse artisan list: {}", e))?;

    Ok(list.commands)
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct ProjectInfo {
    #[serde(default)]
    pub project_type: String,
    #[serde(default)]
    pub detected_at: u64,
    #[serde(default)]
    pub saved_queries: Vec<SavedQuery>,
}

const INFO_FILE: &str = ".workshop.json";

#[tauri::command]
pub fn get_saved_queries(path: String) -> Result<Vec<SavedQuery>, String> {
    let info_path = Path::new(&path).join(INFO_FILE);
    if info_path.exists() {
        let content = fs::read_to_string(info_path).map_err(|e| e.to_string())?;
        // Try to parse, if fails return empty list (might be corrupted or old format)
        match serde_json::from_str::<ProjectInfo>(&content) {
            Ok(info) => Ok(info.saved_queries),
            Err(_) => Ok(Vec::new()),
        }
    } else {
        Ok(Vec::new())
    }
}

#[tauri::command]
pub fn save_query(path: String, name: String, sql: String) -> Result<(), String> {
    let project_path = Path::new(&path);
    let info_path = project_path.join(INFO_FILE);
    
    let mut info = if info_path.exists() {
        let content = fs::read_to_string(&info_path).map_err(|e| e.to_string())?;
        serde_json::from_str::<ProjectInfo>(&content).unwrap_or_default()
    } else {
        ProjectInfo::default()
    };

    // Remove if already exists with same name
    info.saved_queries.retain(|q| q.name != name);
    info.saved_queries.push(SavedQuery { name, sql });

    let content = serde_json::to_string_pretty(&info).map_err(|e| e.to_string())?;
    fs::write(info_path, content).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn get_project_info(path: String) -> Result<Option<ProjectInfo>, String> {
    let info_path = Path::new(&path).join(INFO_FILE);
    if info_path.exists() {
        let content = fs::read_to_string(info_path).map_err(|e| e.to_string())?;
        let info: ProjectInfo = serde_json::from_str(&content).map_err(|e| e.to_string())?;
        Ok(Some(info))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub fn detect_and_save_project_info(path: String) -> Result<ProjectInfo, String> {
    let project_path = Path::new(&path);
    
    // Check if it's a Laravel project
    let is_laravel = project_path.join("artisan").exists() && 
                     project_path.join("composer.json").exists();
    
    let project_type = if is_laravel {
        "Laravel".to_string()
    } else {
        "Unknown".to_string()
    };

    let info = ProjectInfo {
        project_type,
        detected_at: SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_secs(),
        saved_queries: Vec::new(),
    };

    let info_path = project_path.join(INFO_FILE);
    let content = serde_json::to_string_pretty(&info).map_err(|e| e.to_string())?;
    fs::write(info_path, content).map_err(|e| e.to_string())?;

    Ok(info)
}

#[tauri::command]
pub fn remove_project_info(path: String) -> Result<(), String> {
    let info_path = Path::new(&path).join(INFO_FILE);
    if info_path.exists() {
        fs::remove_file(info_path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

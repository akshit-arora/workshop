use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::time::SystemTime;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectInfo {
    pub project_type: String,
    pub detected_at: u64,
}

const INFO_FILE: &str = ".workshop.json";

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

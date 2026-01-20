use crate::database::Database;
use crate::utils::get_db_path;
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use tauri::command;

#[derive(serde::Serialize)]
pub struct LangFile {
    path: String,
    name: String,
    r#type: String,
}

#[derive(serde::Serialize)]
pub struct LangLocale {
    locale: String,
    files: Vec<LangFile>,
}

#[derive(serde::Serialize)]
pub struct LangData {
    default_locale: String,
    locales: Vec<LangLocale>,
}

fn get_default_locale(project_path: &Path) -> String {
    let env_path = project_path.join(".env");
    if env_path.exists() {
        if let Ok(content) = fs::read_to_string(&env_path) {
            for line in content.lines() {
                let line = line.trim();
                if line.starts_with("APP_LOCALE=") {
                    let value = line.strip_prefix("APP_LOCALE=").unwrap_or("en");
                    return value.trim_matches('"').trim_matches('\'').to_lowercase();
                }
            }
        }
    }
    "en".to_string()
}

fn collect_lang_files(
    dir: &Path,
    locale_map: &mut HashMap<String, Vec<LangFile>>,
    project_root: &Path,
    base_lang_dir: &Path,
) -> std::io::Result<()> {
    if !dir.is_dir() {
        return Ok(());
    }

    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();

        if path.is_dir() {
            // This directory name is the locale
            let locale = file_name.to_lowercase();
            collect_files_in_locale(&path, locale_map, project_root, &locale)?;
        } else {
            // JSON files at root level (e.g., lang/en.json)
            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
            if ext == "json" {
                let locale = path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("unknown")
                    .to_lowercase();
                let relative_path = path
                    .strip_prefix(project_root)
                    .unwrap_or(&path)
                    .to_string_lossy()
                    .to_string();

                locale_map
                    .entry(locale.clone())
                    .or_default()
                    .push(LangFile {
                        path: relative_path,
                        name: file_name,
                        r#type: ext.to_string(),
                    });
            }
        }
    }
    Ok(())
}

fn collect_files_in_locale(
    dir: &Path,
    locale_map: &mut HashMap<String, Vec<LangFile>>,
    project_root: &Path,
    locale: &str,
) -> std::io::Result<()> {
    if !dir.is_dir() {
        return Ok(());
    }

    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();

        if path.is_dir() {
            collect_files_in_locale(&path, locale_map, project_root, locale)?;
        } else {
            let file_name = entry.file_name().to_string_lossy().to_string();
            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");

            if ext == "php" || ext == "json" {
                let relative_path = path
                    .strip_prefix(project_root)
                    .unwrap_or(&path)
                    .to_string_lossy()
                    .to_string();

                locale_map
                    .entry(locale.to_string())
                    .or_default()
                    .push(LangFile {
                        path: relative_path,
                        name: file_name,
                        r#type: ext.to_string(),
                    });
            }
        }
    }
    Ok(())
}

#[command]
pub fn get_lang_files(id: String) -> Result<LangData, String> {
    let db_path = get_db_path()?;
    let db = Database::new(db_path).map_err(|e| e.to_string())?;
    let project = db
        .get_project_by_id(&id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Project not found".to_string())?;

    let project_path = Path::new(&project.location);
    let lang_path = project_path.join("lang");
    let resources_lang_path = project_path.join("resources/lang");

    let default_locale = get_default_locale(project_path);
    let mut locale_map: HashMap<String, Vec<LangFile>> = HashMap::new();

    if lang_path.exists() {
        let _ = collect_lang_files(&lang_path, &mut locale_map, project_path, &lang_path);
    }

    if resources_lang_path.exists() {
        let _ = collect_lang_files(
            &resources_lang_path,
            &mut locale_map,
            project_path,
            &resources_lang_path,
        );
    }

    let mut locales: Vec<LangLocale> = locale_map
        .into_iter()
        .map(|(locale, files)| LangLocale { locale, files })
        .collect();

    // Sort locales, putting default first
    locales.sort_by(|a, b| {
        if a.locale == default_locale {
            std::cmp::Ordering::Less
        } else if b.locale == default_locale {
            std::cmp::Ordering::Greater
        } else {
            a.locale.cmp(&b.locale)
        }
    });

    Ok(LangData {
        default_locale,
        locales,
    })
}

#[command]
pub fn read_lang_file(id: String, file_path: String) -> Result<String, String> {
    let db_path = get_db_path()?;
    let db = Database::new(db_path).map_err(|e| e.to_string())?;
    let project = db
        .get_project_by_id(&id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Project not found".to_string())?;

    if file_path.contains("..") {
        return Err("Invalid file path".to_string());
    }

    let full_path = Path::new(&project.location).join(&file_path);

    fs::read_to_string(full_path).map_err(|e| e.to_string())
}

#[command]
pub fn save_lang_file(id: String, file_path: String, content: String) -> Result<(), String> {
    let db_path = get_db_path()?;
    let db = Database::new(db_path).map_err(|e| e.to_string())?;
    let project = db
        .get_project_by_id(&id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Project not found".to_string())?;

    if file_path.contains("..") {
        return Err("Invalid file path".to_string());
    }

    let full_path = Path::new(&project.location).join(&file_path);

    fs::write(full_path, content).map_err(|e| e.to_string())
}

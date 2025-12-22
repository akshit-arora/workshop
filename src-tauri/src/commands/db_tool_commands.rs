use crate::database::Database;
use crate::db_factory::{get_db_backend, DbBackend};
use crate::models::db_types::{DbCredentials, TableData};
use crate::utils::get_db_path;
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use tauri::command;

fn connect_database(project_id: &str) -> Result<Box<dyn DbBackend>, String> {
    // Get project location
    let db_path = get_db_path()?;
    let db = Database::new(db_path)
        .map_err(|e| format!("Failed to connect to projects database: {}", e))?;

    let project = match db.get_project_by_id(project_id) {
        Ok(Some(project)) => project,
        Ok(None) => {
            return Err(format!(
                "Project with ID '{}' not found in database",
                project_id
            ))
        }
        Err(e) => return Err(format!("Database error while fetching project: {}", e)),
    };

    let mut creds: Option<DbCredentials> = None;

    // 1. Try .env file first (for Laravel or other dotenv projects)
    let env_path = Path::new(&project.location).join(".env");

    if env_path.exists() {
        if let Ok(env_content) = fs::read_to_string(&env_path) {
            let mut env_vars = HashMap::new();
            for line in env_content.lines() {
                if line.trim().is_empty() || line.starts_with('#') {
                    continue;
                }
                if let Some((key, value)) = line.split_once('=') {
                    // Handle quoted values simply
                    let val = value.trim();
                    let val = if val.starts_with('"') && val.ends_with('"') {
                        &val[1..val.len() - 1]
                    } else {
                        val
                    };
                    env_vars.insert(key.trim().to_string(), val.to_string());
                }
            }

            let get_env =
                |key: &str| -> Option<String> { env_vars.get(key).map(|s| s.to_string()) };

            if let Some(conn) = get_env("DB_CONNECTION") {
                if conn == "mysql" {
                    if let (Some(h), Some(p), Some(d), Some(u), Some(pw)) = (
                        get_env("DB_HOST"),
                        get_env("DB_PORT"),
                        get_env("DB_DATABASE"),
                        get_env("DB_USERNAME"),
                        get_env("DB_PASSWORD"),
                    ) {
                        creds = Some(DbCredentials {
                            connection: "mysql".to_string(),
                            host: Some(h),
                            port: Some(p),
                            database: d,
                            username: Some(u),
                            password: Some(pw),
                        });
                    }
                } else if conn == "sqlite" {
                    // For SQLite, DB_DATABASE usually holds the path
                    // It might be absolute or relative to project root
                    // Usually in Laravel it's "database.sqlite" which means "database/database.sqlite" relative to app,
                    // but in .env it might simply be the filename.
                    // But typically Laravel uses `DB_DATABASE` env var for the path if using sqlite.
                    if let Some(d) = get_env("DB_DATABASE") {
                        creds = Some(DbCredentials {
                            connection: "sqlite".to_string(),
                            host: None,
                            port: None,
                            database: d, // This will be resolved relative to project path in factory
                            username: None,
                            password: None,
                        });
                    }
                }
            }
        }
    }

    // 2. If not found in .env, try project.db_config (internal DB)
    if creds.is_none() {
        if let Some(config_str) = &project.db_config {
            if let Ok(config) = serde_json::from_str::<DbCredentials>(config_str) {
                creds = Some(config);
            }
        }
    }

    // Fallback: Check .workshop/project.json for backward compatibility or migration?
    // The user said "Save that in the application database instead... where we save project related information".
    // I should probably support reading the old one, but for now I'll prioritize the new one.
    // If I want to support migration, I could check the old file here.
    // Let's implement reading the old file if db_config is missing, just in case.
    if creds.is_none() {
        let project_json_path = Path::new(&project.location)
            .join(".workshop")
            .join("project.json");
        if project_json_path.exists() {
            if let Ok(content) = fs::read_to_string(&project_json_path) {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(db_config) = json.get("database") {
                        let connection = db_config["connection"].as_str().unwrap_or("").to_string();
                        if connection == "mysql" {
                            creds = Some(DbCredentials {
                                connection,
                                host: db_config["host"].as_str().map(|s| s.to_string()),
                                port: db_config["port"].as_str().map(|s| s.to_string()),
                                database: db_config["database"].as_str().unwrap_or("").to_string(),
                                username: db_config["username"].as_str().map(|s| s.to_string()),
                                password: db_config["password"].as_str().map(|s| s.to_string()),
                            });
                        }
                    }
                }
            }
        }
    }

    if let Some(c) = creds {
        return get_db_backend(&c, &project.location);
    }

    Err("Database configuration not found. Please ensure either a .env file with DB credentials exists or configure the database settings.".to_string())
}

#[command(rename_all = "camelCase")]
pub fn save_db_credentials(project_id: String, credentials: DbCredentials) -> Result<(), String> {
    // Get project location
    let db_path = get_db_path()?;
    let db = Database::new(db_path)
        .map_err(|e| format!("Failed to connect to projects database: {}", e))?;

    let mut project = match db.get_project_by_id(&project_id) {
        Ok(Some(project)) => project,
        Ok(None) => return Err(format!("Project with ID '{}' not found", project_id)),
        Err(e) => return Err(format!("Database error: {}", e)),
    };

    // Serialize credentials to JSON
    let config_str = serde_json::to_string(&credentials)
        .map_err(|e| format!("Failed to serialize credentials: {}", e))?;

    project.db_config = Some(config_str);

    db.update_project(&project.id, &project)
        .map_err(|e| format!("Failed to update project: {}", e))?;

    Ok(())
}

#[command]
pub fn get_project_tables(project_id: String) -> Result<Vec<String>, String> {
    let mut backend = connect_database(&project_id)?;
    backend.get_tables()
}

#[command]
pub fn get_table_data(
    project_id: String,
    table_name: String,
    page: u32,
    per_page: u32,
    where_clause: Option<String>,
) -> Result<TableData, String> {
    let mut backend = connect_database(&project_id)?;
    backend.get_table_data(&table_name, page, per_page, where_clause)
}

#[command(rename_all = "camelCase")]
pub fn execute_query(project_id: String, query: String) -> Result<TableData, String> {
    let mut backend = connect_database(&project_id)?;
    backend.execute_query(&query)
}

#[command(rename_all = "camelCase")]
pub fn delete_row(
    project_id: String,
    table_name: String,
    pk_column: String,
    pk_value: String,
) -> Result<u64, String> {
    let mut backend = connect_database(&project_id)?;
    backend.delete_row(&table_name, &pk_column, &pk_value)
}

#[command(rename_all = "camelCase")]
pub fn update_row(
    project_id: String,
    table_name: String,
    pk_column: String,
    pk_value: String,
    data: HashMap<String, Option<String>>,
) -> Result<u64, String> {
    let mut backend = connect_database(&project_id)?;
    backend.update_row(&table_name, &pk_column, &pk_value, data)
}

#[command(rename_all = "camelCase")]
pub fn get_db_connection_type(project_id: String) -> Result<String, String> {
    // Get project location
    let db_path = get_db_path()?;
    let db = Database::new(db_path)
        .map_err(|e| format!("Failed to connect to projects database: {}", e))?;

    let project = match db.get_project_by_id(&project_id) {
        Ok(Some(project)) => project,
        Ok(None) => {
            return Err(format!(
                "Project with ID '{}' not found in database",
                project_id
            ))
        }
        Err(e) => return Err(format!("Database error while fetching project: {}", e)),
    };

    // 1. Try .env file first (for Laravel or other dotenv projects)
    let env_path = Path::new(&project.location).join(".env");

    if env_path.exists() {
        if let Ok(env_content) = fs::read_to_string(&env_path) {
            let mut env_vars = HashMap::new();
            for line in env_content.lines() {
                if line.trim().is_empty() || line.starts_with('#') {
                    continue;
                }
                if let Some((key, value)) = line.split_once('=') {
                    let val = value.trim();
                    let val = if val.starts_with('"') && val.ends_with('"') {
                        &val[1..val.len() - 1]
                    } else {
                        val
                    };
                    env_vars.insert(key.trim().to_string(), val.to_string());
                }
            }

            if let Some(conn) = env_vars.get("DB_CONNECTION") {
                return Ok(conn.clone());
            }
        }
    }

    // 2. If not found in .env, try project.db_config (internal DB)
    if let Some(config_str) = &project.db_config {
        if let Ok(config) = serde_json::from_str::<DbCredentials>(config_str) {
            return Ok(config.connection);
        }
    }

    // 3. Fallback: Check .workshop/project.json
    let project_json_path = Path::new(&project.location)
        .join(".workshop")
        .join("project.json");
    if project_json_path.exists() {
        if let Ok(content) = fs::read_to_string(&project_json_path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(db_config) = json.get("database") {
                    if let Some(connection) = db_config["connection"].as_str() {
                        return Ok(connection.to_string());
                    }
                }
            }
        }
    }

    Err("Database configuration not found".to_string())
}

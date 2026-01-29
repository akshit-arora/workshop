use crate::database::Database;
use crate::db_factory::{get_db_backend, DbBackend};
use crate::models::db_types::{DbCredentials, TableData};
use crate::state::DbConnectionManager;
use crate::utils::get_db_path;
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use tauri::{command, State};

fn create_db_backend(project_id: &str) -> Result<Box<dyn DbBackend + Send>, String> {
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
                    if let Some(d) = get_env("DB_DATABASE") {
                        creds = Some(DbCredentials {
                            connection: "sqlite".to_string(),
                            host: None,
                            port: None,
                            database: d,
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

    // Fallback: Check .workshop/project.json
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
        // Here we ensure the backend is Send (impl DbBackend + Send)
        // But get_db_backend returns Box<dyn DbBackend>. We need to cast or rely on coherence?
        // Let's modify get_db_backend signature in db_factory?
        // Or assume it returns Send?
        // db_factory::get_db_backend returns Result<Box<dyn DbBackend>, String>
        // Use a cast or wrapper? Box<dyn DbBackend> is not necessarily Box<dyn DbBackend + Send>.
        // I need to change db_factory logic or return type.
        // Actually, I'll update db_factory to return Box<dyn DbBackend + Send>.
        return get_db_backend(&c, &project.location);
    }

    Err("Database configuration not found.".to_string())
}

fn with_db_backend<F, R>(
    state: &State<DbConnectionManager>,
    project_id: &str,
    f: F,
) -> Result<R, String>
where
    F: FnOnce(&mut Box<dyn DbBackend + Send>) -> Result<R, String>,
{
    let mut connections = state.connections.lock().map_err(|e| e.to_string())?;

    if !connections.contains_key(project_id) {
        let backend = create_db_backend(project_id)?;
        connections.insert(project_id.to_string(), backend);
    }

    let backend = connections
        .get_mut(project_id)
        .ok_or("Failed to retrieve connection")?;
    f(backend)
}

#[command(rename_all = "camelCase")]
pub fn save_db_credentials(
    state: State<DbConnectionManager>,
    project_id: String,
    credentials: DbCredentials,
) -> Result<(), String> {
    // Invalidate existing connection
    {
        let mut connections = state.connections.lock().map_err(|e| e.to_string())?;
        connections.remove(&project_id);
    }

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
pub fn get_project_tables(
    state: State<DbConnectionManager>,
    project_id: String,
) -> Result<Vec<String>, String> {
    with_db_backend(&state, &project_id, |backend| backend.get_tables())
}

#[command]
pub fn get_table_data(
    state: State<DbConnectionManager>,
    project_id: String,
    table_name: String,
    page: u32,
    per_page: u32,
    where_clause: Option<String>,
    sort_column: Option<String>,
    sort_direction: Option<String>,
) -> Result<TableData, String> {
    with_db_backend(&state, &project_id, |backend| {
        backend.get_table_data(
            &table_name,
            page,
            per_page,
            where_clause,
            sort_column,
            sort_direction,
        )
    })
}

#[command]
pub fn get_table_total_count(
    state: State<DbConnectionManager>,
    project_id: String,
    table_name: String,
    where_clause: Option<String>,
) -> Result<u64, String> {
    with_db_backend(&state, &project_id, |backend| {
        backend.get_total_rows(&table_name, where_clause)
    })
}

#[command(rename_all = "camelCase")]
pub fn execute_query(
    state: State<DbConnectionManager>,
    project_id: String,
    query: String,
) -> Result<TableData, String> {
    with_db_backend(&state, &project_id, |backend| backend.execute_query(&query))
}

#[command(rename_all = "camelCase")]
pub fn delete_row(
    state: State<DbConnectionManager>,
    project_id: String,
    table_name: String,
    pk_column: String,
    pk_value: String,
) -> Result<u64, String> {
    with_db_backend(&state, &project_id, |backend| {
        backend.delete_row(&table_name, &pk_column, &pk_value)
    })
}

#[command(rename_all = "camelCase")]
pub fn update_row(
    state: State<DbConnectionManager>,
    project_id: String,
    table_name: String,
    pk_column: String,
    pk_value: String,
    data: HashMap<String, Option<String>>,
) -> Result<u64, String> {
    with_db_backend(&state, &project_id, |backend| {
        backend.update_row(&table_name, &pk_column, &pk_value, data)
    })
}

#[command(rename_all = "camelCase")]
pub fn get_db_connection_type(project_id: String) -> Result<String, String> {
    // Implementation remains mostly same, just reading config
    // ... Copy existing implementation ...
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

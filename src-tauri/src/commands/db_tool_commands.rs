use mysql::prelude::*;
use mysql::*;
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use tauri::command;

use crate::database::Database;

fn convert_mysql_value(value: &mysql::Value) -> String {
    match value {
        mysql::Value::NULL => "NULL".to_string(),
        mysql::Value::Bytes(bytes) => String::from_utf8_lossy(bytes).to_string(),
        mysql::Value::Int(n) => n.to_string(),
        mysql::Value::UInt(n) => n.to_string(),
        mysql::Value::Float(n) => n.to_string(),
        mysql::Value::Double(n) => n.to_string(),
        mysql::Value::Date(y, m, d, h, i, s, _) => {
            format!("{:04}-{:02}-{:02} {:02}:{:02}:{:02}", y, m, d, h, i, s)
        }
        mysql::Value::Time(neg, d, h, i, s, _) => {
            let sign = if *neg { "-" } else { "" };
            format!("{}{}.{:02}:{:02}:{:02}", sign, d, h, i, s)
        }
    }
}

#[derive(Serialize)]
pub struct TableData {
    total: u32,
    columns: Vec<String>,
    rows: Vec<HashMap<String, String>>,
}

#[derive(serde::Deserialize)]
pub struct DbCredentials {
    host: String,
    port: String,
    database: String,
    username: String,
    password: String,
}

fn connect_database(project_id: &str) -> Result<Pool, String> {
    // Get project location
    let db = Database::new("projects.db")
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

    let mut host = String::new();
    let mut port = String::new();
    let mut database = String::new();
    let mut username = String::new();
    let mut password = String::new();

    // 1. Try .env file first (for Laravel or other dotenv projects)
    let env_path = Path::new(&project.location).join(".env");
    let mut env_found = false;

    if env_path.exists() {
        if let Ok(env_content) = fs::read_to_string(&env_path) {
            let mut env_vars = HashMap::new();
            for line in env_content.lines() {
                if line.trim().is_empty() || line.starts_with('#') {
                    continue;
                }
                if let Some((key, value)) = line.split_once('=') {
                    env_vars.insert(key.trim().to_string(), value.trim().to_string());
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
                        host = h;
                        port = p;
                        database = d;
                        username = u;
                        password = pw;
                        env_found = true;
                    }
                }
            }
        }
    }

    // 2. If not found in .env, try .workshop/project.json
    if !env_found {
        let project_json_path = Path::new(&project.location)
            .join(".workshop")
            .join("project.json");
        if project_json_path.exists() {
            if let Ok(content) = fs::read_to_string(&project_json_path) {
                if let Ok(json) = serde_json::from_str::<Value>(&content) {
                    if let Some(db_config) = json.get("database") {
                        if db_config["connection"].as_str().unwrap_or("") == "mysql" {
                            host = db_config["host"].as_str().unwrap_or("").to_string();
                            port = db_config["port"].as_str().unwrap_or("").to_string();
                            database = db_config["database"].as_str().unwrap_or("").to_string();
                            username = db_config["username"].as_str().unwrap_or("").to_string();
                            password = db_config["password"].as_str().unwrap_or("").to_string();

                            if !host.is_empty() && !database.is_empty() && !username.is_empty() {
                                env_found = true;
                            }
                        }
                    }
                }
            }
        }
    }

    if !env_found {
        return Err("Database configuration not found. Please ensure either a .env file with DB credentials exists or configure the database settings.".to_string());
    }

    // Build connection using OptsBuilder
    let opts = mysql::OptsBuilder::new()
        .ip_or_hostname(Some(host))
        .tcp_port(
            port.parse()
                .map_err(|e| format!("Invalid port number: {}", e))?,
        )
        .db_name(Some(database))
        .user(Some(username))
        .pass(Some(password));

    // Try to establish connection
    let pool = Pool::new(opts).map_err(|e| format!("Failed to connect to database: {}", e))?;

    Ok(pool)
}

#[command(rename_all = "camelCase")]
pub fn save_db_credentials(project_id: String, credentials: DbCredentials) -> Result<(), String> {
    // Get project location
    let db = Database::new("projects.db")
        .map_err(|e| format!("Failed to connect to projects database: {}", e))?;

    let project = match db.get_project_by_id(&project_id) {
        Ok(Some(project)) => project,
        Ok(None) => return Err(format!("Project with ID '{}' not found", project_id)),
        Err(e) => return Err(format!("Database error: {}", e)),
    };

    let workshop_dir = Path::new(&project.location).join(".workshop");
    if !workshop_dir.exists() {
        fs::create_dir(&workshop_dir)
            .map_err(|e| format!("Failed to create .workshop directory: {}", e))?;
    }

    let project_json_path = workshop_dir.join("project.json");

    let mut current_config = if project_json_path.exists() {
        let content = fs::read_to_string(&project_json_path)
            .map_err(|e| format!("Failed to read project.json: {}", e))?;
        serde_json::from_str(&content).unwrap_or(json!({}))
    } else {
        json!({})
    };

    let db_config = json!({
        "connection": "mysql",
        "host": credentials.host,
        "port": credentials.port,
        "database": credentials.database,
        "username": credentials.username,
        "password": credentials.password,
    });

    current_config["database"] = db_config;

    fs::write(
        &project_json_path,
        serde_json::to_string_pretty(&current_config).unwrap(),
    )
    .map_err(|e| format!("Failed to write project.json: {}", e))?;

    Ok(())
}

#[command]
pub fn get_project_tables(project_id: String) -> Result<Vec<String>, String> {
    let pool = connect_database(&project_id)?;
    let mut conn = pool
        .get_conn()
        .map_err(|e| format!("Failed to get database connection: {}", e))?;

    // Query to get all tables
    let tables: Vec<String> = conn
        .query_map("SHOW TABLES", |table_name: String| table_name)
        .map_err(|e| format!("Failed to query tables: {}", e))?;

    Ok(tables)
}

#[command]
pub fn get_table_data(
    project_id: String,
    table_name: String,
    page: u32,
    mut per_page: u32,
    where_clause: Option<String>,
) -> Result<TableData, String> {
    let pool = connect_database(&project_id)?;
    let mut conn = pool
        .get_conn()
        .map_err(|e| format!("Failed to get database connection: {}", e))?;

    let mut where_clause_for_select = String::new();
    let mut where_clause_for_count = String::new();
    let mut has_limit_in_where = false;

    if let Some(clause) = where_clause {
        if !clause.trim().is_empty() {
            let upper_clause = clause.to_uppercase();
            if let Some(index) = upper_clause.rfind("LIMIT") {
                where_clause_for_count = format!(" WHERE {}", &clause[..index].trim());
                where_clause_for_select = format!(" WHERE {}", clause);
                has_limit_in_where = true;

                let limit_part = &clause[index + 5..].trim();
                if let Some(limit_str) = limit_part.split_whitespace().next() {
                    if let Ok(limit_val) = limit_str.parse::<u32>() {
                        per_page = limit_val;
                    }
                }
            } else {
                where_clause_for_select = format!(" WHERE {}", clause);
                where_clause_for_count = where_clause_for_select.clone();
            }
        }
    }

    // Calculate offset
    let offset = (page - 1) * per_page;

    // Get total count
    let count: u32 = conn
        .query_first(format!(
            "SELECT COUNT(*) as count FROM {}{}",
            table_name, where_clause_for_count
        ))
        .map_err(|e| format!("Failed to get total count: {}", e))?
        .unwrap_or(0);

    // Get paginated data
    let query = if has_limit_in_where {
        // If limit is in where clause, we assume it also contains the offset
        format!("SELECT * FROM {}{}", table_name, where_clause_for_select)
    } else {
        format!(
            "SELECT * FROM {}{} LIMIT {} OFFSET {}",
            table_name, where_clause_for_select, per_page, offset
        )
    };
    let rows: Vec<mysql::Row> = conn
        .query(query)
        .map_err(|e| format!("Failed to query table data: {}", e))?;

    // Convert rows to Vec<HashMap<String, String>>
    let mut data = Vec::new();
    let mut columns = Vec::new();

    if let Some(first_row) = rows.first() {
        columns = first_row
            .columns()
            .iter()
            .map(|col| col.name_str().to_string())
            .collect();
    }

    for row in rows {
        let mut row_data = HashMap::new();
        for (i, column) in columns.iter().enumerate() {
            let value = convert_mysql_value(&row[i]);
            row_data.insert(column.clone(), value);
        }
        data.push(row_data);
    }

    Ok(TableData {
        total: count,
        columns,
        rows: data,
    })
}

#[command(rename_all = "camelCase")]
pub fn execute_query(project_id: String, query: String) -> Result<TableData, String> {
    let pool = connect_database(&project_id)?;
    let mut conn = pool
        .get_conn()
        .map_err(|e| format!("Failed to get database connection: {}", e))?;

    // Execute the custom query
    let rows: Vec<mysql::Row> = conn
        .query(&query)
        .map_err(|e| format!("Failed to execute query: {}", e))?;

    // Convert rows to Vec<HashMap<String, String>>
    let mut data = Vec::new();
    let mut columns = Vec::new();

    if let Some(first_row) = rows.first() {
        columns = first_row
            .columns()
            .iter()
            .map(|col| col.name_str().to_string())
            .collect();
    }

    for row in rows {
        let mut row_data = HashMap::new();
        for (i, column) in columns.iter().enumerate() {
            let value = convert_mysql_value(&row[i]);
            row_data.insert(column.clone(), value);
        }
        data.push(row_data);
    }

    Ok(TableData {
        total: data.len() as u32,
        columns,
        rows: data,
    })
}

#[command(rename_all = "camelCase")]
pub fn delete_row(
    project_id: String,
    table_name: String,
    pk_column: String,
    pk_value: String,
) -> Result<u64, String> {
    let pool = connect_database(&project_id)?;
    let mut conn = pool
        .get_conn()
        .map_err(|e| format!("Failed to get database connection: {}", e))?;

    // Build a parameterized delete statement. Note: table and column names
    // are identifiers and cannot be parameterized; we validate simple cases
    // by allowing only alphanumeric and underscore characters to reduce risk.
    let is_valid_ident = |s: &str| s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_');
    if !is_valid_ident(&table_name) || !is_valid_ident(&pk_column) {
        return Err("Invalid table or column name".to_string());
    }

    let stmt = format!(
        "DELETE FROM `{}` WHERE `{}` = :value",
        table_name, pk_column
    );

    // Use named parameter to safely pass the value
    conn.exec_drop(stmt, params! {"value" => pk_value.clone()})
        .map_err(|e| format!("Failed to execute delete: {}", e))?;

    // affected_rows returns u64
    let affected = conn.affected_rows();

    Ok(affected)
}

#[command(rename_all = "camelCase")]
pub fn update_row(
    project_id: String,
    table_name: String,
    pk_column: String,
    pk_value: String,
    data: HashMap<String, String>,
) -> Result<u64, String> {
    let pool = connect_database(&project_id)?;
    let mut conn = pool
        .get_conn()
        .map_err(|e| format!("Failed to get database connection: {}", e))?;

    let is_valid_ident = |s: &str| s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_');
    if !is_valid_ident(&table_name) || !is_valid_ident(&pk_column) {
        return Err("Invalid table or column name".to_string());
    }

    let mut update_data = data.clone();
    update_data.remove(&pk_column);

    if update_data.is_empty() {
        return Ok(0);
    }

    let mut sets = Vec::new();
    let mut params: Vec<String> = Vec::new();

    for (key, value) in &update_data {
        if !is_valid_ident(key) {
            return Err(format!("Invalid column name: {}", key));
        }
        sets.push(format!("`{}` = ?", key));
        params.push(value.clone());
    }

    params.push(pk_value);

    let query = format!(
        "UPDATE `{}` SET {} WHERE `{}` = ?",
        table_name,
        sets.join(", "),
        pk_column
    );

    conn.exec_drop(query, params)
        .map_err(|e| format!("Failed to execute update: {}", e))?;

    Ok(conn.affected_rows())
}

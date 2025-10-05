use tauri::command;
use mysql::*;
use mysql::prelude::*;
use std::fs;
use std::collections::HashMap;
use serde::Serialize;

use crate::commands::project_commands::get_project_config;
use crate::database::Database;

fn convert_mysql_value(value: &mysql::Value) -> String {
    match value {
        mysql::Value::NULL => "NULL".to_string(),
        mysql::Value::Bytes(bytes) => String::from_utf8_lossy(bytes).to_string(),
        mysql::Value::Int(n) => n.to_string(),
        mysql::Value::UInt(n) => n.to_string(),
        mysql::Value::Float(n) => n.to_string(),
        mysql::Value::Double(n) => n.to_string(),
        mysql::Value::Date(y, m, d, h, i, s, _) =>
            format!("{:04}-{:02}-{:02} {:02}:{:02}:{:02}", y, m, d, h, i, s),
        mysql::Value::Time(neg, d, h, i, s, _) => {
            let sign = if *neg { "-" } else { "" };
            format!("{}{}.{:02}:{:02}:{:02}", sign, d, h, i, s)
        },
        _ => "NULL".to_string(),
    }
}

#[derive(Serialize)]
pub struct TableData {
    total: u32,
    columns: Vec<String>,
    rows: Vec<HashMap<String, String>>,
}

fn connect_database(project_id: &str) -> Result<Pool, String> {
    // First, get the project type
    let project_type = get_project_config(project_id.to_string(), "project_type".to_string())
        .map_err(|e| format!("Failed to get project type: {}", e))?
        .ok_or_else(|| "Project type not found".to_string())?;

    if project_type != "Laravel" {
        return Err("Only Laravel projects are supported currently".to_string());
    }

    // Get project location
    let db = Database::new("projects.db")
        .map_err(|e| format!("Failed to connect to projects database: {}", e))?;

    let project = match db.get_project_by_id(project_id) {
        Ok(Some(project)) => project,
        Ok(None) => return Err(format!("Project with ID '{}' not found in database", project_id)),
        Err(e) => return Err(format!("Database error while fetching project: {}", e)),
    };

    // Check if .env file exists
    let env_path = format!("{}/.env", project.location);
    if !std::path::Path::new(&env_path).exists() {
        return Err("No .env file found in project directory".to_string());
    }

    // Read and parse .env file
    let env_content = fs::read_to_string(&env_path)
        .map_err(|e| format!("Failed to read .env file: {}", e))?;

    let mut env_vars = HashMap::new();
    for line in env_content.lines() {
        if line.trim().is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some((key, value)) = line.split_once('=') {
            env_vars.insert(key.trim().to_string(), value.trim().to_string());
        }
    }

    // Extract database configuration
    let get_env = |key: &str| -> Result<String, String> {
        env_vars.get(key)
            .ok_or_else(|| format!("{} not found in .env", key))
            .map(|s| s.to_string())
    };

    let connection = get_env("DB_CONNECTION")?;
    if connection != "mysql" {
        return Err("Only MySQL connections are supported currently".to_string());
    }

    let host = get_env("DB_HOST")?;
    let port = get_env("DB_PORT")?;
    let database = get_env("DB_DATABASE")?;
    let username = get_env("DB_USERNAME")?;
    let password = get_env("DB_PASSWORD")?;

    // Build connection using OptsBuilder
    let opts = mysql::OptsBuilder::new()
        .ip_or_hostname(Some(host))
        .tcp_port(port.parse().map_err(|e| format!("Invalid port number: {}", e))?)
        .db_name(Some(database))
        .user(Some(username))
        .pass(Some(password));

    // Try to establish connection
    let pool = Pool::new(opts)
        .map_err(|e| format!("Failed to connect to database: {}", e))?;

    Ok(pool)
}

#[command]
pub fn get_project_tables(project_id: String) -> Result<Vec<String>, String> {
    let pool = connect_database(&project_id)?;
    let mut conn = pool.get_conn()
        .map_err(|e| format!("Failed to get database connection: {}", e))?;

    // Query to get all tables
    let tables: Vec<String> = conn.query_map(
        "SHOW TABLES",
        |table_name: String| table_name
    ).map_err(|e| format!("Failed to query tables: {}", e))?;

    Ok(tables)
}

#[command]
pub fn get_table_data(project_id: String, table_name: String, page: u32, per_page: u32) -> Result<TableData, String> {
    let pool = connect_database(&project_id)?;
    let mut conn = pool.get_conn()
        .map_err(|e| format!("Failed to get database connection: {}", e))?;

    // Calculate offset
    let offset = (page - 1) * per_page;

    // Get total count
    let count: u32 = conn.query_first(
        format!("SELECT COUNT(*) as count FROM {}", table_name)
    ).map_err(|e| format!("Failed to get total count: {}", e))?
    .unwrap_or(0);

    // Get paginated data
    let rows: Vec<mysql::Row> = conn.query(
        format!("SELECT * FROM {} LIMIT {} OFFSET {}", table_name, per_page, offset)
    ).map_err(|e| format!("Failed to query table data: {}", e))?;

    // Convert rows to Vec<HashMap<String, String>>
    let mut data = Vec::new();
    let mut columns = Vec::new();

    if let Some(first_row) = rows.first() {
        columns = first_row.columns().iter()
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
    let mut conn = pool.get_conn()
        .map_err(|e| format!("Failed to get database connection: {}", e))?;

    // Execute the custom query
    let rows: Vec<mysql::Row> = conn.query(&query)
        .map_err(|e| format!("Failed to execute query: {}", e))?;

    // Convert rows to Vec<HashMap<String, String>>
    let mut data = Vec::new();
    let mut columns = Vec::new();

    if let Some(first_row) = rows.first() {
        columns = first_row.columns().iter()
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

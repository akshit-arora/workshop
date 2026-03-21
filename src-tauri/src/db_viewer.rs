use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use sqlx::{Row, Column, MySqlPool, SqlitePool, mysql::MySqlPoolOptions, sqlite::SqlitePoolOptions};
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DbConfig {
    pub connection: String,
    pub host: Option<String>,
    pub port: Option<String>,
    pub database: String,
    pub username: Option<String>,
    pub password: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<serde_json::Value>,
    pub total_count: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ColumnSchema {
    pub name: String,
    pub data_type: String,
    pub is_nullable: bool,
    pub is_primary_key: bool,
}

#[derive(Clone)]
pub enum DbPool {
    MySql(MySqlPool),
    Sqlite(SqlitePool),
}

pub struct ActiveSession {
    pub pool: DbPool,
    pub last_activity: Instant,
    pub config: DbConfig,
}

pub struct DbState {
    pub sessions: Arc<Mutex<HashMap<String, ActiveSession>>>,
}

impl Default for DbState {
    fn default() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

fn parse_env_file(path: &Path) -> HashMap<String, String> {
    let mut env = HashMap::new();
    if let Ok(content) = fs::read_to_string(path) {
        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            if let Some((key, value)) = line.split_once('=') {
                let key = key.trim();
                let value = value.trim().trim_matches('"').trim_matches('\'');
                env.insert(key.to_string(), value.to_string());
            }
        }
    }
    env
}

#[tauri::command]
pub async fn get_laravel_db_config(project_path: String) -> Result<DbConfig, String> {
    let env_path = Path::new(&project_path).join(".env");
    if !env_path.exists() {
        return Err("No .env file found in Laravel project".to_string());
    }

    let env = parse_env_file(&env_path);
    
    let connection = env.get("DB_CONNECTION").cloned().unwrap_or_else(|| "mysql".to_string());
    let database = env.get("DB_DATABASE").cloned().ok_or_else(|| "DB_DATABASE not defined in .env".to_string())?;

    Ok(DbConfig {
        connection,
        host: env.get("DB_HOST").cloned(),
        port: env.get("DB_PORT").cloned(),
        database,
        username: env.get("DB_USERNAME").cloned(),
        password: env.get("DB_PASSWORD").cloned(),
    })
}

async fn create_pool(config: &DbConfig, project_path: &str) -> Result<DbPool, String> {
    match config.connection.as_str() {
        "sqlite" => {
            let db_path = if Path::new(&config.database).is_absolute() {
                config.database.clone()
            } else {
                Path::new(project_path).join(&config.database).to_string_lossy().to_string()
            };
            let url = format!("sqlite://{}", db_path);
            let pool = SqlitePoolOptions::new()
                .max_connections(5)
                .connect(&url)
                .await
                .map_err(|e| e.to_string())?;
            Ok(DbPool::Sqlite(pool))
        }
        "mysql" => {
            let host = config.host.as_deref().unwrap_or("127.0.0.1");
            let port = config.port.as_deref().unwrap_or("3306");
            let user = config.username.as_deref().unwrap_or("root");
            let pass = config.password.as_deref().unwrap_or("");
            let url = format!("mysql://{}:{}@{}:{}/{}", user, pass, host, port, config.database);
            let pool = MySqlPoolOptions::new()
                .max_connections(5)
                .connect(&url)
                .await
                .map_err(|e| e.to_string())?;
            Ok(DbPool::MySql(pool))
        }
        _ => Err(format!("Unsupported database connection: {}", config.connection)),
    }
}

async fn get_or_create_pool(
    state: &DbState,
    config: &DbConfig,
    project_path: &str,
) -> Result<DbPool, String> {
    // 1. Try to get existing pool
    {
        let mut sessions = state.sessions.lock().unwrap();
        if let Some(active) = sessions.get_mut(project_path) {
            if active.config.connection == config.connection && active.config.database == config.database {
                active.last_activity = Instant::now();
                return Ok(active.pool.clone());
            }
        }
    } // lock dropped here

    // 2. Create new pool (no lock held)
    let pool = create_pool(config, project_path).await?;
    
    // 3. Insert new pool
    {
        let mut sessions = state.sessions.lock().unwrap();
        sessions.insert(project_path.to_string(), ActiveSession {
            pool: pool.clone(),
            last_activity: Instant::now(),
            config: config.clone(),
        });
    }
    
    Ok(pool)
}

#[tauri::command]
pub async fn cleanup_expired_sessions(
    state: State<'_, DbState>,
    keep_alive_minutes: u64,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    let now = Instant::now();
    let timeout = Duration::from_secs(keep_alive_minutes * 60);
    
    sessions.retain(|_, session| {
        now.duration_since(session.last_activity) < timeout
    });
    
    Ok(())
}

#[tauri::command]
pub async fn list_tables(
    state: State<'_, DbState>,
    config: DbConfig, 
    project_path: String
) -> Result<Vec<String>, String> {
    let pool = get_or_create_pool(&state, &config, &project_path).await?;

    match pool {
        DbPool::Sqlite(p) => {
            let rows = sqlx::query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")
                .fetch_all(&p)
                .await
                .map_err(|e| e.to_string())?;
            Ok(rows.iter().map(|row| row.get::<String, _>(0)).collect())
        }
        DbPool::MySql(p) => {
            let rows = sqlx::query("SHOW TABLES;")
                .fetch_all(&p)
                .await
                .map_err(|e| e.to_string())?;
            Ok(rows.iter().map(|row| row.get::<String, _>(0)).collect())
        }
    }
}

#[tauri::command]
pub async fn get_table_schema(
    state: State<'_, DbState>,
    config: DbConfig, 
    project_path: String, 
    table: String
) -> Result<Vec<ColumnSchema>, String> {
    let pool = get_or_create_pool(&state, &config, &project_path).await?;

    match pool {
        DbPool::Sqlite(p) => {
            let rows = sqlx::query(&format!("PRAGMA table_info(`{}`)", table))
                .fetch_all(&p)
                .await
                .map_err(|e| e.to_string())?;
            
            Ok(rows.iter().map(|row| ColumnSchema {
                name: row.get::<String, _>("name"),
                data_type: row.get::<String, _>("type"),
                is_nullable: row.get::<i32, _>("notnull") == 0,
                is_primary_key: row.get::<i32, _>("pk") > 0,
            }).collect())
        }
        DbPool::MySql(p) => {
            let rows = sqlx::query(&format!("DESCRIBE `{}`", table))
                .fetch_all(&p)
                .await
                .map_err(|e| e.to_string())?;
            
            Ok(rows.iter().map(|row| ColumnSchema {
                name: row.get::<String, _>("Field"),
                data_type: row.get::<String, _>("Type"),
                is_nullable: row.get::<String, _>("Null") == "YES",
                is_primary_key: row.get::<String, _>("Key") == "PRI",
            }).collect())
        }
    }
}

use chrono::{DateTime, Utc, NaiveDateTime, NaiveDate, NaiveTime};

fn sqlite_row_to_json(row: &sqlx::sqlite::SqliteRow) -> serde_json::Value {
    let mut map = serde_json::Map::new();
    for col in row.columns() {
        let name = col.name();
        let idx = col.ordinal();
        
        let value = if let Ok(v) = row.try_get::<String, usize>(idx) {
            serde_json::Value::String(v)
        } else if let Ok(v) = row.try_get::<i64, usize>(idx) {
            serde_json::Value::Number(v.into())
        } else if let Ok(v) = row.try_get::<f64, usize>(idx) {
            serde_json::Number::from_f64(v).map(serde_json::Value::Number).unwrap_or(serde_json::Value::Null)
        } else if let Ok(v) = row.try_get::<bool, usize>(idx) {
            serde_json::Value::Bool(v)
        } else if let Ok(v) = row.try_get::<i32, usize>(idx) {
            serde_json::Value::Number(v.into())
        } else if let Ok(v) = row.try_get::<NaiveDateTime, usize>(idx) {
            serde_json::Value::String(v.format("%Y-%m-%d %H:%M:%S").to_string())
        } else if let Ok(v) = row.try_get::<DateTime<Utc>, usize>(idx) {
            serde_json::Value::String(v.to_rfc3339())
        } else if let Ok(v) = row.try_get::<NaiveDate, usize>(idx) {
            serde_json::Value::String(v.to_string())
        } else if let Ok(v) = row.try_get::<NaiveTime, usize>(idx) {
            serde_json::Value::String(v.to_string())
        } else {
            serde_json::Value::Null
        };
        
        map.insert(name.to_string(), value);
    }
    serde_json::Value::Object(map)
}

fn mysql_row_to_json(row: &sqlx::mysql::MySqlRow) -> serde_json::Value {
    let mut map = serde_json::Map::new();
    for col in row.columns() {
        let name = col.name();
        let idx = col.ordinal();
        
        let value = if let Ok(v) = row.try_get::<String, usize>(idx) {
            serde_json::Value::String(v)
        } else if let Ok(v) = row.try_get::<i64, usize>(idx) {
            serde_json::Value::Number(v.into())
        } else if let Ok(v) = row.try_get::<u64, usize>(idx) {
            serde_json::Value::Number(v.into())
        } else if let Ok(v) = row.try_get::<i32, usize>(idx) {
            serde_json::Value::Number(v.into())
        } else if let Ok(v) = row.try_get::<u32, usize>(idx) {
            serde_json::Value::Number(v.into())
        } else if let Ok(v) = row.try_get::<i8, usize>(idx) {
            serde_json::Value::Number(v.into())
        } else if let Ok(v) = row.try_get::<bool, usize>(idx) {
            serde_json::Value::Bool(v)
        } else if let Ok(v) = row.try_get::<f64, usize>(idx) {
            serde_json::Number::from_f64(v).map(serde_json::Value::Number).unwrap_or(serde_json::Value::Null)
        } else if let Ok(v) = row.try_get::<NaiveDateTime, usize>(idx) {
            serde_json::Value::String(v.format("%Y-%m-%d %H:%M:%S").to_string())
        } else if let Ok(v) = row.try_get::<DateTime<Utc>, usize>(idx) {
            serde_json::Value::String(v.to_rfc3339())
        } else if let Ok(v) = row.try_get::<NaiveDate, usize>(idx) {
            serde_json::Value::String(v.to_string())
        } else if let Ok(v) = row.try_get::<NaiveTime, usize>(idx) {
            serde_json::Value::String(v.to_string())
        } else {
            serde_json::Value::Null
        };
        
        map.insert(name.to_string(), value);
    }
    serde_json::Value::Object(map)
}

#[tauri::command]
pub async fn get_table_data(
    state: State<'_, DbState>,
    config: DbConfig, 
    project_path: String, 
    table: String, 
    page: u32, 
    per_page: u32,
    sort_col: Option<String>,
    sort_dir: Option<String>,
    where_clause: Option<String>,
) -> Result<QueryResult, String> {
    let pool = get_or_create_pool(&state, &config, &project_path).await?;
    let offset = (page - 1) * per_page;

    let mut where_str = "".to_string();
    if let Some(w) = where_clause {
        if !w.trim().is_empty() {
            where_str = format!("WHERE {}", w);
        }
    }

    let order_by = match (&sort_col, &sort_dir) {
        (Some(col), Some(dir)) => format!("ORDER BY `{}` {}", col, dir),
        _ => "".to_string(),
    };

    match pool {
        DbPool::Sqlite(p) => {
            let query_str = format!("SELECT * FROM `{}` {} {} LIMIT {} OFFSET {}", table, where_str, order_by, per_page, offset);
            let rows = sqlx::query(&query_str)
                .fetch_all(&p)
                .await
                .map_err(|e| e.to_string())?;

            if rows.is_empty() {
                return Ok(QueryResult { columns: vec![], rows: vec![], total_count: None });
            }

            let columns: Vec<String> = rows[0].columns().iter().map(|c| c.name().to_string()).collect();
            let result_rows = rows.iter().map(sqlite_row_to_json).collect();
            
            Ok(QueryResult { columns, rows: result_rows, total_count: None })
        }
        DbPool::MySql(p) => {
            let query_str = format!("SELECT * FROM `{}` {} {} LIMIT {} OFFSET {}", table, where_str, order_by, per_page, offset);
            let rows = sqlx::query(&query_str)
                .fetch_all(&p)
                .await
                .map_err(|e| e.to_string())?;

            if rows.is_empty() {
                return Ok(QueryResult { columns: vec![], rows: vec![], total_count: None });
            }

            let columns: Vec<String> = rows[0].columns().iter().map(|c| c.name().to_string()).collect();
            let result_rows = rows.iter().map(mysql_row_to_json).collect();
            
            Ok(QueryResult { columns, rows: result_rows, total_count: None })
        }
    }
}

#[tauri::command]
pub async fn get_table_count(
    state: State<'_, DbState>,
    config: DbConfig,
    project_path: String,
    table: String,
    where_clause: Option<String>,
) -> Result<i64, String> {
    let pool = get_or_create_pool(&state, &config, &project_path).await?;

    let mut where_str = "".to_string();
    if let Some(w) = where_clause {
        if !w.trim().is_empty() {
            where_str = format!("WHERE {}", w);
        }
    }

    match pool {
        DbPool::Sqlite(p) => {
            let total_count: i64 = sqlx::query(&format!("SELECT COUNT(*) FROM `{}` {}", table, where_str))
                .fetch_one(&p)
                .await
                .map_err(|e| e.to_string())?
                .get(0);
            Ok(total_count)
        }
        DbPool::MySql(p) => {
            let total_count: i64 = sqlx::query(&format!("SELECT COUNT(*) FROM `{}` {}", table, where_str))
                .fetch_one(&p)
                .await
                .map_err(|e| e.to_string())?
                .get(0);
            Ok(total_count)
        }
    }
}

#[tauri::command]
pub async fn execute_raw_sql(
    state: State<'_, DbState>,
    config: DbConfig,
    project_path: String,
    sql: String,
) -> Result<QueryResult, String> {
    let pool = get_or_create_pool(&state, &config, &project_path).await?;

    match pool {
        DbPool::Sqlite(p) => {
            let rows = sqlx::query(&sql)
                .fetch_all(&p)
                .await
                .map_err(|e| e.to_string())?;

            if rows.is_empty() {
                return Ok(QueryResult { columns: vec![], rows: vec![], total_count: Some(0) });
            }

            let columns: Vec<String> = rows[0].columns().iter().map(|c| c.name().to_string()).collect();
            let result_rows = rows.iter().map(sqlite_row_to_json).collect();
            
            Ok(QueryResult { columns, rows: result_rows, total_count: Some(rows.len() as i64) })
        }
        DbPool::MySql(p) => {
            let rows = sqlx::query(&sql)
                .fetch_all(&p)
                .await
                .map_err(|e| e.to_string())?;

            if rows.is_empty() {
                return Ok(QueryResult { columns: vec![], rows: vec![], total_count: Some(0) });
            }

            let columns: Vec<String> = rows[0].columns().iter().map(|c| c.name().to_string()).collect();
            let result_rows = rows.iter().map(mysql_row_to_json).collect();
            
            Ok(QueryResult { columns, rows: result_rows, total_count: Some(rows.len() as i64) })
        }
    }
}

#[tauri::command]
pub async fn update_table_row(
    state: State<'_, DbState>,
    config: DbConfig,
    project_path: String,
    table: String,
    primary_keys: HashMap<String, serde_json::Value>,
    data: HashMap<String, serde_json::Value>,
) -> Result<(), String> {
    let pool = get_or_create_pool(&state, &config, &project_path).await?;
    
    if primary_keys.is_empty() {
        return Err("No primary keys provided to identify the record".to_string());
    }

    let mut set_clauses = Vec::new();
    let mut where_clauses = Vec::new();
    
    for (column, _) in &data {
        set_clauses.push(format!("`{}` = ?", column));
    }
    for (column, _) in &primary_keys {
        where_clauses.push(format!("`{}` = ?", column));
    }

    let query_str = format!(
        "UPDATE `{}` SET {} WHERE {}",
        table,
        set_clauses.join(", "),
        where_clauses.join(" AND ")
    );

    match pool {
        DbPool::Sqlite(p) => {
            let mut query = sqlx::query(&query_str);
            for (_, val) in data {
                query = bind_json_to_query_sqlite(query, val);
            }
            for (_, val) in primary_keys {
                query = bind_json_to_query_sqlite(query, val);
            }
            query.execute(&p).await.map_err(|e| e.to_string())?;
        }
        DbPool::MySql(p) => {
            let mut query = sqlx::query(&query_str);
            for (_, val) in data {
                query = bind_json_to_query_mysql(query, val);
            }
            for (_, val) in primary_keys {
                query = bind_json_to_query_mysql(query, val);
            }
            query.execute(&p).await.map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

fn bind_json_to_query_sqlite<'a>(
    query: sqlx::query::Query<'a, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'a>>,
    val: serde_json::Value,
) -> sqlx::query::Query<'a, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'a>> {
    match val {
        serde_json::Value::Null => query.bind(None::<String>),
        serde_json::Value::Bool(b) => query.bind(b),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                query.bind(i)
            } else {
                query.bind(n.as_f64().unwrap_or(0.0))
            }
        }
        serde_json::Value::String(s) => query.bind(s),
        _ => query.bind(val.to_string()),
    }
}

fn bind_json_to_query_mysql<'a>(
    query: sqlx::query::Query<'a, sqlx::MySql, sqlx::mysql::MySqlArguments>,
    val: serde_json::Value,
) -> sqlx::query::Query<'a, sqlx::MySql, sqlx::mysql::MySqlArguments> {
    match val {
        serde_json::Value::Null => query.bind(None::<String>),
        serde_json::Value::Bool(b) => query.bind(b),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                query.bind(i)
            } else {
                query.bind(n.as_f64().unwrap_or(0.0))
            }
        }
        serde_json::Value::String(s) => query.bind(s),
        _ => query.bind(val.to_string()),
    }
}

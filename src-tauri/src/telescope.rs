use serde::{Deserialize, Serialize};
use crate::db_viewer::{DbState, DbPool, parse_env_file, create_pool};
use crate::project::DbConfig;
use tauri::State;
use sqlx::{Row};
use std::path::Path;

#[derive(Debug, Serialize, Deserialize)]
pub struct TelescopeSummary {
    pub total_requests: i64,
    pub total_exceptions: i64,
    pub total_queries: i64,
    pub total_failed_jobs: i64,
    pub total_cache_hits: i64,
    pub total_cache_misses: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SlowQueryInsight {
    pub sql: String,
    pub avg_time: f64,
    pub count: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExceptionInsight {
    pub class: String,
    pub message: String,
    pub count: i64,
    pub last_seen: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CacheInsight {
    pub key: String,
    pub hits: i64,
    pub misses: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct HttpInsight {
    pub method: String,
    pub uri: String,
    pub avg_duration: f64,
    pub count: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NPlusOneInsight {
    pub uri: String,
    pub query_count: i64,
    pub batch_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RequestInsight {
    pub uuid: String,
    pub batch_id: String,
    pub method: String,
    pub uri: String,
    pub duration: f64,
    pub status: i32,
    pub controller_action: Option<String>,
    pub content: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BatchEntry {
    pub uuid: String,
    pub type_name: String,
    pub content: String,
    pub created_at: String,
}

async fn get_pool(project_path: &str) -> Result<DbPool, String> {
    let env_path = Path::new(project_path).join(".env");
    if !env_path.exists() {
        return Err("No .env file found".to_string());
    }

    let env = parse_env_file(&env_path);
    let connection = env.get("DB_CONNECTION").cloned().unwrap_or_else(|| "mysql".to_string());
    
    let database = if let Some(db) = env.get("DB_DATABASE") {
        db.clone()
    } else if connection == "sqlite" {
        "database/database.sqlite".to_string()
    } else {
        return Err("DB_DATABASE not defined".to_string());
    };

    let config = DbConfig {
        connection,
        host: env.get("DB_HOST").cloned(),
        port: env.get("DB_PORT").cloned(),
        database,
        username: env.get("DB_USERNAME").cloned(),
        password: env.get("DB_PASSWORD").cloned(),
    };

    create_pool(&config, project_path).await
}

#[tauri::command]
pub async fn get_telescope_summary(_state: State<'_, DbState>, project_path: String) -> Result<TelescopeSummary, String> {
    let pool = get_pool(&project_path).await?;
    
    match pool {
        DbPool::Sqlite(p) => {
            let requests: i64 = sqlx::query("SELECT COUNT(*) FROM telescope_entries WHERE type = 'request'").fetch_one(&p).await.map_err(|e| e.to_string())?.get(0);
            let exceptions: i64 = sqlx::query("SELECT COUNT(*) FROM telescope_entries WHERE type = 'exception'").fetch_one(&p).await.map_err(|e| e.to_string())?.get(0);
            let queries: i64 = sqlx::query("SELECT COUNT(*) FROM telescope_entries WHERE type = 'query'").fetch_one(&p).await.map_err(|e| e.to_string())?.get(0);
            let failed_jobs: i64 = sqlx::query("SELECT COUNT(*) FROM telescope_entries WHERE type = 'job' AND json_extract(content, '$.status') = 'failed'").fetch_one(&p).await.map_err(|e| e.to_string())?.get(0);
            let cache_hits: i64 = sqlx::query("SELECT COUNT(*) FROM telescope_entries WHERE type = 'cache' AND json_extract(content, '$.type') = 'hit'").fetch_one(&p).await.map_err(|e| e.to_string())?.get(0);
            let cache_misses: i64 = sqlx::query("SELECT COUNT(*) FROM telescope_entries WHERE type = 'cache' AND json_extract(content, '$.type') = 'miss'").fetch_one(&p).await.map_err(|e| e.to_string())?.get(0);
            
            Ok(TelescopeSummary {
                total_requests: requests,
                total_exceptions: exceptions,
                total_queries: queries,
                total_failed_jobs: failed_jobs,
                total_cache_hits: cache_hits,
                total_cache_misses: cache_misses,
            })
        },
        DbPool::MySql(p) => {
            let requests: i64 = sqlx::query("SELECT COUNT(*) FROM telescope_entries WHERE type = 'request'").fetch_one(&p).await.map_err(|e| e.to_string())?.get(0);
            let exceptions: i64 = sqlx::query("SELECT COUNT(*) FROM telescope_entries WHERE type = 'exception'").fetch_one(&p).await.map_err(|e| e.to_string())?.get(0);
            let queries: i64 = sqlx::query("SELECT COUNT(*) FROM telescope_entries WHERE type = 'query'").fetch_one(&p).await.map_err(|e| e.to_string())?.get(0);
            let failed_jobs: i64 = sqlx::query("SELECT COUNT(*) FROM telescope_entries WHERE type = 'job' AND JSON_EXTRACT(content, '$.status') = 'failed'").fetch_one(&p).await.map_err(|e| e.to_string())?.get(0);
            let cache_hits: i64 = sqlx::query("SELECT COUNT(*) FROM telescope_entries WHERE type = 'cache' AND JSON_EXTRACT(content, '$.type') = 'hit'").fetch_one(&p).await.map_err(|e| e.to_string())?.get(0);
            let cache_misses: i64 = sqlx::query("SELECT COUNT(*) FROM telescope_entries WHERE type = 'cache' AND JSON_EXTRACT(content, '$.type') = 'miss'").fetch_one(&p).await.map_err(|e| e.to_string())?.get(0);
            
            Ok(TelescopeSummary {
                total_requests: requests,
                total_exceptions: exceptions,
                total_queries: queries,
                total_failed_jobs: failed_jobs,
                total_cache_hits: cache_hits,
                total_cache_misses: cache_misses,
            })
        }
    }
}

#[tauri::command]
pub async fn get_telescope_slow_queries(_state: State<'_, DbState>, project_path: String) -> Result<Vec<SlowQueryInsight>, String> {
    let pool = get_pool(&project_path).await?;
    let (json_fn, cast_type) = match pool {
        DbPool::Sqlite(_) => ("json_extract", "REAL"),
        DbPool::MySql(_) => ("JSON_EXTRACT", "DOUBLE"),
    };

    let sql = format!(
        "SELECT {json_fn}(content, '$.sql') as query_sql, 
                AVG(CAST({json_fn}(content, '$.time') AS {cast_type})) as avg_time, 
                COUNT(*) as occurrences
         FROM telescope_entries 
         WHERE type = 'query' 
         GROUP BY query_sql 
         ORDER BY AVG(CAST({json_fn}(content, '$.time') AS {cast_type})) DESC 
         LIMIT 10"
    );

    match pool {
        DbPool::Sqlite(p) => {
            let rows = sqlx::query(&sql).fetch_all(&p).await.map_err(|e| e.to_string())?;
            Ok(rows.iter().map(|r| SlowQueryInsight {
                sql: r.get(0),
                avg_time: r.get::<f64, _>(1),
                count: r.get::<i64, _>(2),
            }).collect())
        },
        DbPool::MySql(p) => {
            let rows = sqlx::query(&sql).fetch_all(&p).await.map_err(|e| e.to_string())?;
            Ok(rows.iter().map(|r| SlowQueryInsight {
                sql: r.get(0),
                avg_time: r.get::<f64, _>(1),
                count: r.get::<i64, _>(2),
            }).collect())
        }
    }
}

#[tauri::command]
pub async fn get_telescope_exceptions(_state: State<'_, DbState>, project_path: String) -> Result<Vec<ExceptionInsight>, String> {
    let pool = get_pool(&project_path).await?;
    let json_fn = match pool {
        DbPool::Sqlite(_) => "json_extract",
        DbPool::MySql(_) => "JSON_EXTRACT",
    };

    let sql = format!(
        "SELECT {json_fn}(content, '$.class') as ex_class, 
                {json_fn}(content, '$.message') as ex_message, 
                COUNT(*) as occurrences,
                MAX(created_at) as last_seen
         FROM telescope_entries 
         WHERE type = 'exception' 
         GROUP BY ex_class, ex_message 
         ORDER BY COUNT(*) DESC 
         LIMIT 10"
    );

    match pool {
        DbPool::Sqlite(p) => {
            let rows = sqlx::query(&sql).fetch_all(&p).await.map_err(|e| e.to_string())?;
            Ok(rows.iter().map(|r| ExceptionInsight {
                class: r.get(0),
                message: r.get(1),
                count: r.get::<i64, _>(2),
                last_seen: r.get(3),
            }).collect())
        },
        DbPool::MySql(p) => {
            let rows = sqlx::query(&sql).fetch_all(&p).await.map_err(|e| e.to_string())?;
            Ok(rows.iter().map(|r| ExceptionInsight {
                class: r.get(0),
                message: r.get(1),
                count: r.get::<i64, _>(2),
                last_seen: r.get::<chrono::NaiveDateTime, _>(3).to_string(),
            }).collect())
        }
    }
}

#[tauri::command]
pub async fn get_telescope_cache_insights(_state: State<'_, DbState>, project_path: String) -> Result<Vec<CacheInsight>, String> {
    let pool = get_pool(&project_path).await?;
    let json_fn = match pool {
        DbPool::Sqlite(_) => "json_extract",
        DbPool::MySql(_) => "JSON_EXTRACT",
    };

    let sql = format!(
        "SELECT {json_fn}(content, '$.key') as cache_key,
                COUNT(CASE WHEN {json_fn}(content, '$.type') = 'hit' THEN 1 END) as hits,
                COUNT(CASE WHEN {json_fn}(content, '$.type') = 'miss' THEN 1 END) as misses
         FROM telescope_entries 
         WHERE type = 'cache' 
         GROUP BY cache_key
         ORDER BY COUNT(CASE WHEN {json_fn}(content, '$.type') = 'hit' THEN 1 END) + COUNT(CASE WHEN {json_fn}(content, '$.type') = 'miss' THEN 1 END) DESC 
         LIMIT 10"
    );

    match pool {
        DbPool::Sqlite(p) => {
            let rows = sqlx::query(&sql).fetch_all(&p).await.map_err(|e| e.to_string())?;
            Ok(rows.iter().map(|r| CacheInsight {
                key: r.get(0),
                hits: r.get::<i32, _>(1) as i64,
                misses: r.get::<i32, _>(2) as i64,
            }).collect())
        },
        DbPool::MySql(p) => {
            let rows = sqlx::query(&sql).fetch_all(&p).await.map_err(|e| e.to_string())?;
            Ok(rows.iter().map(|r| CacheInsight {
                key: r.get(0),
                hits: r.get::<i64, _>(1),
                misses: r.get::<i64, _>(2),
            }).collect())
        }
    }
}

#[tauri::command]
pub async fn get_telescope_http_insights(_state: State<'_, DbState>, project_path: String) -> Result<Vec<HttpInsight>, String> {
    let pool = get_pool(&project_path).await?;
    let (json_fn, cast_type) = match pool {
        DbPool::Sqlite(_) => ("json_extract", "REAL"),
        DbPool::MySql(_) => ("JSON_EXTRACT", "DOUBLE"),
    };

    let sql = format!(
        "SELECT {json_fn}(content, '$.method') as http_method,
                {json_fn}(content, '$.uri') as http_uri,
                AVG(CAST({json_fn}(content, '$.duration') AS {cast_type})) as avg_dur,
                COUNT(*) as occurrences
         FROM telescope_entries 
         WHERE type = 'client_request' 
         GROUP BY http_method, http_uri
         ORDER BY AVG(CAST({json_fn}(content, '$.duration') AS {cast_type})) DESC 
         LIMIT 10"
    );

    match pool {
        DbPool::Sqlite(p) => {
            let rows = sqlx::query(&sql).fetch_all(&p).await.map_err(|e| e.to_string())?;
            Ok(rows.iter().map(|r| HttpInsight {
                method: r.get(0),
                uri: r.get(1),
                avg_duration: r.get::<f64, _>(2),
                count: r.get::<i64, _>(3),
            }).collect())
        },
        DbPool::MySql(p) => {
            let rows = sqlx::query(&sql).fetch_all(&p).await.map_err(|e| e.to_string())?;
            Ok(rows.iter().map(|r| HttpInsight {
                method: r.get(0),
                uri: r.get(1),
                avg_duration: r.get::<f64, _>(2),
                count: r.get::<i64, _>(3),
            }).collect())
        }
    }
}

#[tauri::command]
pub async fn get_telescope_n_plus_one(_state: State<'_, DbState>, project_path: String) -> Result<Vec<NPlusOneInsight>, String> {
    let pool = get_pool(&project_path).await?;
    let json_fn = match pool {
        DbPool::Sqlite(_) => "json_extract",
        DbPool::MySql(_) => "JSON_EXTRACT",
    };

    let sql = format!(
        "SELECT {json_fn}(r.content, '$.uri') as uri,
                COUNT(q.uuid) as q_count,
                r.batch_id
         FROM telescope_entries r
         JOIN telescope_entries q ON r.batch_id = q.batch_id
         WHERE r.type = 'request' AND q.type = 'query'
         GROUP BY r.batch_id, uri
         HAVING COUNT(q.uuid) > 20
         ORDER BY COUNT(q.uuid) DESC
         LIMIT 10"
    );

    match pool {
        DbPool::Sqlite(p) => {
            let rows = sqlx::query(&sql).fetch_all(&p).await.map_err(|e| e.to_string())?;
            Ok(rows.iter().map(|r| NPlusOneInsight {
                uri: r.get(0),
                query_count: r.get::<i64, _>(1),
                batch_id: r.get(2),
            }).collect())
        },
        DbPool::MySql(p) => {
            let rows = sqlx::query(&sql).fetch_all(&p).await.map_err(|e| e.to_string())?;
            Ok(rows.iter().map(|r| NPlusOneInsight {
                uri: r.get(0),
                query_count: r.get::<i64, _>(1),
                batch_id: r.get(2),
            }).collect())
        }
    }
}

#[tauri::command]
pub async fn get_telescope_recent_requests(_state: State<'_, DbState>, project_path: String) -> Result<Vec<RequestInsight>, String> {
    let pool = get_pool(&project_path).await?;
    let (json_fn, cast_type, signed_type) = match pool {
        DbPool::Sqlite(_) => ("json_extract", "REAL", "INTEGER"),
        DbPool::MySql(_) => ("JSON_EXTRACT", "DOUBLE", "SIGNED"),
    };

    let sql = format!(
        "SELECT uuid, batch_id, 
                {json_fn}(content, '$.method') as method,
                {json_fn}(content, '$.uri') as uri,
                CAST({json_fn}(content, '$.duration') AS {cast_type}) as duration,
                CAST({json_fn}(content, '$.response_status') AS {signed_type}) as status,
                {json_fn}(content, '$.controller_action') as controller_action,
                content,
                created_at
         FROM telescope_entries
         WHERE type = 'request'
         ORDER BY created_at DESC
         LIMIT 50"
    );

    match pool {
        DbPool::Sqlite(p) => {
            let rows = sqlx::query(&sql).fetch_all(&p).await.map_err(|e| e.to_string())?;
            Ok(rows.iter().map(|r| RequestInsight {
                uuid: r.get(0),
                batch_id: r.get(1),
                method: r.get(2),
                uri: r.get(3),
                duration: r.get::<f64, _>(4),
                status: r.get::<i32, _>(5),
                controller_action: r.get(6),
                content: r.get(7),
                created_at: r.get(8),
            }).collect())
        },
        DbPool::MySql(p) => {
            let rows = sqlx::query(&sql).fetch_all(&p).await.map_err(|e| e.to_string())?;
            Ok(rows.iter().map(|r| RequestInsight {
                uuid: r.get(0),
                batch_id: r.get(1),
                method: r.get(2),
                uri: r.get(3),
                duration: r.get::<f64, _>(4),
                status: r.get::<i32, _>(5),
                controller_action: r.get(6),
                content: r.get(7),
                created_at: r.get::<chrono::NaiveDateTime, _>(8).to_string(),
            }).collect())
        }
    }
}

#[tauri::command]
pub async fn get_telescope_batch_entries(_state: State<'_, DbState>, project_path: String, batch_id: String) -> Result<Vec<BatchEntry>, String> {
    let pool = get_pool(&project_path).await?;

    match pool {
        DbPool::Sqlite(p) => {
            let sql = "SELECT uuid, type, content, created_at FROM telescope_entries WHERE batch_id = $1 ORDER BY created_at ASC";
            let rows = sqlx::query(sql).bind(&batch_id).fetch_all(&p).await.map_err(|e| e.to_string())?;
            Ok(rows.iter().map(|r| BatchEntry {
                uuid: r.get(0),
                type_name: r.get(1),
                content: r.get(2),
                created_at: r.get(3),
            }).collect())
        },
        DbPool::MySql(p) => {
            let sql = "SELECT uuid, type, content, created_at FROM telescope_entries WHERE batch_id = ? ORDER BY created_at ASC";
            let rows = sqlx::query(sql).bind(&batch_id).fetch_all(&p).await.map_err(|e| e.to_string())?;
            Ok(rows.iter().map(|r| BatchEntry {
                uuid: r.get(0),
                type_name: r.get(1),
                content: r.get(2),
                created_at: r.get::<chrono::NaiveDateTime, _>(3).to_string(),
            }).collect())
        }
    }
}

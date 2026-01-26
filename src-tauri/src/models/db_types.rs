use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ColumnDetail {
    pub name: String,
    pub data_type: String,
    pub is_nullable: bool,
    pub default_value: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TableData {
    pub total: u32,
    pub has_more: bool,
    pub columns: Vec<String>,
    pub column_details: Vec<ColumnDetail>, // Added for enriched metadata
    pub rows: Vec<HashMap<String, Option<String>>>, // Changed to Option<String> to handle NULLs
    #[serde(default)] // Default to None if missing in JSON (though we control serialization)
    pub execution_duration_ms: Option<u64>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DbCredentials {
    pub host: Option<String>,
    pub port: Option<String>,
    pub database: String, // Path for SQLite, DB name for MySQL
    pub username: Option<String>,
    pub password: Option<String>,
    pub connection: String, // "mysql" or "sqlite"
}

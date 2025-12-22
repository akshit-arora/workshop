use crate::models::db_types::{ColumnDetail, DbCredentials, TableData};
use mysql::prelude::*;
use mysql::{consts::ColumnType, params, OptsBuilder, Pool, Value as MySqlValue};
use rusqlite::{types::Value as SqliteValue, Connection};
use std::collections::HashMap;
use std::path::Path;

pub trait DbBackend {
    fn get_tables(&mut self) -> Result<Vec<String>, String>;
    fn get_table_data(
        &mut self,
        table_name: &str,
        page: u32,
        per_page: u32,
        where_clause: Option<String>,
    ) -> Result<TableData, String>;
    fn execute_query(&mut self, query: &str) -> Result<TableData, String>;
    fn delete_row(
        &mut self,
        table_name: &str,
        pk_column: &str,
        pk_value: &str,
    ) -> Result<u64, String>;
    fn update_row(
        &mut self,
        table_name: &str,
        pk_column: &str,
        pk_value: &str,
        data: HashMap<String, Option<String>>,
    ) -> Result<u64, String>;
}

pub struct MySqlBackend {
    pool: Pool,
}

impl MySqlBackend {
    pub fn new(creds: &DbCredentials) -> Result<Self, String> {
        let opts = OptsBuilder::new()
            .ip_or_hostname(Some(creds.host.clone().unwrap_or_default()))
            .tcp_port(
                creds
                    .port
                    .clone()
                    .unwrap_or("3306".to_string())
                    .parse()
                    .map_err(|e| format!("Invalid port number: {}", e))?,
            )
            .db_name(Some(creds.database.clone()))
            .user(Some(creds.username.clone().unwrap_or_default()))
            .pass(Some(creds.password.clone().unwrap_or_default()));

        let pool =
            Pool::new(opts).map_err(|e| format!("Failed to connect to MySQL database: {}", e))?;
        Ok(Self { pool })
    }

    fn convert_value(value: &MySqlValue) -> Option<String> {
        match value {
            MySqlValue::NULL => None,
            MySqlValue::Bytes(bytes) => Some(String::from_utf8_lossy(bytes).to_string()),
            MySqlValue::Int(n) => Some(n.to_string()),
            MySqlValue::UInt(n) => Some(n.to_string()),
            MySqlValue::Float(n) => Some(n.to_string()),
            MySqlValue::Double(n) => Some(n.to_string()),
            MySqlValue::Date(y, m, d, h, i, s, _) => Some(format!(
                "{:04}-{:02}-{:02} {:02}:{:02}:{:02}",
                y, m, d, h, i, s
            )),
            MySqlValue::Time(neg, d, h, i, s, _) => {
                let sign = if *neg { "-" } else { "" };
                Some(format!("{}{}.{:02}:{:02}:{:02}", sign, d, h, i, s))
            }
        }
    }

    fn map_mysql_type_to_string(t: ColumnType) -> String {
        format!("{:?}", t)
    }
}

impl DbBackend for MySqlBackend {
    fn get_tables(&mut self) -> Result<Vec<String>, String> {
        let mut conn = self.pool.get_conn().map_err(|e| e.to_string())?;
        conn.query_map("SHOW TABLES", |table_name: String| table_name)
            .map_err(|e| e.to_string())
    }

    fn get_table_data(
        &mut self,
        table_name: &str,
        page: u32,
        per_page: u32,
        where_clause: Option<String>,
    ) -> Result<TableData, String> {
        let mut conn = self.pool.get_conn().map_err(|e| e.to_string())?;

        // This logic mimics the original implementation
        let mut where_clause_for_select = String::new();
        let mut where_clause_for_count = String::new();
        let limit = per_page;
        let mut has_limit_in_where = false;

        if let Some(clause) = where_clause {
            if !clause.trim().is_empty() {
                let upper_clause = clause.to_uppercase();
                if let Some(index) = upper_clause.rfind("LIMIT") {
                    where_clause_for_count = format!(" WHERE {}", &clause[..index].trim());
                    where_clause_for_select = format!(" WHERE {}", clause);
                    has_limit_in_where = true;
                } else {
                    where_clause_for_select = format!(" WHERE {}", clause);
                    where_clause_for_count = where_clause_for_select.clone();
                }
            }
        }

        let offset = (page - 1) * limit;

        // Count
        let count: u32 = conn
            .query_first(format!(
                "SELECT COUNT(*) FROM {}{}",
                table_name, where_clause_for_count
            ))
            .map_err(|e| e.to_string())?
            .unwrap_or(0);

        // Data
        let query = if has_limit_in_where {
            format!("SELECT * FROM {}{}", table_name, where_clause_for_select)
        } else {
            format!(
                "SELECT * FROM {}{} LIMIT {} OFFSET {}",
                table_name, where_clause_for_select, limit, offset
            )
        };

        let rows: Vec<mysql::Row> = conn.query(query).map_err(|e| e.to_string())?;

        let mut data = Vec::new();
        let mut columns = Vec::new();
        let mut column_details = Vec::new();

        if let Some(first_row) = rows.first() {
            let row_columns = first_row.columns();
            for col in row_columns.iter() {
                columns.push(col.name_str().to_string());
                column_details.push(ColumnDetail {
                    name: col.name_str().to_string(),
                    data_type: Self::map_mysql_type_to_string(col.column_type()),
                    is_nullable: !col
                        .flags()
                        .contains(mysql::consts::ColumnFlags::NOT_NULL_FLAG),
                    default_value: None, // Difficult to get from result set metadata
                });
            }
        }

        for row in rows {
            let mut row_data = HashMap::new();
            for (i, column) in columns.iter().enumerate() {
                row_data.insert(column.clone(), Self::convert_value(&row[i]));
            }
            data.push(row_data);
        }

        Ok(TableData {
            total: count,
            columns,
            column_details,
            rows: data,
        })
    }

    fn execute_query(&mut self, query: &str) -> Result<TableData, String> {
        let mut conn = self.pool.get_conn().map_err(|e| e.to_string())?;
        let rows: Vec<mysql::Row> = conn.query(query).map_err(|e| e.to_string())?;

        let mut data = Vec::new();
        let mut columns = Vec::new();
        let mut column_details = Vec::new();

        if let Some(first_row) = rows.first() {
            let row_columns = first_row.columns();
            for col in row_columns.iter() {
                columns.push(col.name_str().to_string());
                column_details.push(ColumnDetail {
                    name: col.name_str().to_string(),
                    data_type: Self::map_mysql_type_to_string(col.column_type()),
                    is_nullable: !col
                        .flags()
                        .contains(mysql::consts::ColumnFlags::NOT_NULL_FLAG),
                    default_value: None,
                });
            }
        }

        for row in rows {
            let mut row_data = HashMap::new();
            for (i, column) in columns.iter().enumerate() {
                row_data.insert(column.clone(), Self::convert_value(&row[i]));
            }
            data.push(row_data);
        }

        Ok(TableData {
            total: data.len() as u32,
            columns,
            column_details,
            rows: data,
        })
    }

    fn delete_row(
        &mut self,
        table_name: &str,
        pk_column: &str,
        pk_value: &str,
    ) -> Result<u64, String> {
        let mut conn = self.pool.get_conn().map_err(|e| e.to_string())?;
        let stmt = format!(
            "DELETE FROM `{}` WHERE `{}` = :value",
            table_name, pk_column
        );
        conn.exec_drop(stmt, params! {"value" => pk_value})
            .map_err(|e| e.to_string())?;
        Ok(conn.affected_rows())
    }

    fn update_row(
        &mut self,
        table_name: &str,
        pk_column: &str,
        pk_value: &str,
        data: HashMap<String, Option<String>>,
    ) -> Result<u64, String> {
        let mut conn = self.pool.get_conn().map_err(|e| e.to_string())?;
        let mut sets = Vec::new();
        let mut params: Vec<MySqlValue> = Vec::new();

        for (key, value) in &data {
            if key != pk_column {
                sets.push(format!("`{}` = ?", key));
                match value {
                    Some(v) => params.push(MySqlValue::from(v)),
                    None => params.push(MySqlValue::NULL),
                }
            }
        }
        params.push(MySqlValue::from(pk_value));

        let query = format!(
            "UPDATE `{}` SET {} WHERE `{}` = ?",
            table_name,
            sets.join(", "),
            pk_column
        );
        conn.exec_drop(query, params).map_err(|e| e.to_string())?;
        Ok(conn.affected_rows())
    }
}

pub struct SqliteBackend {
    conn: Connection,
}

impl SqliteBackend {
    pub fn new(path: &str) -> Result<Self, String> {
        let conn = Connection::open(path)
            .map_err(|e| format!("Failed to open SQLite database at {}: {}", path, e))?;
        Ok(Self { conn })
    }

    fn convert_value(value: SqliteValue) -> Option<String> {
        match value {
            SqliteValue::Null => None,
            SqliteValue::Integer(i) => Some(i.to_string()),
            SqliteValue::Real(f) => Some(f.to_string()),
            SqliteValue::Text(s) => Some(s),
            SqliteValue::Blob(b) => Some(String::from_utf8_lossy(&b).to_string()),
        }
    }
}

impl DbBackend for SqliteBackend {
    fn get_tables(&mut self) -> Result<Vec<String>, String> {
        let mut stmt = self
            .conn
            .prepare(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| row.get(0))
            .map_err(|e| e.to_string())?;

        let mut tables = Vec::new();
        for row in rows {
            tables.push(row.map_err(|e| e.to_string())?);
        }
        Ok(tables)
    }

    fn get_table_data(
        &mut self,
        table_name: &str,
        page: u32,
        per_page: u32,
        where_clause: Option<String>,
    ) -> Result<TableData, String> {
        // Logic similar to MySql implementation but for SQLite
        let mut where_clause_for_select = String::new();
        let mut where_clause_for_count = String::new();
        let limit = per_page;
        let mut has_limit_in_where = false;

        if let Some(clause) = where_clause {
            if !clause.trim().is_empty() {
                let upper_clause = clause.to_uppercase();
                if let Some(index) = upper_clause.rfind("LIMIT") {
                    where_clause_for_count = format!(" WHERE {}", &clause[..index].trim());
                    where_clause_for_select = format!(" WHERE {}", clause);
                    has_limit_in_where = true;
                } else {
                    where_clause_for_select = format!(" WHERE {}", clause);
                    where_clause_for_count = where_clause_for_select.clone();
                }
            }
        }

        let offset = (page - 1) * limit;

        // Count
        let count: u32 = self
            .conn
            .query_row(
                &format!(
                    "SELECT COUNT(*) FROM {}{}",
                    table_name, where_clause_for_count
                ),
                [],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;

        // Data
        let query = if has_limit_in_where {
            format!("SELECT * FROM {}{}", table_name, where_clause_for_select)
        } else {
            format!(
                "SELECT * FROM {}{} LIMIT {} OFFSET {}",
                table_name, where_clause_for_select, limit, offset
            )
        };

        let mut stmt = self.conn.prepare(&query).map_err(|e| e.to_string())?;

        // We need column names. To avoid borrow checker issues with stmt,
        // we can collect them first, drop the borrow, then query.
        let columns: Vec<String> = stmt
            .column_names()
            .into_iter()
            .map(|s| s.to_string())
            .collect();

        let column_count = columns.len();

        let rows = stmt
            .query_map([], |row| {
                let mut map = HashMap::new();
                for i in 0..column_count {
                    let val: SqliteValue = row.get(i)?;
                    let name = &columns[i];
                    map.insert(name.clone(), Self::convert_value(val));
                }
                Ok(map)
            })
            .map_err(|e| e.to_string())?;

        let mut data = Vec::new();
        let mut column_details = Vec::new();
        for row in rows {
            data.push(row.map_err(|e| e.to_string())?);
        }

        // Populate column details - minimal info for SQLite since getting metadata is harder here
        // We could run PRAGMA table_info(table_name) separately if needed, but for now basic info
        for col_name in &columns {
            column_details.push(ColumnDetail {
                name: col_name.clone(),
                data_type: "UNKNOWN".to_string(),
                is_nullable: true,
                default_value: None,
            });
        }

        Ok(TableData {
            total: count,
            columns,
            column_details,
            rows: data,
        })
    }

    fn execute_query(&mut self, query: &str) -> Result<TableData, String> {
        let mut stmt = self.conn.prepare(query).map_err(|e| e.to_string())?;

        let columns: Vec<String> = stmt
            .column_names()
            .into_iter()
            .map(|s| s.to_string())
            .collect();

        let column_count = columns.len();

        let rows = stmt
            .query_map([], |row| {
                let mut map = HashMap::new();
                for i in 0..column_count {
                    let val: SqliteValue = row.get(i)?;
                    let name = &columns[i];
                    map.insert(name.clone(), Self::convert_value(val));
                }
                Ok(map)
            })
            .map_err(|e| e.to_string())?;

        let mut data = Vec::new();
        for row in rows {
            data.push(row.map_err(|e| e.to_string())?);
        }

        let mut column_details = Vec::new();
        for col_name in &columns {
            column_details.push(ColumnDetail {
                name: col_name.clone(),
                data_type: "UNKNOWN".to_string(),
                is_nullable: true,
                default_value: None,
            });
        }

        Ok(TableData {
            total: data.len() as u32,
            columns,
            column_details,
            rows: data,
        })
    }

    fn delete_row(
        &mut self,
        table_name: &str,
        pk_column: &str,
        pk_value: &str,
    ) -> Result<u64, String> {
        let stmt = format!(
            "DELETE FROM \"{}\" WHERE \"{}\" = ?1",
            table_name, pk_column
        );
        let affected = self
            .conn
            .execute(&stmt, rusqlite::params![pk_value])
            .map_err(|e| e.to_string())?;
        Ok(affected as u64)
    }

    fn update_row(
        &mut self,
        table_name: &str,
        pk_column: &str,
        pk_value: &str,
        data: HashMap<String, Option<String>>,
    ) -> Result<u64, String> {
        let mut sets = Vec::new();

        let mut param_values: Vec<Option<String>> = Vec::new();
        for (key, value) in &data {
            if key != pk_column {
                sets.push(format!("\"{}\" = ?", key));
                param_values.push(value.clone());
            }
        }
        param_values.push(Some(pk_value.to_string()));

        let query = format!(
            "UPDATE \"{}\" SET {} WHERE \"{}\" = ?",
            table_name,
            sets.join(", "),
            pk_column
        );

        // rusqlite's params_from_iter expects something that iterates into ToSql
        let affected = self
            .conn
            .execute(&query, rusqlite::params_from_iter(param_values.iter()))
            .map_err(|e| e.to_string())?;
        Ok(affected as u64)
    }
}

pub fn get_db_backend(
    creds: &DbCredentials,
    project_path: &str,
) -> Result<Box<dyn DbBackend>, String> {
    match creds.connection.as_str() {
        "mysql" => Ok(Box::new(MySqlBackend::new(creds)?)),
        "sqlite" => {
            let path = Path::new(project_path).join(&creds.database);
            let path_str = path.to_str().ok_or("Invalid database path")?;
            Ok(Box::new(SqliteBackend::new(path_str)?))
        }
        _ => Err(format!(
            "Unsupported database connection type: {}",
            creds.connection
        )),
    }
}

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
        sort_column: Option<String>,
        sort_direction: Option<String>,
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
    fn get_total_rows(
        &mut self,
        table_name: &str,
        where_clause: Option<String>,
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
        sort_column: Option<String>,
        sort_direction: Option<String>,
    ) -> Result<TableData, String> {
        let start = std::time::Instant::now();
        let mut conn = self.pool.get_conn().map_err(|e| e.to_string())?;

        // This logic mimics the original implementation
        let mut where_clause_for_select = String::new();
        let limit = per_page;
        let mut has_limit_in_where = false;

        if let Some(clause) = where_clause {
            if !clause.trim().is_empty() {
                let upper_clause = clause.to_uppercase();
                if upper_clause.rfind("LIMIT").is_some() {
                    where_clause_for_select = format!(" WHERE {}", clause);
                    has_limit_in_where = true;
                } else {
                    where_clause_for_select = format!(" WHERE {}", clause);
                }
            }
        }

        let offset = (page - 1) * limit;

        // Sorting
        let mut order_by_clause = String::new();
        if let Some(col) = sort_column {
            if !col.trim().is_empty() {
                // Determine direction
                let dir = sort_direction
                    .map(|d| d.to_uppercase())
                    .unwrap_or_else(|| "ASC".to_string());
                let dir = if dir == "DESC" { "DESC" } else { "ASC" };

                // Sanitize column name (basic check or quoting)
                // Using backticks for MySQL
                order_by_clause = format!(" ORDER BY `{}` {}", col.replace("`", "``"), dir);
            }
        }

        // Data
        // We fetch one more row than requested to determine if there are more pages
        let query = if has_limit_in_where {
            format!("SELECT * FROM {}{}", table_name, where_clause_for_select)
        } else {
            format!(
                "SELECT * FROM {}{}{} LIMIT {} OFFSET {}",
                table_name,
                where_clause_for_select,
                order_by_clause,
                limit + 1,
                offset
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

        let mut has_more = false;
        if data.len() > limit as usize {
            data.pop();
            has_more = true;
        }

        Ok(TableData {
            total: 0, // Deprecated/Unused
            has_more,
            columns,
            column_details,
            rows: data,
            execution_duration_ms: Some(start.elapsed().as_millis() as u64),
        })
    }

    fn execute_query(&mut self, query: &str) -> Result<TableData, String> {
        let start = std::time::Instant::now();
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
            has_more: false,
            columns,
            column_details,
            rows: data,
            execution_duration_ms: Some(start.elapsed().as_millis() as u64),
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

    fn get_total_rows(
        &mut self,
        table_name: &str,
        where_clause: Option<String>,
    ) -> Result<u64, String> {
        let mut conn = self.pool.get_conn().map_err(|e| e.to_string())?;
        let mut where_clause_for_count = String::new();

        if let Some(clause) = where_clause {
            if !clause.trim().is_empty() {
                // Remove LIMIT if present for count query, though usually count queries don't have limit unless subquery
                // Simple approach: just append WHERE
                // Ideally we should strip LIMIT/OFFSET from where_clause if it was just passed raw
                // But typically where_clause passed here shouldn't contain LIMIT for a COUNT(*)
                // However, the frontend passes the same specific "where input"
                // The frontend "whereClause" input is just the condition "ID > 5" usually.
                // But the `get_table_data` implementation checks for "LIMIT" keyword in the where input.
                // We should probably do the same check to be safe, or just assume COUNT ignores it or it's valid SQL.
                // MySQL: SELECT COUNT(*) FROM table WHERE ... LIMIT ... is valid but LIMIT applies to the count result (1 row).
                // If the user typed "LIMIT 5" in the filter box, they might mean "Show me only 5 rows".
                // If they check total, they might expect the total matching that filter?
                // If filter is "id > 0 LIMIT 5", total matching is 5?
                // Let's stick to the same logic as get_table_data for building the WHERE clause.

                // Actually, if the user manually typed "LIMIT 10" in the filter box:
                // SELECT * FROM table WHERE LIMIT 10 -> Syntax error.
                // The user is expected to type "id > 5" or "name LIKE 'x%'".
                // get_table_data handles "col = val LIMIT 5".
                // Let's copy the logic roughly: use the whole clause.
                // If it contains LIMIT, we keep it. SELECT COUNT(*) ... WHERE ... LIMIT 5 returns 1 row (the count).
                // Wait, "WHERE id > 5 LIMIT 10". SELECT COUNT(*) FROM table WHERE id > 5 LIMIT 10.
                // This returns the count of rows where id > 5. The LIMIT 10 applies to the result set of COUNT(*), which is 1 row.
                // So LIMIT has no effect on the count value itself in MySQL for a simple count.
                // UNLESS the user mistakenly types "LIMIT 5" as the *entire* clause and we prepend WHERE.
                // "SELECT * FROM table WHERE LIMIT 5" -> Error.
                // The get_table_data code does:
                // if upper_clause.rfind("LIMIT").is_some() { where_clause_for_select = format!(" WHERE {}", clause); }
                // else { where_clause_for_select = format!(" WHERE {}", clause); }
                // It treats them the same?
                // Ah, line 108 vs 111 in get_table_data: both do `format!(" WHERE {}", clause)`.
                // The only difference is `has_limit_in_where = true`.
                // So we can just prepend WHERE if not empty.

                where_clause_for_count = format!(" WHERE {}", clause);
            }
        }

        let query = format!(
            "SELECT COUNT(*) FROM {}{}",
            table_name, where_clause_for_count
        );
        let count: Option<u64> = conn.query_first(query).map_err(|e| e.to_string())?;

        Ok(count.unwrap_or(0))
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
        sort_column: Option<String>,
        sort_direction: Option<String>,
    ) -> Result<TableData, String> {
        let start = std::time::Instant::now();
        // Logic similar to MySql implementation but for SQLite
        let mut where_clause_for_select = String::new();
        let limit = per_page;
        let mut has_limit_in_where = false;

        if let Some(clause) = where_clause {
            if !clause.trim().is_empty() {
                let upper_clause = clause.to_uppercase();
                if upper_clause.rfind("LIMIT").is_some() {
                    where_clause_for_select = format!(" WHERE {}", clause);
                    has_limit_in_where = true;
                } else {
                    where_clause_for_select = format!(" WHERE {}", clause);
                    // where_clause_for_count = where_clause_for_select.clone(); // Unused
                }
            }
        }

        let offset = (page - 1) * limit;

        // Sorting
        let mut order_by_clause = String::new();
        if let Some(col) = sort_column {
            if !col.trim().is_empty() {
                let dir = sort_direction
                    .map(|d| d.to_uppercase())
                    .unwrap_or_else(|| "ASC".to_string());
                let dir = if dir == "DESC" { "DESC" } else { "ASC" };

                // Sanitize/Quote for SQLite (double quotes)
                order_by_clause = format!(" ORDER BY \"{}\" {}", col.replace("\"", "\"\""), dir);
            }
        }

        // Data
        // We fetch one more row than requested to determine has_more
        let query = if has_limit_in_where {
            format!("SELECT * FROM {}{}", table_name, where_clause_for_select)
        } else {
            format!(
                "SELECT * FROM {}{}{} LIMIT {} OFFSET {}",
                table_name,
                where_clause_for_select,
                order_by_clause,
                limit + 1,
                offset
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

        let mut has_more = false;
        if data.len() > limit as usize {
            data.pop();
            has_more = true;
        }

        Ok(TableData {
            total: 0, // Deprecated/Unused
            has_more,
            columns,
            column_details,
            rows: data,
            execution_duration_ms: Some(start.elapsed().as_millis() as u64),
        })
    }

    fn execute_query(&mut self, query: &str) -> Result<TableData, String> {
        let start = std::time::Instant::now();
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
            has_more: false,
            columns,
            column_details,
            rows: data,
            execution_duration_ms: Some(start.elapsed().as_millis() as u64),
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

    fn get_total_rows(
        &mut self,
        table_name: &str,
        where_clause: Option<String>,
    ) -> Result<u64, String> {
        let mut where_clause_for_count = String::new();

        if let Some(clause) = where_clause {
            if !clause.trim().is_empty() {
                where_clause_for_count = format!(" WHERE {}", clause);
            }
        }

        let query = format!(
            "SELECT COUNT(*) FROM {}{}",
            table_name, where_clause_for_count
        );

        let mut stmt = self.conn.prepare(&query).map_err(|e| e.to_string())?;
        let count: u64 = stmt
            .query_row([], |row| row.get(0))
            .map_err(|e| e.to_string())?;

        Ok(count)
    }
}

pub fn get_db_backend(
    creds: &DbCredentials,
    project_path: &str,
) -> Result<Box<dyn DbBackend + Send>, String> {
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

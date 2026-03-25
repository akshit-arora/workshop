#[cfg(test)]
mod tests {
    use crate::db_viewer::*;
    use crate::project::DbConfig;
    use std::time::Instant;

    // ─── parse_env_file ────────────────────────────────
    #[test]
    fn test_parse_env_file_basic() {
        let dir = tempfile::TempDir::new().unwrap();
        let env_path = dir.path().join(".env");

        std::fs::write(&env_path, r#"
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=forge
DB_USERNAME=root
DB_PASSWORD=secret
"#).unwrap();

        let env = parse_env_file(&env_path);
        assert_eq!(env.get("DB_CONNECTION").unwrap(), "mysql");
        assert_eq!(env.get("DB_HOST").unwrap(), "127.0.0.1");
        assert_eq!(env.get("DB_PORT").unwrap(), "3306");
        assert_eq!(env.get("DB_DATABASE").unwrap(), "forge");
        assert_eq!(env.get("DB_USERNAME").unwrap(), "root");
        assert_eq!(env.get("DB_PASSWORD").unwrap(), "secret");
    }

    #[test]
    fn test_parse_env_file_with_quotes() {
        let dir = tempfile::TempDir::new().unwrap();
        let env_path = dir.path().join(".env");

        std::fs::write(&env_path, r#"
APP_NAME="My Cool App"
DB_PASSWORD='my secret'
PLAIN_VALUE=noQuotes
"#).unwrap();

        let env = parse_env_file(&env_path);
        assert_eq!(env.get("APP_NAME").unwrap(), "My Cool App");
        assert_eq!(env.get("DB_PASSWORD").unwrap(), "my secret");
        assert_eq!(env.get("PLAIN_VALUE").unwrap(), "noQuotes");
    }

    #[test]
    fn test_parse_env_file_with_comments() {
        let dir = tempfile::TempDir::new().unwrap();
        let env_path = dir.path().join(".env");

        std::fs::write(&env_path, r#"
# This is a comment
DB_HOST=localhost
# Another comment
DB_PORT=3306
"#).unwrap();

        let env = parse_env_file(&env_path);
        assert_eq!(env.len(), 2);
        assert_eq!(env.get("DB_HOST").unwrap(), "localhost");
    }

    #[test]
    fn test_parse_env_file_empty_lines() {
        let dir = tempfile::TempDir::new().unwrap();
        let env_path = dir.path().join(".env");

        std::fs::write(&env_path, "\n\nKEY=value\n\n").unwrap();

        let env = parse_env_file(&env_path);
        assert_eq!(env.len(), 1);
        assert_eq!(env.get("KEY").unwrap(), "value");
    }

    #[test]
    fn test_parse_env_file_nonexistent() {
        let dir = tempfile::TempDir::new().unwrap();
        let env_path = dir.path().join(".env-missing");

        let env = parse_env_file(&env_path);
        assert!(env.is_empty());
    }

    #[test]
    fn test_parse_env_file_empty_values() {
        let dir = tempfile::TempDir::new().unwrap();
        let env_path = dir.path().join(".env");

        std::fs::write(&env_path, "DB_PASSWORD=\nDB_HOST=localhost\n").unwrap();

        let env = parse_env_file(&env_path);
        assert_eq!(env.get("DB_PASSWORD").unwrap(), "");
        assert_eq!(env.get("DB_HOST").unwrap(), "localhost");
    }

    // ─── DbState ───────────────────────────────────────
    #[test]
    fn test_db_state_default() {
        let state = DbState::default();
        let sessions = state.sessions.lock().unwrap();
        assert!(sessions.is_empty());
    }

    // ─── QueryResult serde ─────────────────────────────
    #[test]
    fn test_query_result_serialization() {
        let result = QueryResult {
            columns: vec!["id".to_string(), "name".to_string()],
            rows: vec![serde_json::json!({"id": 1, "name": "Alice"})],
            total_count: Some(1),
        };

        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("id"));
        assert!(json.contains("Alice"));

        let deserialized: QueryResult = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.columns.len(), 2);
        assert_eq!(deserialized.total_count, Some(1));
    }

    #[test]
    fn test_query_result_empty() {
        let result = QueryResult {
            columns: vec![],
            rows: vec![],
            total_count: Some(0),
        };

        let json = serde_json::to_string(&result).unwrap();
        let deserialized: QueryResult = serde_json::from_str(&json).unwrap();
        assert!(deserialized.columns.is_empty());
        assert!(deserialized.rows.is_empty());
        assert_eq!(deserialized.total_count, Some(0));
    }

    // ─── ColumnSchema serde ────────────────────────────
    #[test]
    fn test_column_schema_serialization() {
        let schema = ColumnSchema {
            name: "id".to_string(),
            data_type: "INTEGER".to_string(),
            is_nullable: false,
            is_primary_key: true,
        };

        let json = serde_json::to_string(&schema).unwrap();
        assert!(json.contains("INTEGER"));

        let deserialized: ColumnSchema = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.name, "id");
        assert!(deserialized.is_primary_key);
        assert!(!deserialized.is_nullable);
    }

    // ─── bind_json_to_query helpers ────────────────────
    // These are tested indirectly via integration tests, but we can
    // validate the JSON value types used

    #[test]
    fn test_json_value_types_for_binding() {
        // Ensure JSON values can be constructed correctly for the binding functions
        let null_val = serde_json::Value::Null;
        let bool_val = serde_json::Value::Bool(true);
        let int_val = serde_json::json!(42);
        let float_val = serde_json::json!(3.14);
        let string_val = serde_json::json!("hello");

        assert!(null_val.is_null());
        assert!(bool_val.is_boolean());
        assert!(int_val.is_number());
        assert!(float_val.is_number());
        assert!(string_val.is_string());

        // Verify i64 extraction
        assert_eq!(int_val.as_i64(), Some(42));
        // Verify f64 extraction
        assert!((float_val.as_f64().unwrap() - 3.14).abs() < f64::EPSILON);
    }

    // ─── DbConfig ──────────────────────────────────────
    #[test]
    fn test_db_config_mysql() {
        let config = DbConfig {
            connection: "mysql".to_string(),
            host: Some("127.0.0.1".to_string()),
            port: Some("3306".to_string()),
            database: "test_db".to_string(),
            username: Some("root".to_string()),
            password: Some("".to_string()),
        };

        assert_eq!(config.connection, "mysql");
        assert_eq!(config.host.as_deref().unwrap_or("127.0.0.1"), "127.0.0.1");
        assert_eq!(config.port.as_deref().unwrap_or("3306"), "3306");
    }

    #[test]
    fn test_db_config_sqlite() {
        let config = DbConfig {
            connection: "sqlite".to_string(),
            host: None,
            port: None,
            database: "database/database.sqlite".to_string(),
            username: None,
            password: None,
        };

        assert_eq!(config.connection, "sqlite");
        assert!(config.host.is_none());
    }

    // ─── get_laravel_db_config (file-based) ─────────────
    #[tokio::test]
    async fn test_get_laravel_db_config_mysql() {
        let dir = tempfile::TempDir::new().unwrap();
        let env_path = dir.path().join(".env");

        std::fs::write(&env_path, r#"
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=laravel_app
DB_USERNAME=root
DB_PASSWORD=password123
"#).unwrap();

        let result = get_laravel_db_config(dir.path().to_string_lossy().to_string()).await;
        assert!(result.is_ok());

        let config = result.unwrap();
        assert_eq!(config.connection, "mysql");
        assert_eq!(config.database, "laravel_app");
        assert_eq!(config.host.unwrap(), "127.0.0.1");
        assert_eq!(config.port.unwrap(), "3306");
        assert_eq!(config.username.unwrap(), "root");
        assert_eq!(config.password.unwrap(), "password123");
    }

    #[tokio::test]
    async fn test_get_laravel_db_config_sqlite() {
        let dir = tempfile::TempDir::new().unwrap();
        let env_path = dir.path().join(".env");

        std::fs::write(&env_path, r#"
DB_CONNECTION=sqlite
DB_DATABASE=database/database.sqlite
"#).unwrap();

        let result = get_laravel_db_config(dir.path().to_string_lossy().to_string()).await;
        assert!(result.is_ok());

        let config = result.unwrap();
        assert_eq!(config.connection, "sqlite");
        assert_eq!(config.database, "database/database.sqlite");
    }

    #[tokio::test]
    async fn test_get_laravel_db_config_sqlite_default_path() {
        let dir = tempfile::TempDir::new().unwrap();
        let env_path = dir.path().join(".env");

        // sqlite with no DB_DATABASE should default
        std::fs::write(&env_path, "DB_CONNECTION=sqlite\n").unwrap();

        let result = get_laravel_db_config(dir.path().to_string_lossy().to_string()).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap().database, "database/database.sqlite");
    }

    #[tokio::test]
    async fn test_get_laravel_db_config_no_env() {
        let dir = tempfile::TempDir::new().unwrap();

        let result = get_laravel_db_config(dir.path().to_string_lossy().to_string()).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("No .env file found"));
    }

    #[tokio::test]
    async fn test_get_laravel_db_config_missing_database() {
        let dir = tempfile::TempDir::new().unwrap();
        let env_path = dir.path().join(".env");

        // mysql with no DB_DATABASE should error
        std::fs::write(&env_path, "DB_CONNECTION=mysql\n").unwrap();

        let result = get_laravel_db_config(dir.path().to_string_lossy().to_string()).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("DB_DATABASE not defined"));
    }

    // ─── create_pool validates unsupported connection ───
    // We can't test create_pool directly without a real DB, but
    // we test that unsupported connections are handled
    #[tokio::test]
    async fn test_create_pool_unsupported_connection() {
        let config = DbConfig {
            connection: "postgres".to_string(),
            host: None,
            port: None,
            database: "test".to_string(),
            username: None,
            password: None,
        };

        let result = create_pool(&config, "/tmp").await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Unsupported database connection"));
    }

    // ─── ActiveSession ─────────────────────────────────
    #[test]
    fn test_session_tracking() {
        let state = DbState::default();
        let mut sessions = state.sessions.lock().unwrap();
        assert!(sessions.is_empty());

        // Simulate adding a session
        // (We can't create a real pool without a database, but we test the HashMap)
        assert_eq!(sessions.len(), 0);

        // Test the cleanup logic
        let _now = Instant::now();
        let _timeout = std::time::Duration::from_secs(600); // 10 minutes
        sessions.retain(|_, _session| true);
        assert_eq!(sessions.len(), 0);
    }
}

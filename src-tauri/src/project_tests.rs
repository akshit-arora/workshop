#[cfg(test)]
mod tests {
    use crate::project::*;
    use std::fs;
    use tempfile::TempDir;

    // ─── Helper ────────────────────────────────────────
    fn setup_temp_dir() -> TempDir {
        TempDir::new().expect("Failed to create temp dir")
    }

    // ─── detect_and_save_project_info ──────────────────
    #[test]
    fn test_detect_laravel_project() {
        let dir = setup_temp_dir();
        let path = dir.path();

        // Create artisan and composer.json to mimic a Laravel project
        fs::write(path.join("artisan"), "#!/usr/bin/env php").unwrap();
        fs::write(path.join("composer.json"), "{}").unwrap();

        let result = detect_and_save_project_info(path.to_string_lossy().to_string());
        assert!(result.is_ok());

        let info = result.unwrap();
        assert_eq!(info.project_type, "Laravel");
        assert!(info.detected_at > 0);
        assert!(info.saved_queries.is_empty());
        assert!(info.db_config.is_none());

        // Verify .workshop.json was written
        let info_path = path.join(".workshop.json");
        assert!(info_path.exists());
    }

    #[test]
    fn test_detect_unknown_project() {
        let dir = setup_temp_dir();
        let path = dir.path();

        let result = detect_and_save_project_info(path.to_string_lossy().to_string());
        assert!(result.is_ok());

        let info = result.unwrap();
        assert_eq!(info.project_type, "Unknown");
    }

    #[test]
    fn test_detect_partial_laravel_only_artisan() {
        let dir = setup_temp_dir();
        let path = dir.path();

        // Only artisan, no composer.json → not Laravel
        fs::write(path.join("artisan"), "#!/usr/bin/env php").unwrap();

        let result = detect_and_save_project_info(path.to_string_lossy().to_string());
        assert!(result.is_ok());
        assert_eq!(result.unwrap().project_type, "Unknown");
    }

    #[test]
    fn test_detect_partial_laravel_only_composer() {
        let dir = setup_temp_dir();
        let path = dir.path();

        // Only composer.json, no artisan → not Laravel
        fs::write(path.join("composer.json"), "{}").unwrap();

        let result = detect_and_save_project_info(path.to_string_lossy().to_string());
        assert!(result.is_ok());
        assert_eq!(result.unwrap().project_type, "Unknown");
    }

    // ─── get_project_info ──────────────────────────────
    #[test]
    fn test_get_project_info_exists() {
        let dir = setup_temp_dir();
        let path = dir.path();

        // First detect → creates the file
        detect_and_save_project_info(path.to_string_lossy().to_string()).unwrap();

        let result = get_project_info(path.to_string_lossy().to_string());
        assert!(result.is_ok());
        assert!(result.unwrap().is_some());
    }

    #[test]
    fn test_get_project_info_not_exists() {
        let dir = setup_temp_dir();
        let result = get_project_info(dir.path().to_string_lossy().to_string());
        assert!(result.is_ok());
        assert!(result.unwrap().is_none());
    }

    #[test]
    fn test_get_project_info_corrupted_file() {
        let dir = setup_temp_dir();
        let path = dir.path();

        fs::write(path.join(".workshop.json"), "not valid json at all").unwrap();

        let result = get_project_info(path.to_string_lossy().to_string());
        assert!(result.is_err()); // Should fail to parse
    }

    // ─── save_query / get_saved_queries ────────────────
    #[test]
    fn test_save_and_get_query() {
        let dir = setup_temp_dir();
        let path = dir.path().to_string_lossy().to_string();

        // Save a query
        save_query(path.clone(), "users".to_string(), "SELECT * FROM users".to_string()).unwrap();

        let queries = get_saved_queries(path).unwrap();
        assert_eq!(queries.len(), 1);
        assert_eq!(queries[0].name, "users");
        assert_eq!(queries[0].sql, "SELECT * FROM users");
    }

    #[test]
    fn test_save_query_replaces_existing() {
        let dir = setup_temp_dir();
        let path = dir.path().to_string_lossy().to_string();

        save_query(path.clone(), "users".to_string(), "SELECT * FROM users".to_string()).unwrap();
        save_query(path.clone(), "users".to_string(), "SELECT id FROM users".to_string()).unwrap();

        let queries = get_saved_queries(path).unwrap();
        assert_eq!(queries.len(), 1);
        assert_eq!(queries[0].sql, "SELECT id FROM users");
    }

    #[test]
    fn test_save_multiple_queries() {
        let dir = setup_temp_dir();
        let path = dir.path().to_string_lossy().to_string();

        save_query(path.clone(), "q1".to_string(), "SELECT 1".to_string()).unwrap();
        save_query(path.clone(), "q2".to_string(), "SELECT 2".to_string()).unwrap();
        save_query(path.clone(), "q3".to_string(), "SELECT 3".to_string()).unwrap();

        let queries = get_saved_queries(path).unwrap();
        assert_eq!(queries.len(), 3);
    }

    #[test]
    fn test_get_saved_queries_no_file() {
        let dir = setup_temp_dir();
        let queries = get_saved_queries(dir.path().to_string_lossy().to_string()).unwrap();
        assert!(queries.is_empty());
    }

    #[test]
    fn test_get_saved_queries_corrupted_file() {
        let dir = setup_temp_dir();
        let path = dir.path();

        fs::write(path.join(".workshop.json"), "garbage data").unwrap();

        let queries = get_saved_queries(path.to_string_lossy().to_string()).unwrap();
        assert!(queries.is_empty()); // Gracefully returns empty
    }

    // ─── save_custom_db_config ─────────────────────────
    #[test]
    fn test_save_custom_db_config() {
        let dir = setup_temp_dir();
        let path = dir.path().to_string_lossy().to_string();

        let config = DbConfig {
            connection: "mysql".to_string(),
            host: Some("127.0.0.1".to_string()),
            port: Some("3306".to_string()),
            database: "my_db".to_string(),
            username: Some("root".to_string()),
            password: Some("secret".to_string()),
        };

        save_custom_db_config(path.clone(), Some(config)).unwrap();

        let info = get_project_info(path).unwrap().unwrap();
        assert!(info.db_config.is_some());
        let db = info.db_config.unwrap();
        assert_eq!(db.connection, "mysql");
        assert_eq!(db.database, "my_db");
        assert_eq!(db.host.unwrap(), "127.0.0.1");
    }

    #[test]
    fn test_save_custom_db_config_clears_config() {
        let dir = setup_temp_dir();
        let path = dir.path().to_string_lossy().to_string();

        let config = DbConfig {
            connection: "sqlite".to_string(),
            host: None,
            port: None,
            database: "db.sqlite".to_string(),
            username: None,
            password: None,
        };

        save_custom_db_config(path.clone(), Some(config)).unwrap();
        save_custom_db_config(path.clone(), None).unwrap();

        let info = get_project_info(path).unwrap().unwrap();
        assert!(info.db_config.is_none());
    }

    #[test]
    fn test_save_db_config_preserves_saved_queries() {
        let dir = setup_temp_dir();
        let path = dir.path().to_string_lossy().to_string();

        // First save a query
        save_query(path.clone(), "q1".to_string(), "SELECT 1".to_string()).unwrap();

        // Then save a db config
        let config = DbConfig {
            connection: "sqlite".to_string(),
            host: None,
            port: None,
            database: "db.sqlite".to_string(),
            username: None,
            password: None,
        };
        save_custom_db_config(path.clone(), Some(config)).unwrap();

        // Saved queries should still be there
        let queries = get_saved_queries(path).unwrap();
        assert_eq!(queries.len(), 1);
        assert_eq!(queries[0].name, "q1");
    }

    // ─── remove_project_info ───────────────────────────
    #[test]
    fn test_remove_project_info() {
        let dir = setup_temp_dir();
        let path = dir.path().to_string_lossy().to_string();

        detect_and_save_project_info(path.clone()).unwrap();

        // File exists
        assert!(dir.path().join(".workshop.json").exists());

        remove_project_info(path.clone()).unwrap();

        // File removed
        assert!(!dir.path().join(".workshop.json").exists());
    }

    #[test]
    fn test_remove_project_info_no_file() {
        let dir = setup_temp_dir();
        // Should not error when file doesn't exist
        let result = remove_project_info(dir.path().to_string_lossy().to_string());
        assert!(result.is_ok());
    }

    // ─── ProjectInfo serde ─────────────────────────────
    #[test]
    fn test_project_info_default() {
        let info = ProjectInfo::default();
        assert_eq!(info.project_type, "");
        assert_eq!(info.detected_at, 0);
        assert!(info.saved_queries.is_empty());
        assert!(info.db_config.is_none());
    }

    #[test]
    fn test_project_info_roundtrip_serde() {
        let info = ProjectInfo {
            project_type: "Laravel".to_string(),
            detected_at: 1234567890,
            saved_queries: vec![SavedQuery {
                name: "test".to_string(),
                sql: "SELECT 1".to_string(),
            }],
            db_config: Some(DbConfig {
                connection: "mysql".to_string(),
                host: Some("localhost".to_string()),
                port: Some("3306".to_string()),
                database: "testdb".to_string(),
                username: Some("user".to_string()),
                password: Some("pass".to_string()),
            }),
        };

        let json = serde_json::to_string(&info).unwrap();
        let deserialized: ProjectInfo = serde_json::from_str(&json).unwrap();

        assert_eq!(deserialized.project_type, "Laravel");
        assert_eq!(deserialized.detected_at, 1234567890);
        assert_eq!(deserialized.saved_queries.len(), 1);
        assert!(deserialized.db_config.is_some());
    }

    #[test]
    fn test_project_info_deserialize_missing_fields() {
        // Only project_type is present — other fields should use defaults
        let json = r#"{"project_type": "Django"}"#;
        let info: ProjectInfo = serde_json::from_str(json).unwrap();

        assert_eq!(info.project_type, "Django");
        assert_eq!(info.detected_at, 0);
        assert!(info.saved_queries.is_empty());
        assert!(info.db_config.is_none());
    }
}

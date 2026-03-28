#[cfg(test)]
mod tests {
    use crate::logs::*;
    use std::fs;
    use tempfile::TempDir;

    fn setup_laravel_log_dir(dir: &std::path::Path) -> std::path::PathBuf {
        let logs_dir = dir.join("storage").join("logs");
        fs::create_dir_all(&logs_dir).unwrap();
        logs_dir
    }

    // ─── list_laravel_logs ─────────────────────────────
    #[tokio::test]
    async fn test_list_logs_empty_dir() {
        let dir = TempDir::new().unwrap();
        let _logs_dir = setup_laravel_log_dir(dir.path());

        let result = list_laravel_logs(dir.path().to_string_lossy().to_string()).await;
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[tokio::test]
    async fn test_list_logs_no_storage_dir() {
        let dir = TempDir::new().unwrap();

        let result = list_laravel_logs(dir.path().to_string_lossy().to_string()).await;
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[tokio::test]
    async fn test_list_logs_with_log_files() {
        let dir = TempDir::new().unwrap();
        let logs_dir = setup_laravel_log_dir(dir.path());

        fs::write(logs_dir.join("laravel-2024-01-01.log"), "Log entry 1").unwrap();
        fs::write(logs_dir.join("laravel-2024-01-02.log"), "Log entry 2").unwrap();

        let result = list_laravel_logs(dir.path().to_string_lossy().to_string()).await;
        assert!(result.is_ok());

        let logs = result.unwrap();
        assert_eq!(logs.len(), 2);
    }

    #[tokio::test]
    async fn test_list_logs_ignores_non_log_files() {
        let dir = TempDir::new().unwrap();
        let logs_dir = setup_laravel_log_dir(dir.path());

        fs::write(logs_dir.join("laravel.log"), "Log entry").unwrap();
        fs::write(logs_dir.join("readme.txt"), "Not a log").unwrap();
        fs::write(logs_dir.join("data.json"), "{}").unwrap();

        let result = list_laravel_logs(dir.path().to_string_lossy().to_string()).await;
        let logs = result.unwrap();

        assert_eq!(logs.len(), 1);
        assert_eq!(logs[0].name, "laravel.log");
    }

    #[tokio::test]
    async fn test_list_logs_sorted_by_modified_desc() {
        let dir = TempDir::new().unwrap();
        let logs_dir = setup_laravel_log_dir(dir.path());

        // Write files with slight delay to have different modification times
        fs::write(logs_dir.join("old.log"), "old content").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(50));
        fs::write(logs_dir.join("new.log"), "new content").unwrap();

        let logs = list_laravel_logs(dir.path().to_string_lossy().to_string()).await.unwrap();
        assert_eq!(logs.len(), 2);

        // Newest should be first
        assert!(logs[0].last_modified >= logs[1].last_modified);
    }

    #[tokio::test]
    async fn test_list_logs_file_size() {
        let dir = TempDir::new().unwrap();
        let logs_dir = setup_laravel_log_dir(dir.path());

        let content = "This is a test log entry with some content\n";
        fs::write(logs_dir.join("test.log"), content).unwrap();

        let logs = list_laravel_logs(dir.path().to_string_lossy().to_string()).await.unwrap();
        assert_eq!(logs[0].size, content.len() as u64);
    }

    // ─── read_laravel_log ──────────────────────────────
    #[tokio::test]
    async fn test_read_log_full_content() {
        let dir = TempDir::new().unwrap();
        let log_path = dir.path().join("test.log");

        let content = "[2024-01-01 12:00:00] local.ERROR: Something went wrong\nStack trace here\n[2024-01-01 12:01:00] local.INFO: All good\n";
        fs::write(&log_path, content).unwrap();

        let result = read_laravel_log(log_path.to_string_lossy().to_string(), 100).await;
        assert!(result.is_ok());
        assert!(result.unwrap().contains("Something went wrong"));
    }

    #[tokio::test]
    async fn test_read_log_last_lines() {
        let dir = TempDir::new().unwrap();
        let log_path = dir.path().join("test.log");

        let mut content = String::new();
        for i in 0..20 {
            content.push_str(&format!("[2024-01-01 00:00:00] local.INFO: Line {}\n", i));
        }
        fs::write(&log_path, content).unwrap();

        let result = read_laravel_log(log_path.to_string_lossy().to_string(), 5).await;
        assert!(result.is_ok());

        let output = result.unwrap();
        let lines: Vec<&str> = output.lines().collect();
        // Should have at most approximately 5 lines (might be slightly different due to log entry seeking)
        assert!(lines.len() <= 6); // a bit of slack for the seeking logic
    }

    #[tokio::test]
    async fn test_read_log_file_not_found() {
        let result = read_laravel_log("/nonexistent/path/to/log.log".to_string(), 10).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Log file not found"));
    }

    #[tokio::test]
    async fn test_read_log_empty_file() {
        let dir = TempDir::new().unwrap();
        let log_path = dir.path().join("empty.log");
        fs::write(&log_path, "").unwrap();

        let result = read_laravel_log(log_path.to_string_lossy().to_string(), 10).await;
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[tokio::test]
    async fn test_read_log_single_line() {
        let dir = TempDir::new().unwrap();
        let log_path = dir.path().join("single.log");
        fs::write(&log_path, "[2024-01-01 12:00:00] local.ERROR: Only line").unwrap();

        let result = read_laravel_log(log_path.to_string_lossy().to_string(), 10).await;
        assert!(result.is_ok());

        let output = result.unwrap();
        assert!(output.contains("Only line"));
    }

    #[tokio::test]
    async fn test_read_log_fewer_lines_than_requested() {
        let dir = TempDir::new().unwrap();
        let log_path = dir.path().join("short.log");
        fs::write(&log_path, "Line 1\nLine 2\nLine 3\n").unwrap();

        let result = read_laravel_log(log_path.to_string_lossy().to_string(), 100).await;
        assert!(result.is_ok());

        let output = result.unwrap();
        assert!(output.contains("Line 1"));
        assert!(output.contains("Line 3"));
    }

    // ─── LogFile struct ────────────────────────────────
    #[test]
    fn test_log_file_serialization() {
        let log = LogFile {
            name: "test.log".to_string(),
            path: "/var/log/test.log".to_string(),
            size: 1024,
            last_modified: 1704067200,
        };

        let json = serde_json::to_string(&log).unwrap();
        assert!(json.contains("test.log"));
        assert!(json.contains("1024"));
    }
}

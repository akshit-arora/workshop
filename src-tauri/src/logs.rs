use serde::Serialize;
use std::fs;
use std::path::Path;

#[derive(Serialize)]
pub struct LogFile {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub last_modified: u64,
}

#[tauri::command]
pub async fn list_laravel_logs(project_path: String) -> Result<Vec<LogFile>, String> {
    let logs_dir = Path::new(&project_path).join("storage").join("logs");

    if !logs_dir.exists() {
        return Ok(Vec::new());
    }

    let mut log_files = Vec::new();
    if let Ok(entries) = fs::read_dir(logs_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("log") {
                let metadata = entry.metadata().map_err(|e| e.to_string())?;
                let last_modified = metadata
                    .modified()
                    .map(|t| {
                        t.duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_secs()
                    })
                    .unwrap_or(0);

                log_files.push(LogFile {
                    name: entry.file_name().to_string_lossy().into_owned(),
                    path: path.to_string_lossy().into_owned(),
                    size: metadata.len(),
                    last_modified,
                });
            }
        }
    }

    // Sort by last modified descending
    log_files.sort_by(|a, b| b.last_modified.cmp(&a.last_modified));

    Ok(log_files)
}

#[tauri::command]
pub async fn read_laravel_log(file_path: String, last_lines: usize) -> Result<String, String> {
    use std::fs::File;
    use std::io::{Read, Seek, SeekFrom};

    let path = Path::new(&file_path);
    if !path.exists() {
        return Err("Log file not found".to_string());
    }

    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let metadata = file.metadata().map_err(|e| e.to_string())?;
    let file_size = metadata.len();

    // If file is small, just read it all
    if file_size < 1024 * 512 {
        // 512KB
        let mut content = String::new();
        file.read_to_string(&mut content)
            .map_err(|e| e.to_string())?;
        let lines: Vec<&str> = content.lines().collect();
        if lines.len() <= last_lines {
            return Ok(content);
        } else {
            let start = lines.len() - last_lines;
            return Ok(lines[start..].join("\n"));
        }
    }

    // For larger files, read the last 1MB and find the lines
    let read_size = std::cmp::min(file_size, 1024 * 1024); // Read up to 1MB
    let mut buffer = vec![0u8; read_size as usize];
    file.seek(SeekFrom::End(-(read_size as i64)))
        .map_err(|e| e.to_string())?;
    file.read_exact(&mut buffer).map_err(|e| e.to_string())?;

    let content = String::from_utf8_lossy(&buffer);
    let lines: Vec<&str> = content.lines().collect();

    if lines.len() <= last_lines {
        Ok(content.into_owned())
    } else {
        let mut start = lines.len() - last_lines;

        // Seek backward to find the start of the log entry (line starting with '[')
        // to ensure we don't start with an orphaned stack trace.
        while start > 0 && !lines[start].trim_start().starts_with('[') {
            start -= 1;
        }

        Ok(lines[start..].join("\n"))
    }
}

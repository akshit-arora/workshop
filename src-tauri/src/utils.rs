use std::path::PathBuf;

/// Get the absolute path to the projects database file.
/// This ensures the database is stored in a persistent location
/// that works in both development and production builds.
pub fn get_db_path() -> Result<PathBuf, String> {
    // Get the app data directory
    let app_data_dir =
        dirs::data_local_dir().ok_or_else(|| "Failed to get app data directory".to_string())?;

    // Create the workshop app directory
    let workshop_dir = app_data_dir.join("dev.akshitarora.workshop");

    // Ensure the directory exists
    std::fs::create_dir_all(&workshop_dir)
        .map_err(|e| format!("Failed to create app data directory: {}", e))?;

    // Return the full path to the database file
    Ok(workshop_dir.join("projects.db"))
}

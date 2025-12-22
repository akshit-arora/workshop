use crate::models::project::{Project, ProjectStatus};
use rusqlite::{params, Connection, Result};
use std::path::PathBuf;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum DatabaseError {
    #[error("Rusqlite error: {0}")]
    RusqliteError(#[from] rusqlite::Error),
}

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn new(path: PathBuf) -> Result<Self, DatabaseError> {
        let conn = Connection::open(path)?;
        conn.execute(
            "CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                location TEXT,
                status TEXT,
                created_at TEXT,
                updated_at TEXT,
                db_config TEXT
            )",
            [],
        )?;

        // Migration for existing databases
        let mut needs_migration = false;
        {
            let mut stmt = conn.prepare("PRAGMA table_info(projects)")?;
            let rows = stmt.query_map([], |row| Ok(row.get::<_, String>(1)?))?;
            let columns: Vec<String> = rows.filter_map(|r| r.ok()).collect();
            if !columns.contains(&"db_config".to_string()) {
                needs_migration = true;
            }
        }

        if needs_migration {
            conn.execute("ALTER TABLE projects ADD COLUMN db_config TEXT", [])?;
        }
        Ok(Database { conn })
    }

    pub fn create_project(&self, project: &Project) -> Result<(), DatabaseError> {
        self.conn.execute(
            "INSERT INTO projects (id, name, description, location, status, created_at, updated_at, db_config)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                project.id,
                project.name,
                project.description,
                project.location,
                format!("{:?}", project.status),
                project.created_at,
                project.updated_at,
                project.db_config
            ],
        )?;
        Ok(())
    }

    pub fn get_projects(&self) -> Result<Vec<Project>, DatabaseError> {
        let mut stmt = self.conn.prepare("SELECT * FROM projects")?;
        let project_iter = stmt.query_map([], |row| {
            Ok(Project {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                location: row.get(3)?,
                status: match row.get::<_, String>(4)?.as_str() {
                    "InProgress" => ProjectStatus::InProgress,
                    "Completed" => ProjectStatus::Completed,
                    "InitialStage" => ProjectStatus::InitialStage,
                    "OnHold" => ProjectStatus::OnHold,
                    "Abandoned" => ProjectStatus::Abandoned,
                    _ => ProjectStatus::InProgress,
                },
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
                db_config: row.get(7).unwrap_or(None),
            })
        })?;

        let mut projects = Vec::new();
        for project in project_iter {
            projects.push(project?);
        }
        Ok(projects)
    }

    pub fn update_project(&self, id: &str, updates: &Project) -> Result<(), DatabaseError> {
        self.conn.execute(
            "UPDATE projects
             SET name = ?1, description = ?2, location = ?3, status = ?4, updated_at = ?5, db_config = ?6
             WHERE id = ?7",
            params![
                updates.name,
                updates.description,
                updates.location,
                format!("{:?}", updates.status),
                updates.updated_at,
                updates.db_config,
                id
            ],
        )?;
        Ok(())
    }

    pub fn delete_project(&self, id: &str) -> Result<bool, DatabaseError> {
        let affected = self
            .conn
            .execute("DELETE FROM projects WHERE id = ?1", params![id])?;
        Ok(affected > 0)
    }

    pub fn get_project_by_id(&self, id: &str) -> Result<Option<Project>, DatabaseError> {
        let mut stmt = self.conn.prepare("SELECT * FROM projects WHERE id = ?1")?;
        let mut rows = stmt.query(params![id])?;
        if let Some(row) = rows.next()? {
            let project = Project {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                location: row.get(3)?,
                status: match row.get::<_, String>(4)?.as_str() {
                    "InProgress" => ProjectStatus::InProgress,
                    "Completed" => ProjectStatus::Completed,
                    "InitialStage" => ProjectStatus::InitialStage,
                    "OnHold" => ProjectStatus::OnHold,
                    "Abandoned" => ProjectStatus::Abandoned,
                    _ => ProjectStatus::InProgress,
                },
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
                db_config: row.get(7).unwrap_or(None),
            };
            Ok(Some(project))
        } else {
            Ok(None)
        }
    }
}

use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::Utc;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: String,
    pub location: String,
    pub status: ProjectStatus,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum ProjectStatus {
    InProgress,
    Completed,
    InitialStage,
    OnHold,
    Abandoned,
}

impl Project {
    pub fn new(name: String, description: String, location: String, status: ProjectStatus) -> Self {
        let now = Utc::now().to_rfc3339();
        Project {
            id: Uuid::new_v4().to_string(),
            name,
            description,
            location,
            status,
            created_at: now.clone(),
            updated_at: now,
        }
    }
}
use std::sync::{Mutex, mpsc::Sender};

pub struct AppState {
    pub project_event_tx: Mutex<Sender<String>>,
}

use crate::db_factory::DbBackend;
use portable_pty::MasterPty;
use std::collections::HashMap;
use std::io::Write;
use std::sync::{mpsc::Sender, Mutex};

pub struct DbConnectionManager {
    pub connections: Mutex<HashMap<String, Box<dyn DbBackend + Send>>>,
}

pub struct TerminalSession {
    pub writer: Box<dyn Write + Send>,
    pub master: Box<dyn MasterPty + Send>,
}

pub struct AppState {
    pub project_event_tx: Mutex<Sender<String>>,
    // Map of window/tab ID to TerminalSession
    pub terminal_sessions: Mutex<HashMap<String, TerminalSession>>,
}

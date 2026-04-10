use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter, Runtime};

pub struct TerminalSession {
    pub master: Box<dyn MasterPty + Send>,
    pub writer: Box<dyn Write + Send>,
}

pub struct TerminalState {
    pub sessions: Arc<Mutex<HashMap<String, Arc<Mutex<TerminalSession>>>>>,
}

impl Default for TerminalState {
    fn default() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

#[tauri::command]
pub async fn create_terminal<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, TerminalState>,
    id: String,
    cwd: String,
) -> Result<u32, String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let default_shell = if cfg!(windows) {
        "powershell.exe"
    } else {
        "zsh"
    };
    let mut cmd = CommandBuilder::new(default_shell);
    cmd.cwd(cwd);

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    let pid = child.process_id().unwrap_or(0);

    // Important: Drop the slave handle in the parent process 
    // so that EOF can be correctly detected when the child exits.
    drop(pair.slave);

    let master = pair.master;
    let mut reader = master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = master.take_writer().map_err(|e| e.to_string())?;

    {
        let mut sessions = state.sessions.lock().unwrap();
        sessions.insert(
            id.clone(),
            Arc::new(Mutex::new(TerminalSession {
                master,
                writer,
            })),
        );
    }

    let app_clone = app;
    let id_event = format!("terminal-data-{}", id);

    thread::spawn(move || {
        let mut buffer = [0u8; 4096];
        loop {
            match reader.read(&mut buffer) {
                Ok(n) if n > 0 => {
                    let data = String::from_utf8_lossy(&buffer[..n]).to_string();
                    let _ = app_clone.emit(&id_event, data);
                }
                Ok(_) => break,
                Err(e) => {
                    eprintln!("Error reading from PTY: {}", e);
                    break;
                }
            }
        }
    });

    Ok(pid)
}

#[tauri::command]
pub fn write_to_terminal(
    state: tauri::State<'_, TerminalState>,
    id: String,
    data: String,
) -> Result<(), String> {
    let sessions = state.sessions.lock().unwrap();
    if let Some(session_mutex) = sessions.get(&id) {
        let mut session = session_mutex.lock().unwrap();
        let buf = data.as_bytes();
        session.writer.write_all(buf).map_err(|e| e.to_string())?;
        session.writer.flush().map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Terminal session not found".to_string())
    }
}

#[tauri::command]
pub fn resize_terminal(
    state: tauri::State<'_, TerminalState>,
    id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    let sessions = state.sessions.lock().unwrap();
    if let Some(session_mutex) = sessions.get(&id) {
        let session = session_mutex.lock().unwrap();
        session
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err("Terminal session not found".to_string())
    }
}

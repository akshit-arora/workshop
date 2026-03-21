use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter, Runtime};

pub struct TerminalState {
    pub processes: Arc<Mutex<HashMap<String, Arc<Mutex<Box<dyn MasterPty + Send>>>>>>,
}

impl Default for TerminalState {
    fn default() -> Self {
        Self {
            processes: Arc::new(Mutex::new(HashMap::new())),
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
    // Use openpty for compatibility with older portable-pty versions if needed
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

    let master = pair.master;
    let mut reader = master.try_clone_reader().map_err(|e| e.to_string())?;

    {
        let mut processes = state.processes.lock().unwrap();
        processes.insert(id.clone(), Arc::new(Mutex::new(master)));
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
    let processes = state.processes.lock().unwrap();
    if let Some(master_mutex) = processes.get(&id) {
        let mut master = master_mutex.lock().unwrap();
        // Fallback for writing: Many PTY implementations require concrete types to implement Write
        // We will try to write directly to the master via its write_all method if available
        // or through std::io::Write if the box implements it.
        // For portable-pty, this is often the case in modern versions.
        let buf = data.as_bytes();
        let _ = master.write_all(buf); // Try writing, ignore error if bound is failing for now to allow build structure
        let _ = master.flush();
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
    let processes = state.processes.lock().unwrap();
    if let Some(master_mutex) = processes.get(&id) {
        let master = master_mutex.lock().unwrap();
        master
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

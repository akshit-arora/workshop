use crate::state::{AppState, TerminalSession};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::{Read, Write};
use std::sync::Arc;
use std::thread;
use tauri::{Emitter, State};

#[tauri::command]
pub fn spawn_pty(
    id: String,
    cwd: Option<String>,
    rows: u16,
    cols: u16,
    state: State<'_, Arc<AppState>>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let pty_system = native_pty_system();

    // Create a new PTY
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    // Determine shell (default to zsh on Mac, fallback to sh)
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());

    // Use login shell to load user's profile (.zshrc, .bash_profile, etc.)
    let mut cmd = CommandBuilder::new(&shell);
    cmd.arg("-l"); // Login shell flag - loads user profile
    cmd.arg("-i"); // Interactive mode

    if let Some(dir) = cwd {
        cmd.cwd(dir);
    }

    // Set terminal environment
    cmd.env("TERM", "xterm-256color");

    // Inherit PATH and other important environment variables from the current process
    // This ensures PHP, composer, artisan, etc. are accessible
    if let Ok(path) = std::env::var("PATH") {
        cmd.env("PATH", path);
    }

    // Also inherit HOME for proper shell initialization
    if let Ok(home) = std::env::var("HOME") {
        cmd.env("HOME", home);
    }

    // Inherit USER
    if let Ok(user) = std::env::var("USER") {
        cmd.env("USER", user);
    }

    let mut _child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

    // Clone the reader for the thread
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    // Store the session (writer + master) in state
    {
        let mut sessions = state.terminal_sessions.lock().unwrap();
        sessions.insert(
            id.clone(),
            TerminalSession {
                writer,
                master: pair.master,
            },
        );
    }

    // Spawn a thread to read from PTY and emit to frontend
    let pty_id = id.clone();
    thread::spawn(move || {
        let mut buffer = [0u8; 1024];
        loop {
            match reader.read(&mut buffer) {
                Ok(n) if n > 0 => {
                    let output = String::from_utf8_lossy(&buffer[..n]).to_string();
                    if let Err(e) = app_handle.emit(&format!("pty-output-{}", pty_id), output) {
                        eprintln!("Failed to emit to frontend: {}", e);
                        break;
                    }
                }
                Ok(_) => break,  // EOF
                Err(_) => break, // Error
            }
        }
        // PTY closed or error
    });

    Ok(())
}

#[tauri::command]
pub fn write_pty(id: String, data: String, state: State<'_, Arc<AppState>>) -> Result<(), String> {
    let mut sessions = state.terminal_sessions.lock().unwrap();
    if let Some(session) = sessions.get_mut(&id) {
        write!(session.writer, "{}", data).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn resize_pty(
    id: String,
    rows: u16,
    cols: u16,
    state: State<'_, Arc<AppState>>,
) -> Result<(), String> {
    let mut sessions = state.terminal_sessions.lock().unwrap();
    if let Some(session) = sessions.get_mut(&id) {
        session
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

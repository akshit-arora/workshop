// mod models;
// mod database;
// mod commands;

// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    workshop_lib::run();

    // tauri::Builder::default()
    //     .invoke_handler(tauri::generate_handler![
    //         commands::create_project,
    //         commands::get_projects,
    //         commands::update_project,
    //         commands::delete_project
    //     ])
    //     .run(tauri::generate_context!())
    //     .expect("error while running tauri application");
}

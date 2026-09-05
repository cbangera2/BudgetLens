//! BudgetLens desktop shell (Tauri 2, desktop-only v1).
//! Phase 1: window + updater + dialogs. No fs/shell access.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .run(tauri::generate_context!())
        .expect("error while running BudgetLens");
}

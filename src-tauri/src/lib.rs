#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Window modes (compact / fullscreen / dissolve) are driven from JS via
    // `@tauri-apps/api/window`. No custom commands required.
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

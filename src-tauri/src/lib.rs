use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Window modes (compact / fullscreen / dissolve) are driven from JS via
    // `@tauri-apps/api/window`. No custom commands required.
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let icon = tauri::include_image!("icons/128x128.png");
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_icon(icon);
            }
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Regular);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

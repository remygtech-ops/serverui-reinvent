mod backend;
mod keyvault;

use std::path::PathBuf;
use std::sync::Arc;

use backend::{BackendManager, RuntimeConfig};
use tauri::Manager;

/// Sole custom IPC surface for the WebView. Returns runtime status for the local Go API.
/// Does not accept arguments and never exposes shell/filesystem capabilities.
#[tauri::command]
fn get_runtime_config(state: tauri::State<'_, Arc<BackendManager>>) -> RuntimeConfig {
    state.config()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let manager = BackendManager::new();
    let manager_for_setup = Arc::clone(&manager);
    let manager_for_exit = Arc::clone(&manager);

    #[cfg(feature = "msix-store")]
    let builder = tauri::Builder::default().plugin(tauri_plugin_process::init());

    // GitHub Releases updater is for sideload / NSIS / MSI channels only.
    // Microsoft Store submissions must not ship an external updater.
    #[cfg(not(feature = "msix-store"))]
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .manage(manager)
        .invoke_handler(tauri::generate_handler![get_runtime_config])
        .setup(move |app| {
            let resource_dir = app
                .path()
                .resource_dir()
                .unwrap_or_else(|_| std::env::current_dir().unwrap_or_default());
            let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));

            let app_dir = if manifest_dir.join("tauri.conf.json").is_file() {
                manifest_dir
            } else {
                resource_dir
            };

            let data_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| {
                    dirs_fallback_app_data()
                });

            // Windows only: small purple badge on the taskbar button (not on the window icon).
            #[cfg(target_os = "windows")]
            {
                if let Some(window) = app.get_webview_window("main") {
                    apply_taskbar_badge(&window);
                    let badge_window = window.clone();
                    window.on_window_event(move |event| {
                        // Re-apply when the window regains focus, in case the taskbar button
                        // was not ready yet at start-up or was recreated by Explorer.
                        if let tauri::WindowEvent::Focused(true) = event {
                            apply_taskbar_badge(&badge_window);
                        }
                    });
                }
            }

            let mgr = Arc::clone(&manager_for_setup);
            std::thread::spawn(move || {
                if let Err(_err) = mgr.start(&app_dir, &data_dir) {
                    // Do not print tokens or encryption keys.
                    eprintln!("serverui backend failed to start");
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building ServerUI desktop")
        .run(move |_app_handle, event| {
            match event {
                tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit => {
                    manager_for_exit.stop();
                }
                _ => {}
            }
        });
}

/// Purple overlay icon on the Windows taskbar button. Other platforms have no taskbar overlay.
#[cfg(target_os = "windows")]
fn apply_taskbar_badge(window: &tauri::WebviewWindow) {
    const BADGE: &[u8] = include_bytes!("../icons/badge-purple.png");
    if let Ok(badge) = tauri::image::Image::from_bytes(BADGE) {
        let _ = window.set_overlay_icon(Some(badge));
    }
}

fn dirs_fallback_app_data() -> PathBuf {
    // Last-resort path if Tauri PathResolver fails. Prefer identifier-shaped
    // Application Support / APPDATA / XDG locations without requiring extra crates.
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    if cfg!(target_os = "macos") {
        home.join("Library/Application Support/com.serverui.desktop")
    } else if cfg!(target_os = "windows") {
        std::env::var_os("APPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join("AppData/Roaming"))
            .join("com.serverui.desktop")
    } else {
        std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join(".local/share"))
            .join("com.serverui.desktop")
    }
}

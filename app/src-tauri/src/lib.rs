mod actions;
mod apps;
mod debuglog;
mod flash;
mod frontmost;
mod hotkeys;
mod mic;
mod permissions;
mod plugins;
mod serial;
mod stats;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::Manager;
use tauri_plugin_autostart::MacosLauncher;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // Hidden diagnostics hook: `open -n <app> --args --debug-mic-toggle`
            if args.iter().any(|a| a == "--debug-mic-toggle") {
                let state = mic::toggle_mute();
                debuglog::log(&format!("debug-mic-toggle → {:?}", state.map(|s| (s.muted, s.volume))));
                return;
            }
            if args.iter().any(|a| a == "--debug-mic-state") {
                let state = mic::get_state();
                debuglog::log(&format!("debug-mic-state → {:?}", state.map(|s| (s.muted, s.volume))));
                return;
            }
            // Run a hook exposed by the webview (window.__osd) and log the result
            if let Some(arg) = args.iter().find(|a| a.starts_with("--debug-js=")) {
                let call = arg.trim_start_matches("--debug-js=").to_string();
                // Safely-quoted JS string literal of the call, for the log echo
                let call_lit = serde_json::to_string(&call).unwrap_or_else(|_| "\"?\"".into());
                if let Some(window) = app.get_webview_window("main") {
                    let js = format!(
                        "Promise.resolve().then(() => window.__osd?.{call}).then(\
                         (r) => window.__TAURI_INTERNALS__.invoke('debug_log', {{ msg: 'debug-js ' + {call_lit} + ' → ' + JSON.stringify(r) }}),\
                         (e) => window.__TAURI_INTERNALS__.invoke('debug_log', {{ msg: 'debug-js ' + {call_lit} + ' FAILED: ' + String(e) }}))"
                    );
                    let _ = window.eval(&js);
                }
                return;
            }
            // Focus the existing window when a second launch happens
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_dialog::init())
        .manage(serial::SerialState::default())
        .manage(apps::IconCache::default())
        .manage(stats::StatsState::default())
        .invoke_handler(tauri::generate_handler![
            serial::serial_list,
            serial::serial_open,
            serial::serial_write_line,
            serial::serial_write_bytes,
            serial::serial_close,
            serial::serial_is_open,
            actions::execute_action,
            apps::list_apps,
            apps::app_icon,
            mic::mic_get_state,
            mic::mic_toggle,
            hotkeys::hotkey_record_start,
            hotkeys::hotkey_record_cancel,
            stats::sys_stats,
            stats::output_volume,
            stats::now_playing,
            permissions::check_accessibility,
            permissions::open_accessibility_settings,
            flash::bundled_firmware_version,
            flash::flash_firmware,
            flash::deck_recover,
            plugins::plugins_list,
            plugins::plugins_dir,
            plugins::plugin_write_files,
            plugins::plugin_fetch_registry,
            plugins::plugin_http,
            plugins::plugin_install,
            plugins::plugin_uninstall,
            plugins::plugins_open_dir,
            plugins::plugin_scaffold,
            debuglog::debug_log,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Tray: the companion keeps running (and routing key presses)
            // with the window closed.
            let show = MenuItem::with_id(app, "show", "Open Configurator", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            mic::spawn_watcher(app.handle().clone());
            frontmost::spawn_watcher(app.handle().clone());
            hotkeys::init(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            // Close hides to tray; the app (and action routing) keeps running
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

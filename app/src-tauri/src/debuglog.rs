//! Append-only diagnostics log for the packaged app (no console attached).

use std::io::Write;

/// Webview-side diagnostics land in the same file as Rust-side ones.
#[tauri::command]
pub fn debug_log(msg: String) {
    log(&format!("js: {msg}"));
}

pub fn log(msg: &str) {
    let path = std::env::temp_dir().join("osd-companion-debug.log");
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
    {
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        let _ = writeln!(f, "[{ts}] {msg}");
    }
}

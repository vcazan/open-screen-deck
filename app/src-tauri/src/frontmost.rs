//! Frontmost-application watcher — powers automatic profile switching.

use serde::Serialize;
use tauri::{AppHandle, Emitter};

#[derive(Serialize, Clone, PartialEq)]
struct FrontmostEvent {
    name: String,
}

#[cfg(target_os = "macos")]
fn frontmost_app() -> Option<String> {
    let out = std::process::Command::new("osascript")
        .args([
            "-e",
            "tell application \"System Events\" to get name of first application process whose frontmost is true",
        ])
        .output()
        .ok()?;
    let name = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if name.is_empty() {
        None
    } else {
        Some(name)
    }
}

#[cfg(target_os = "windows")]
fn frontmost_app() -> Option<String> {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW};
    unsafe {
        let hwnd: HWND = GetForegroundWindow();
        if hwnd.0.is_null() {
            return None;
        }
        let mut buf = [0u16; 512];
        let len = GetWindowTextW(hwnd, &mut buf);
        if len == 0 {
            return None;
        }
        Some(String::from_utf16_lossy(&buf[..len as usize]))
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn frontmost_app() -> Option<String> {
    None
}

/// Poll every 1.5 s; emit `frontmost-app` on change.
pub fn spawn_watcher(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last: Option<String> = None;
        loop {
            if let Some(name) = frontmost_app() {
                if last.as_deref() != Some(name.as_str()) {
                    last = Some(name.clone());
                    let _ = app.emit("frontmost-app", FrontmostEvent { name });
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(1500));
        }
    });
}

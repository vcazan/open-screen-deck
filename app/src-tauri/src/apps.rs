//! Installed-application discovery + icon extraction for the Launch action.

use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

#[derive(Serialize, Clone)]
pub struct AppInfo {
    pub name: String,
    pub path: String,
}

/// Icon cache: bundle path → data URL (sips conversion isn't free).
pub struct IconCache(pub Mutex<HashMap<String, String>>);

impl Default for IconCache {
    fn default() -> Self {
        Self(Mutex::new(HashMap::new()))
    }
}

#[cfg(target_os = "macos")]
fn app_dirs() -> Vec<PathBuf> {
    let mut dirs = vec![
        PathBuf::from("/Applications"),
        PathBuf::from("/Applications/Utilities"),
        PathBuf::from("/System/Applications"),
        PathBuf::from("/System/Applications/Utilities"),
    ];
    if let Ok(home) = std::env::var("HOME") {
        dirs.push(PathBuf::from(home).join("Applications"));
    }
    dirs
}

#[cfg(target_os = "macos")]
#[tauri::command]
pub fn list_apps() -> Vec<AppInfo> {
    let mut apps: Vec<AppInfo> = Vec::new();
    for dir in app_dirs() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("app") {
                if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                    if !stem.starts_with('.') {
                        apps.push(AppInfo {
                            name: stem.to_string(),
                            path: path.to_string_lossy().into_owned(),
                        });
                    }
                }
            }
        }
    }
    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    apps.dedup_by(|a, b| a.name == b.name);
    apps
}

#[cfg(target_os = "macos")]
fn find_icns(bundle: &Path) -> Option<PathBuf> {
    let resources = bundle.join("Contents/Resources");

    // Preferred: CFBundleIconFile from Info.plist
    let plist = bundle.join("Contents/Info.plist");
    if let Ok(out) = std::process::Command::new("plutil")
        .args(["-extract", "CFBundleIconFile", "raw", "-o", "-"])
        .arg(&plist)
        .output()
    {
        if out.status.success() {
            let mut name = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !name.is_empty() {
                if !name.ends_with(".icns") {
                    name.push_str(".icns");
                }
                let candidate = resources.join(&name);
                if candidate.exists() {
                    return Some(candidate);
                }
            }
        }
    }

    // Fallback: first .icns in Resources
    let entries = std::fs::read_dir(&resources).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) == Some("icns") {
            return Some(path);
        }
    }
    None
}

#[cfg(target_os = "macos")]
#[tauri::command]
pub fn app_icon(cache: tauri::State<'_, IconCache>, path: String) -> Result<String, String> {
    if let Some(hit) = cache.0.lock().unwrap().get(&path) {
        return Ok(hit.clone());
    }

    let icns = find_icns(Path::new(&path)).ok_or("no icon found")?;
    let tmp = std::env::temp_dir().join(format!(
        "osd-icon-{}.png",
        std::process::id() as u64 + rand_suffix()
    ));

    let status = std::process::Command::new("sips")
        .args(["-s", "format", "png", "-z", "128", "128"])
        .arg(&icns)
        .arg("--out")
        .arg(&tmp)
        .output()
        .map_err(|e| e.to_string())?;
    if !status.status.success() {
        return Err("icon conversion failed".into());
    }

    let bytes = std::fs::read(&tmp).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&tmp);
    let data_url = format!("data:image/png;base64,{}", base64_encode(&bytes));
    cache.0.lock().unwrap().insert(path, data_url.clone());
    Ok(data_url)
}

#[cfg(target_os = "macos")]
fn rand_suffix() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_nanos() as u64)
        .unwrap_or(0)
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn list_apps() -> Vec<AppInfo> {
    Vec::new()
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn app_icon(_cache: tauri::State<'_, IconCache>, _path: String) -> Result<String, String> {
    Err("app icons not supported on this platform".into())
}

fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let b = [
            chunk[0],
            chunk.get(1).copied().unwrap_or(0),
            chunk.get(2).copied().unwrap_or(0),
        ];
        let n = (u32::from(b[0]) << 16) | (u32::from(b[1]) << 8) | u32::from(b[2]);
        out.push(TABLE[(n >> 18) as usize & 63] as char);
        out.push(TABLE[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 {
            TABLE[(n >> 6) as usize & 63] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            TABLE[n as usize & 63] as char
        } else {
            '='
        });
    }
    out
}

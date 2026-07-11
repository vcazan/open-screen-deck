//! Plugin loader — reads plugin folders from the app data directory and
//! hands manifest + module source to the webview, which evaluates them.
//!
//! Layout: `<app-data>/plugins/<id>/manifest.json` + `main.js`.
//! Trust model: plugins run with full webview access — install only code
//! you trust, same as any desktop extension system.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

fn plugins_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("plugins");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Refuse ids/filenames that could escape the plugins directory.
fn safe_name(name: &str) -> Result<(), String> {
    if name.is_empty()
        || name.contains("..")
        || name.contains('/')
        || name.contains('\\')
        || name.starts_with('.')
    {
        return Err(format!("invalid plugin file name: {name}"));
    }
    Ok(())
}

#[derive(Serialize, Clone)]
pub struct LoadedPlugin {
    pub id: String,
    pub manifest: serde_json::Value,
    pub code: String,
    pub dir: String,
}

#[tauri::command]
pub fn plugins_dir(app: tauri::AppHandle) -> Result<String, String> {
    Ok(plugins_root(&app)?.to_string_lossy().to_string())
}

#[derive(Deserialize)]
pub struct PluginFile {
    pub name: String,
    pub content: String,
}

fn http_get_text(url: &str) -> Result<String, String> {
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err(format!("unsupported registry URL: {url}"));
    }
    ureq::get(url)
        .timeout(std::time::Duration::from_secs(15))
        .call()
        .map_err(|e| e.to_string())?
        .into_string()
        .map_err(|e| e.to_string())
}

/// Fetch a plugin registry index. Runs in Rust so any host works — no
/// webview CORS requirements on community registries.
#[tauri::command]
pub fn plugin_fetch_registry(url: String) -> Result<serde_json::Value, String> {
    let text = http_get_text(&url)?;
    serde_json::from_str(&text).map_err(|e| format!("registry is not valid JSON: {e}"))
}

/// Store install: download every listed file and write it into the plugin
/// folder. Downloads happen in Rust (see plugin_fetch_registry).
#[tauri::command]
pub fn plugin_install(
    app: tauri::AppHandle,
    id: String,
    base: String,
    files: Vec<String>,
) -> Result<(), String> {
    safe_name(&id)?;
    if files.is_empty() {
        return Err("plugin lists no files".into());
    }
    let base = base.trim_end_matches('/');
    // Download everything first — a failed fetch must not leave a half plugin
    let mut contents = Vec::new();
    for name in &files {
        safe_name(name)?;
        contents.push((name.clone(), http_get_text(&format!("{base}/{name}"))?));
    }
    let dir = plugins_root(&app)?.join(&id);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    for (name, content) in &contents {
        std::fs::write(dir.join(name), content).map_err(|e| e.to_string())?;
    }
    crate::debuglog::log(&format!("plugin installed: {id} ({} files)", files.len()));
    Ok(())
}

/// Manual install path: the webview hands file contents to be written.
#[tauri::command]
pub fn plugin_write_files(
    app: tauri::AppHandle,
    id: String,
    files: Vec<PluginFile>,
) -> Result<(), String> {
    safe_name(&id)?;
    let dir = plugins_root(&app)?.join(&id);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    for f in &files {
        safe_name(&f.name)?;
        std::fs::write(dir.join(&f.name), &f.content).map_err(|e| e.to_string())?;
    }
    crate::debuglog::log(&format!("plugin installed: {id} ({} files)", files.len()));
    Ok(())
}

#[tauri::command]
pub fn plugin_uninstall(app: tauri::AppHandle, id: String) -> Result<(), String> {
    safe_name(&id)?;
    let dir = plugins_root(&app)?.join(&id);
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    crate::debuglog::log(&format!("plugin uninstalled: {id}"));
    Ok(())
}

#[tauri::command]
pub fn plugins_open_dir(app: tauri::AppHandle) -> Result<(), String> {
    let dir = plugins_root(&app)?;
    #[cfg(target_os = "macos")]
    let opener = "open";
    #[cfg(target_os = "windows")]
    let opener = "explorer";
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let opener = "xdg-open";
    std::process::Command::new(opener)
        .arg(&dir)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Developer tool: scaffold a working plugin template and reveal it.
#[tauri::command]
pub fn plugin_scaffold(app: tauri::AppHandle, id: String) -> Result<String, String> {
    safe_name(&id)?;
    let dir = plugins_root(&app)?.join(&id);
    if dir.exists() {
        return Err(format!("a plugin named \"{id}\" already exists"));
    }
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let manifest = format!(
        "{{\n  \"id\": \"{id}\",\n  \"name\": \"{id}\",\n  \"version\": \"0.1.0\",\n  \"description\": \"My Open Screen Deck plugin.\",\n  \"main\": \"main.js\"\n}}\n"
    );
    let main = format!(
        r#"// {id} — Open Screen Deck plugin.
// Edit, then Settings → Plugins → Reload to pick up changes.

export function activate(api) {{
  api.registerAction({{
    type: 'hello',
    label: 'Hello ({id})',
    hint: 'Says hello on the protocol console and paints the key.',
    fields: [
      {{ key: 'message', label: 'Message', placeholder: 'Hello from my plugin!' }},
    ],
    execute(settings, ctx) {{
      ctx.log(settings.message || 'Hello from {id}!');
      ctx.setKeyFace(ctx.slot, {{ label: 'HI', sublabel: '{id}', bg: 0x1c73 }});
    }},
  }});

  api.log('{id} ready');
}}
"#
    );
    std::fs::write(dir.join("manifest.json"), manifest).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("main.js"), main).map_err(|e| e.to_string())?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn plugins_list(app: tauri::AppHandle) -> Result<Vec<LoadedPlugin>, String> {
    let dir = plugins_root(&app)?;
    let mut out = Vec::new();
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Ok(out);
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let manifest_path = path.join("manifest.json");
        let Ok(raw) = std::fs::read_to_string(&manifest_path) else {
            continue;
        };
        let Ok(manifest) = serde_json::from_str::<serde_json::Value>(&raw) else {
            crate::debuglog::log(&format!("plugin {path:?}: bad manifest.json"));
            continue;
        };
        let main = manifest["main"].as_str().unwrap_or("main.js");
        let Ok(code) = std::fs::read_to_string(path.join(main)) else {
            crate::debuglog::log(&format!("plugin {path:?}: missing {main}"));
            continue;
        };
        let id = manifest["id"]
            .as_str()
            .map(str::to_string)
            .unwrap_or_else(|| entry.file_name().to_string_lossy().to_string());
        out.push(LoadedPlugin {
            id,
            manifest,
            code,
            dir: path.to_string_lossy().to_string(),
        });
    }
    Ok(out)
}

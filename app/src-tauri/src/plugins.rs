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
    /// SVG icon source (manifest `icon` file), if the plugin ships one
    pub icon: Option<String>,
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

#[derive(Serialize)]
pub struct PluginHttpResult {
    pub status: u16,
    pub body: String,
}

/// HTTP for plugins (`ctx.fetch`). Runs in Rust because the webview blocks
/// plain-http and CORS-less endpoints — exactly what Hue bridges, local
/// webhooks, and most home-automation targets are.
#[tauri::command]
pub fn plugin_http(
    method: String,
    url: String,
    headers: Option<std::collections::HashMap<String, String>>,
    body: Option<String>,
) -> Result<PluginHttpResult, String> {
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err(format!("unsupported URL: {url}"));
    }
    let mut req = ureq::request(&method.to_uppercase(), &url)
        .timeout(std::time::Duration::from_secs(15));
    if let Some(headers) = headers {
        for (k, v) in &headers {
            req = req.set(k, v);
        }
    }
    let result = match body {
        Some(b) if !b.is_empty() => req.send_string(&b),
        _ => req.call(),
    };
    match result {
        Ok(resp) => {
            let status = resp.status();
            let body = resp.into_string().unwrap_or_default();
            Ok(PluginHttpResult { status, body })
        }
        // Non-2xx is still a response — plugins decide what it means
        Err(ureq::Error::Status(status, resp)) => Ok(PluginHttpResult {
            status,
            body: resp.into_string().unwrap_or_default(),
        }),
        Err(e) => Err(e.to_string()),
    }
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
        "{{\n  \"id\": \"{id}\",\n  \"name\": \"{id}\",\n  \"version\": \"0.1.0\",\n  \"description\": \"My Open Screen Deck plugin.\",\n  \"main\": \"main.js\",\n  \"icon\": \"icon.svg\"\n}}\n"
    );
    // Starter icon — replace the glyph with something that says what the
    // plugin does (any 24×24 path works; MDI is a good source).
    let icon = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 32 32">
  <rect x="-4" y="-4" width="32" height="32" rx="8" fill="#1a222c"/>
  <path d="M20.5,11H19V7C19,5.89 18.1,5 17,5H13V3.5A2.5,2.5 0 0,0 10.5,1A2.5,2.5 0 0,0 8,3.5V5H4A2,2 0 0,0 2,7V10.8H3.5C5,10.8 6.2,12 6.2,13.5C6.2,15 5,16.2 3.5,16.2H2V20A2,2 0 0,0 4,22H7.8V20.5C7.8,19 9,17.8 10.5,17.8C12,17.8 13.2,19 13.2,20.5V22H17A2,2 0 0,0 19,20V16H20.5A2.5,2.5 0 0,0 23,13.5A2.5,2.5 0 0,0 20.5,11Z" fill="#2fd4c4"/>
</svg>
"##;
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
    // Runs when the action is assigned to a key — paint your branded face.
    // ctx.setKeyImage(canvas) persists it; ctx.paintFace(canvas) streams a
    // live frame over it (great for data that changes).
    async onAssign(settings, ctx) {{
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d');
      g.fillStyle = '#16303a';
      g.fillRect(0, 0, 128, 128);
      g.fillStyle = '#2fd4c4';
      g.font = '700 20px system-ui';
      g.textAlign = 'center';
      g.fillText('HELLO', 64, 70);
      await ctx.setKeyImage(c);
    }},
    execute(settings, ctx) {{
      ctx.log(settings.message || 'Hello from {id}!');
    }},
  }});

  api.log('{id} ready');
}}
"#
    );
    std::fs::write(dir.join("manifest.json"), manifest).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("main.js"), main).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("icon.svg"), icon).map_err(|e| e.to_string())?;
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
        let icon = manifest["icon"]
            .as_str()
            .filter(|name| safe_name(name).is_ok() && name.ends_with(".svg"))
            .and_then(|name| std::fs::read_to_string(path.join(name)).ok());
        out.push(LoadedPlugin {
            id,
            manifest,
            code,
            dir: path.to_string_lossy().to_string(),
            icon,
        });
    }
    Ok(out)
}

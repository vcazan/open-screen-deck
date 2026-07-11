//! Host state providers for live tiles: CPU/RAM, output volume, now playing.

use serde::Serialize;
use std::process::Command;
use std::sync::Mutex;
use sysinfo::System;

#[derive(Serialize, Clone, Copy)]
pub struct SysStats {
    pub cpu_pct: f32,
    pub mem_pct: f32,
}

// sysinfo needs two samples for CPU% — keep one System alive between calls
pub struct StatsState(Mutex<System>);

impl Default for StatsState {
    fn default() -> Self {
        Self(Mutex::new(System::new()))
    }
}

#[tauri::command]
pub fn sys_stats(state: tauri::State<StatsState>) -> Result<SysStats, String> {
    let mut sys = state.0.lock().map_err(|e| e.to_string())?;
    sys.refresh_cpu_usage();
    sys.refresh_memory();
    let cpu_pct = sys.global_cpu_usage();
    let total = sys.total_memory().max(1);
    let mem_pct = (sys.used_memory() as f64 / total as f64 * 100.0) as f32;
    Ok(SysStats { cpu_pct, mem_pct })
}

#[tauri::command]
pub fn output_volume() -> Result<Option<i32>, String> {
    #[cfg(target_os = "macos")]
    {
        let out = Command::new("osascript")
            .args(["-e", "output volume of (get volume settings)"])
            .output()
            .map_err(|e| e.to_string())?;
        let text = String::from_utf8_lossy(&out.stdout);
        return Ok(text.trim().parse::<i32>().ok());
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(None)
    }
}

#[derive(Serialize, Clone)]
pub struct NowPlaying {
    pub title: String,
    pub artist: String,
    pub app: String,
}

#[cfg(target_os = "macos")]
fn player_track(app: &str) -> Option<NowPlaying> {
    // Only query players that are already running — never launch them
    let script = format!(
        "if application \"{app}\" is running then\n\
           tell application \"{app}\"\n\
             if player state is playing then\n\
               return (name of current track) & \"\\n\" & (artist of current track)\n\
             end if\n\
           end tell\n\
         end if"
    );
    let out = Command::new("osascript")
        .args(["-e", &script])
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&out.stdout);
    let mut lines = text.trim().splitn(2, '\n');
    let title = lines.next()?.trim().to_string();
    if title.is_empty() {
        return None;
    }
    let artist = lines.next().unwrap_or("").trim().to_string();
    Some(NowPlaying {
        title,
        artist,
        app: app.to_string(),
    })
}

#[tauri::command]
pub fn now_playing() -> Result<Option<NowPlaying>, String> {
    #[cfg(target_os = "macos")]
    {
        Ok(player_track("Spotify").or_else(|| player_track("Music")))
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(None)
    }
}

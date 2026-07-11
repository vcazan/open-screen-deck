//! Microphone state provider — real input mute status, polled from the OS.
//!
//! macOS: system input volume via osascript (0 == muted). Any app or the OS
//! changing it is picked up by the poller, so key faces show true status.
//! Windows: default capture endpoint mute via WASAPI.

use serde::Serialize;
use std::sync::atomic::{AtomicI32, Ordering};
use tauri::{AppHandle, Emitter};

/// Last input volume seen before muting, so toggle can restore it (macOS).
static SAVED_VOLUME: AtomicI32 = AtomicI32::new(75);

#[derive(Serialize, Clone, Copy, PartialEq)]
pub struct MicState {
    pub muted: bool,
    pub volume: i32,
}

#[cfg(target_os = "macos")]
pub fn get_state() -> Result<MicState, String> {
    let out = std::process::Command::new("osascript")
        .args(["-e", "input volume of (get volume settings)"])
        .output()
        .map_err(|e| e.to_string())?;
    let volume: i32 = String::from_utf8_lossy(&out.stdout)
        .trim()
        .parse()
        .map_err(|_| "could not read input volume".to_string())?;
    Ok(MicState {
        muted: volume == 0,
        volume,
    })
}

#[cfg(target_os = "macos")]
pub fn toggle_mute() -> Result<MicState, String> {
    let current = get_state()?;
    let target = if current.muted {
        SAVED_VOLUME.load(Ordering::Relaxed).max(10)
    } else {
        SAVED_VOLUME.store(current.volume, Ordering::Relaxed);
        0
    };
    std::process::Command::new("osascript")
        .args(["-e", &format!("set volume input volume {target}")])
        .status()
        .map_err(|e| e.to_string())?;
    get_state()
}

#[cfg(target_os = "windows")]
pub fn get_state() -> Result<MicState, String> {
    windows_impl::with_endpoint(|vol| {
        let muted = unsafe { vol.GetMute() }
            .map_err(|e| e.to_string())?
            .as_bool();
        let level = unsafe { vol.GetMasterVolumeLevelScalar() }.map_err(|e| e.to_string())?;
        Ok(MicState {
            muted,
            volume: (level * 100.0) as i32,
        })
    })
}

#[cfg(target_os = "windows")]
pub fn toggle_mute() -> Result<MicState, String> {
    windows_impl::with_endpoint(|vol| {
        let muted = unsafe { vol.GetMute() }
            .map_err(|e| e.to_string())?
            .as_bool();
        unsafe { vol.SetMute(!muted, std::ptr::null()) }.map_err(|e| e.to_string())?;
        Ok(())
    })?;
    get_state()
}

#[cfg(target_os = "windows")]
mod windows_impl {
    use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
    use windows::Win32::Media::Audio::{
        eCapture, eConsole, IMMDeviceEnumerator, MMDeviceEnumerator,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED,
    };

    pub fn with_endpoint<T>(
        f: impl FnOnce(&IAudioEndpointVolume) -> Result<T, String>,
    ) -> Result<T, String> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let enumerator: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                    .map_err(|e| e.to_string())?;
            let device = enumerator
                .GetDefaultAudioEndpoint(eCapture, eConsole)
                .map_err(|e| e.to_string())?;
            let volume: IAudioEndpointVolume = device
                .Activate(CLSCTX_ALL, None)
                .map_err(|e| e.to_string())?;
            f(&volume)
        }
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn get_state() -> Result<MicState, String> {
    Err("mic control not supported on this platform".into())
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn toggle_mute() -> Result<MicState, String> {
    Err("mic control not supported on this platform".into())
}

#[tauri::command]
pub fn mic_get_state() -> Result<MicState, String> {
    get_state()
}

#[tauri::command]
pub fn mic_toggle() -> Result<MicState, String> {
    toggle_mute()
}

/// Background poller: emits `mic-state` whenever mute/volume changes.
pub fn spawn_watcher(app: AppHandle) {
    std::thread::spawn(move || {
        let mut last: Option<MicState> = None;
        let mut error_logged = false;
        loop {
            match get_state() {
                Ok(state) => {
                    error_logged = false;
                    if last != Some(state) {
                        last = Some(state);
                        crate::debuglog::log(&format!(
                            "mic watcher: muted={} volume={}",
                            state.muted, state.volume
                        ));
                        let _ = app.emit("mic-state", state);
                    }
                    if !state.muted && state.volume > 0 {
                        SAVED_VOLUME.store(state.volume, Ordering::Relaxed);
                    }
                }
                Err(e) => {
                    if !error_logged {
                        error_logged = true;
                        crate::debuglog::log(&format!("mic watcher error: {e}"));
                    }
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(700));
        }
    });
}

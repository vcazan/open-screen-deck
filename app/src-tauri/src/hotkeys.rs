//! Native hotkey recording — grabs keyboard events system-wide while the
//! recorder is armed, so combos that are already bound (screenshots,
//! Spotlight, app shortcuts) get captured *and swallowed* instead of firing.

use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter};

static APP: OnceLock<AppHandle> = OnceLock::new();
static RECORDING: AtomicBool = AtomicBool::new(false);
static GRAB_RUNNING: AtomicBool = AtomicBool::new(false);

#[derive(Default)]
struct Mods {
    cmd: bool,
    ctrl: bool,
    alt: bool,
    shift: bool,
}

static MODS: Mutex<Mods> = Mutex::new(Mods {
    cmd: false,
    ctrl: false,
    alt: false,
    shift: false,
});

#[derive(Serialize, Clone)]
struct RecordedEvent {
    chord: String,
}

pub fn init(app: AppHandle) {
    let _ = APP.set(app);
}

#[tauri::command]
pub fn hotkey_record_start() -> Result<(), String> {
    *MODS.lock().unwrap() = Mods::default();
    RECORDING.store(true, Ordering::SeqCst);
    ensure_grab_thread();
    Ok(())
}

#[tauri::command]
pub fn hotkey_record_cancel() {
    RECORDING.store(false, Ordering::SeqCst);
}

fn emit(event: &str, chord: String) {
    if let Some(app) = APP.get() {
        let _ = app.emit(event, RecordedEvent { chord });
    }
}

/// One persistent grab loop for the whole app lifetime; events pass through
/// untouched unless the recorder is armed. (Grab loops can't be torn down
/// cleanly, so we gate on the RECORDING flag instead.)
fn ensure_grab_thread() {
    if GRAB_RUNNING.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::spawn(|| {
        let result = rdev::grab(|event| {
            if !RECORDING.load(Ordering::SeqCst) {
                return Some(event);
            }
            match event.event_type {
                rdev::EventType::KeyPress(key) => {
                    if set_modifier(key, true) {
                        return None; // swallow while recording
                    }
                    if key == rdev::Key::Escape {
                        RECORDING.store(false, Ordering::SeqCst);
                        emit("hotkey-record-cancelled", String::new());
                        return None;
                    }
                    if let Some(name) = key_name(key) {
                        let chord = {
                            let m = MODS.lock().unwrap();
                            let mut parts: Vec<&str> = Vec::new();
                            if m.cmd {
                                parts.push("cmd");
                            }
                            if m.ctrl {
                                parts.push("ctrl");
                            }
                            if m.alt {
                                parts.push("alt");
                            }
                            if m.shift {
                                parts.push("shift");
                            }
                            let mut s = parts.join("+");
                            if !s.is_empty() {
                                s.push('+');
                            }
                            s.push_str(&name);
                            s
                        };
                        RECORDING.store(false, Ordering::SeqCst);
                        *MODS.lock().unwrap() = Mods::default();
                        crate::debuglog::log(&format!("hotkey recorded: {chord}"));
                        emit("hotkey-recorded", chord);
                    }
                    None // swallow — never let the bound shortcut fire
                }
                rdev::EventType::KeyRelease(key) => {
                    set_modifier(key, false);
                    None
                }
                _ => Some(event),
            }
        });
        GRAB_RUNNING.store(false, Ordering::SeqCst);
        if let Err(e) = result {
            RECORDING.store(false, Ordering::SeqCst);
            crate::debuglog::log(&format!("hotkey grab unavailable: {e:?}"));
            emit("hotkey-record-error", format!("{e:?}"));
        }
    });
}

/// Track modifier state; returns true when the key IS a modifier.
fn set_modifier(key: rdev::Key, down: bool) -> bool {
    use rdev::Key as K;
    let mut m = MODS.lock().unwrap();
    match key {
        K::MetaLeft | K::MetaRight => m.cmd = down,
        K::ControlLeft | K::ControlRight => m.ctrl = down,
        K::Alt | K::AltGr => m.alt = down,
        K::ShiftLeft | K::ShiftRight => m.shift = down,
        _ => return false,
    }
    true
}

fn key_name(key: rdev::Key) -> Option<String> {
    use rdev::Key as K;
    let name = match key {
        K::KeyA => "a",
        K::KeyB => "b",
        K::KeyC => "c",
        K::KeyD => "d",
        K::KeyE => "e",
        K::KeyF => "f",
        K::KeyG => "g",
        K::KeyH => "h",
        K::KeyI => "i",
        K::KeyJ => "j",
        K::KeyK => "k",
        K::KeyL => "l",
        K::KeyM => "m",
        K::KeyN => "n",
        K::KeyO => "o",
        K::KeyP => "p",
        K::KeyQ => "q",
        K::KeyR => "r",
        K::KeyS => "s",
        K::KeyT => "t",
        K::KeyU => "u",
        K::KeyV => "v",
        K::KeyW => "w",
        K::KeyX => "x",
        K::KeyY => "y",
        K::KeyZ => "z",
        K::Num0 => "0",
        K::Num1 => "1",
        K::Num2 => "2",
        K::Num3 => "3",
        K::Num4 => "4",
        K::Num5 => "5",
        K::Num6 => "6",
        K::Num7 => "7",
        K::Num8 => "8",
        K::Num9 => "9",
        K::F1 => "f1",
        K::F2 => "f2",
        K::F3 => "f3",
        K::F4 => "f4",
        K::F5 => "f5",
        K::F6 => "f6",
        K::F7 => "f7",
        K::F8 => "f8",
        K::F9 => "f9",
        K::F10 => "f10",
        K::F11 => "f11",
        K::F12 => "f12",
        K::Space => "space",
        K::Return => "enter",
        K::Tab => "tab",
        K::Backspace => "backspace",
        K::Delete => "delete",
        K::UpArrow => "up",
        K::DownArrow => "down",
        K::LeftArrow => "left",
        K::RightArrow => "right",
        K::Home => "home",
        K::End => "end",
        K::PageUp => "pageup",
        K::PageDown => "pagedown",
        K::Minus => "-",
        K::Equal => "=",
        K::Comma => ",",
        K::Dot => ".",
        K::Slash => "/",
        K::SemiColon => ";",
        K::Quote => "'",
        K::LeftBracket => "[",
        K::RightBracket => "]",
        K::BackSlash => "\\",
        K::BackQuote => "`",
        _ => return None,
    };
    Some(name.to_string())
}

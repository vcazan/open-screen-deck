//! Action executor — turns key presses into host-side effects.

use enigo::{Direction, Enigo, Key, Keyboard, Settings};
use serde::Deserialize;
use std::process::Command;

#[derive(Deserialize, Clone, Debug)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum KeyAction {
    /// Firmware-level HID key — the device types it itself; nothing to do here.
    Hid {
        code: u8,
    },
    /// Full hotkey chord like "cmd+shift+m", synthesized on the host.
    Hotkey {
        keys: String,
    },
    /// Launch an application or open a file.
    Launch {
        target: String,
    },
    OpenUrl {
        url: String,
    },
    Shell {
        command: String,
    },
    MicMute,
    Obs {
        request: serde_json::Value,
    },
    Multi {
        steps: Vec<KeyAction>,
        delay_ms: Option<u64>,
    },
}

#[tauri::command]
pub fn execute_action(action: KeyAction) -> Result<(), String> {
    crate::debuglog::log(&format!("execute_action: {action:?}"));
    let result = run(&action);
    if let Err(ref e) = result {
        crate::debuglog::log(&format!("execute_action FAILED: {e}"));
    }
    result
}

fn run(action: &KeyAction) -> Result<(), String> {
    match action {
        KeyAction::Hid { .. } => Ok(()), // handled by firmware fallback
        KeyAction::Hotkey { keys } => send_hotkey(keys),
        KeyAction::Launch { target } => launch(target),
        KeyAction::OpenUrl { url } => open_url(url),
        KeyAction::Shell { command } => shell(command),
        KeyAction::MicMute => crate::mic::toggle_mute().map(|_| ()),
        // OBS runs from the webview (WebSocket) — nothing to do natively.
        KeyAction::Obs { .. } => Ok(()),
        KeyAction::Multi { steps, delay_ms } => {
            for step in steps {
                run(step)?;
                std::thread::sleep(std::time::Duration::from_millis(delay_ms.unwrap_or(120)));
            }
            Ok(())
        }
    }
}

fn launch(target: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let status = Command::new("open")
            .arg(target)
            .status()
            .map_err(|e| e.to_string())?;
        if status.success() {
            return Ok(());
        }
        // Fall back to app-name resolution ("Slack" → /Applications/Slack.app)
        let status = Command::new("open")
            .args(["-a", target])
            .status()
            .map_err(|e| e.to_string())?;
        return if status.success() {
            Ok(())
        } else {
            Err(format!("could not launch {target}"))
        };
    }
    #[cfg(target_os = "windows")]
    {
        Command::new("cmd")
            .args(["/C", "start", "", target])
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        Command::new("xdg-open")
            .arg(target)
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

fn open_url(url: &str) -> Result<(), String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("only http(s) URLs are allowed".into());
    }
    launch(url)
}

fn shell(command: &str) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = Command::new("cmd");
        c.args(["/C", command]);
        c
    };
    #[cfg(not(target_os = "windows"))]
    let mut cmd = {
        let mut c = Command::new("sh");
        c.args(["-lc", command]);
        c
    };
    cmd.spawn().map_err(|e| e.to_string())?;
    Ok(())
}

/// Parse "cmd+shift+m" style chords and press them.
fn send_hotkey(chord: &str) -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    let parts: Vec<String> = chord
        .split('+')
        .map(|p| p.trim().to_lowercase())
        .filter(|p| !p.is_empty())
        .collect();
    if parts.is_empty() {
        return Err("empty hotkey".into());
    }

    let (mods, key_part) = parts.split_at(parts.len() - 1);
    let main_key = parse_key(&key_part[0])?;
    let mod_keys: Vec<Key> = mods
        .iter()
        .map(|m| parse_modifier(m))
        .collect::<Result<_, _>>()?;

    for m in &mod_keys {
        enigo.key(*m, Direction::Press).map_err(|e| e.to_string())?;
    }
    enigo
        .key(main_key, Direction::Click)
        .map_err(|e| e.to_string())?;
    for m in mod_keys.iter().rev() {
        enigo
            .key(*m, Direction::Release)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn parse_modifier(name: &str) -> Result<Key, String> {
    match name {
        "cmd" | "command" | "meta" | "super" | "win" => Ok(Key::Meta),
        "ctrl" | "control" => Ok(Key::Control),
        "alt" | "option" | "opt" => Ok(Key::Alt),
        "shift" => Ok(Key::Shift),
        other => Err(format!("unknown modifier: {other}")),
    }
}

fn parse_key(name: &str) -> Result<Key, String> {
    let key = match name {
        "space" => Key::Space,
        "enter" | "return" => Key::Return,
        "tab" => Key::Tab,
        "escape" | "esc" => Key::Escape,
        "backspace" => Key::Backspace,
        "delete" | "del" => Key::Delete,
        "up" => Key::UpArrow,
        "down" => Key::DownArrow,
        "left" => Key::LeftArrow,
        "right" => Key::RightArrow,
        "home" => Key::Home,
        "end" => Key::End,
        "pageup" => Key::PageUp,
        "pagedown" => Key::PageDown,
        "volumeup" => Key::VolumeUp,
        "volumedown" => Key::VolumeDown,
        "volumemute" | "mute" => Key::VolumeMute,
        "playpause" | "play" => Key::MediaPlayPause,
        "nexttrack" | "next" => Key::MediaNextTrack,
        "prevtrack" | "prev" => Key::MediaPrevTrack,
        f if f.starts_with('f') && f.len() > 1 => {
            let n: u8 = f[1..].parse().map_err(|_| format!("bad key: {f}"))?;
            match n {
                1 => Key::F1,
                2 => Key::F2,
                3 => Key::F3,
                4 => Key::F4,
                5 => Key::F5,
                6 => Key::F6,
                7 => Key::F7,
                8 => Key::F8,
                9 => Key::F9,
                10 => Key::F10,
                11 => Key::F11,
                12 => Key::F12,
                13 => Key::F13,
                14 => Key::F14,
                15 => Key::F15,
                16 => Key::F16,
                17 => Key::F17,
                18 => Key::F18,
                19 => Key::F19,
                20 => Key::F20,
                _ => return Err(format!("F{n} not supported")),
            }
        }
        single if single.chars().count() == 1 => Key::Unicode(single.chars().next().unwrap()),
        other => return Err(format!("unknown key: {other}")),
    };
    Ok(key)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn modifiers_accept_aliases() {
        for alias in ["cmd", "command", "meta", "super", "win"] {
            assert!(matches!(parse_modifier(alias), Ok(Key::Meta)));
        }
        assert!(matches!(parse_modifier("ctrl"), Ok(Key::Control)));
        assert!(matches!(parse_modifier("option"), Ok(Key::Alt)));
        assert!(matches!(parse_modifier("shift"), Ok(Key::Shift)));
        assert!(parse_modifier("hyper").is_err());
    }

    #[test]
    fn named_keys_parse() {
        assert!(matches!(parse_key("space"), Ok(Key::Space)));
        assert!(matches!(parse_key("enter"), Ok(Key::Return)));
        assert!(matches!(parse_key("return"), Ok(Key::Return)));
        assert!(matches!(parse_key("esc"), Ok(Key::Escape)));
        assert!(matches!(parse_key("pagedown"), Ok(Key::PageDown)));
        assert!(matches!(parse_key("playpause"), Ok(Key::MediaPlayPause)));
    }

    #[test]
    fn function_keys_parse_through_f20() {
        assert!(matches!(parse_key("f1"), Ok(Key::F1)));
        assert!(matches!(parse_key("f13"), Ok(Key::F13)));
        assert!(matches!(parse_key("f20"), Ok(Key::F20)));
        assert!(parse_key("f21").is_err());
        assert!(parse_key("fx").is_err());
    }

    #[test]
    fn single_characters_become_unicode() {
        assert!(matches!(parse_key("m"), Ok(Key::Unicode('m'))));
        assert!(matches!(parse_key("/"), Ok(Key::Unicode('/'))));
        assert!(matches!(parse_key("7"), Ok(Key::Unicode('7'))));
    }

    #[test]
    fn unknown_multichar_keys_are_rejected() {
        assert!(parse_key("banana").is_err());
        assert!(parse_key("").is_err());
    }

    #[test]
    fn key_action_json_shapes_deserialize() {
        let cases = [
            r#"{"type":"hid","code":240}"#,
            r#"{"type":"hotkey","keys":"cmd+shift+m"}"#,
            r#"{"type":"launch","target":"Slack"}"#,
            r#"{"type":"open_url","url":"https://example.com"}"#,
            r#"{"type":"shell","command":"echo hi"}"#,
            r#"{"type":"mic_mute"}"#,
            r#"{"type":"multi","steps":[{"type":"hid","code":240}],"delay_ms":50}"#,
        ];
        for json in cases {
            assert!(
                serde_json::from_str::<KeyAction>(json).is_ok(),
                "failed to parse {json}"
            );
        }
    }
}

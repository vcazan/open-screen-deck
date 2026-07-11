//! Serial service — owns the CDC port, streams newline-delimited protocol
//! lines to the webview as `serial-line` events.

use serde::Serialize;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub struct SerialState {
    inner: Mutex<Option<SerialConn>>,
}

struct SerialConn {
    writer: Box<dyn serialport::SerialPort>,
    alive: Arc<AtomicBool>,
    path: String,
}

impl Default for SerialState {
    fn default() -> Self {
        Self {
            inner: Mutex::new(None),
        }
    }
}

#[derive(Serialize, Clone)]
pub struct PortInfo {
    pub path: String,
    pub vid: Option<u16>,
    pub pid: Option<u16>,
    pub product: Option<String>,
}

#[derive(Serialize, Clone)]
struct SerialLineEvent {
    line: String,
}

#[derive(Serialize, Clone)]
struct SerialStatusEvent {
    connected: bool,
    path: Option<String>,
}

#[tauri::command]
pub fn serial_list() -> Result<Vec<PortInfo>, String> {
    let ports = serialport::available_ports().map_err(|e| e.to_string())?;
    Ok(ports
        .into_iter()
        .map(|p| {
            let (vid, pid, product) = match &p.port_type {
                serialport::SerialPortType::UsbPort(u) => {
                    (Some(u.vid), Some(u.pid), u.product.clone())
                }
                _ => (None, None, None),
            };
            PortInfo {
                path: p.port_name,
                vid,
                pid,
                product,
            }
        })
        .collect())
}

#[tauri::command]
pub fn serial_open(
    app: AppHandle,
    state: tauri::State<'_, SerialState>,
    path: String,
) -> Result<(), String> {
    serial_close_inner(&state);

    let port = serialport::new(&path, 115_200)
        .timeout(Duration::from_millis(50))
        .open()
        .map_err(|e| e.to_string())?;

    let writer = port.try_clone().map_err(|e| e.to_string())?;
    let alive = Arc::new(AtomicBool::new(true));
    let alive_reader = alive.clone();
    let app_reader = app.clone();
    let path_reader = path.clone();

    std::thread::spawn(move || {
        let mut port = port;
        let mut buf = [0u8; 4096];
        let mut acc: Vec<u8> = Vec::new();
        while alive_reader.load(Ordering::Relaxed) {
            match port.read(&mut buf) {
                Ok(0) => {}
                Ok(n) => {
                    acc.extend_from_slice(&buf[..n]);
                    while let Some(pos) = acc.iter().position(|&b| b == b'\n') {
                        let raw: Vec<u8> = acc.drain(..=pos).collect();
                        if let Ok(text) = String::from_utf8(raw) {
                            let line = text.trim();
                            if !line.is_empty() {
                                let _ = app_reader
                                    .emit("serial-line", SerialLineEvent { line: line.into() });
                            }
                        }
                    }
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {}
                Err(_) => {
                    // Port gone (unplugged / reflashed) — tell the UI
                    alive_reader.store(false, Ordering::Relaxed);
                    let _ = app_reader.emit(
                        "serial-status",
                        SerialStatusEvent {
                            connected: false,
                            path: Some(path_reader.clone()),
                        },
                    );
                }
            }
        }
    });

    *state.inner.lock().unwrap() = Some(SerialConn {
        writer,
        alive,
        path: path.clone(),
    });

    let _ = app.emit(
        "serial-status",
        SerialStatusEvent {
            connected: true,
            path: Some(path),
        },
    );
    Ok(())
}

#[tauri::command]
pub fn serial_write_line(state: tauri::State<'_, SerialState>, line: String) -> Result<(), String> {
    let mut guard = state.inner.lock().unwrap();
    let conn = guard.as_mut().ok_or("not connected")?;
    conn.writer
        .write_all(format!("{line}\n").as_bytes())
        .map_err(|e| e.to_string())?;
    conn.writer.flush().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn serial_write_bytes(
    state: tauri::State<'_, SerialState>,
    bytes: Vec<u8>,
) -> Result<(), String> {
    let mut guard = state.inner.lock().unwrap();
    let conn = guard.as_mut().ok_or("not connected")?;
    conn.writer.write_all(&bytes).map_err(|e| e.to_string())?;
    conn.writer.flush().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn serial_close(app: AppHandle, state: tauri::State<'_, SerialState>) -> Result<(), String> {
    serial_close_inner(&state);
    let _ = app.emit(
        "serial-status",
        SerialStatusEvent {
            connected: false,
            path: None,
        },
    );
    Ok(())
}

#[tauri::command]
pub fn serial_is_open(state: tauri::State<'_, SerialState>) -> Option<String> {
    state
        .inner
        .lock()
        .unwrap()
        .as_ref()
        .filter(|c| c.alive.load(Ordering::Relaxed))
        .map(|c| c.path.clone())
}

fn serial_close_inner(state: &tauri::State<'_, SerialState>) {
    if let Some(conn) = state.inner.lock().unwrap().take() {
        conn.alive.store(false, Ordering::Relaxed);
    }
}

/// Release the port from another module (firmware flasher needs exclusivity).
pub fn close_port(state: &tauri::State<'_, SerialState>) {
    serial_close_inner(state);
    // Give the reader thread a beat to drop its handle
    std::thread::sleep(Duration::from_millis(300));
}

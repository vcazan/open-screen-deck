//! In-app firmware updater — no arduino-cli, no esptool, no toolchain.
//!
//! Flow: close our serial handle → 1200 bps touch puts the ESP32-S3 into the
//! ROM bootloader (it re-enumerates as a new port) → espflash writes the
//! bundled bootloader/partitions/boot_app0/app images → hard reset back into
//! the firmware. Progress streams to the webview as `flash-progress` events.

use espflash::connection::{Connection, ResetAfterOperation, ResetBeforeOperation};
use espflash::flasher::Flasher;
use espflash::target::ProgressCallbacks;
use serde::Serialize;
use std::borrow::Cow;
use std::collections::HashSet;
use std::path::PathBuf;
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager};

const ESPRESSIF_VID: u16 = 0x303a;

#[derive(Serialize, Clone)]
struct FlashProgress {
    stage: String,
    /// 0..100 within the current stage
    percent: u32,
}

fn emit(app: &tauri::AppHandle, stage: &str, percent: u32) {
    let _ = app.emit(
        "flash-progress",
        FlashProgress {
            stage: stage.to_string(),
            percent,
        },
    );
    crate::debuglog::log(&format!("flash: {stage} {percent}%"));
}

struct Progress<'a> {
    app: &'a tauri::AppHandle,
    stage: String,
    total: usize,
    current: usize,
}

impl ProgressCallbacks for Progress<'_> {
    fn init(&mut self, addr: u32, total: usize) {
        self.stage = format!("writing 0x{addr:x}");
        self.total = total;
        self.current = 0;
        emit(self.app, &self.stage, 0);
    }
    fn update(&mut self, current: usize) {
        self.current = current;
        if self.total > 0 {
            emit(self.app, &self.stage, (current * 100 / self.total) as u32);
        }
    }
    fn verifying(&mut self) {
        emit(self.app, "verifying", 100);
    }
    fn finish(&mut self, _skipped: bool) {
        emit(self.app, &self.stage, 100);
    }
}

fn list_port_names() -> HashSet<String> {
    serialport::available_ports()
        .unwrap_or_default()
        .into_iter()
        .map(|p| p.port_name)
        .collect()
}

/// 1200 bps touch: opening the CDC port at 1200 baud reboots the S3 into the
/// ROM bootloader. Returns the bootloader port that appears afterwards.
fn enter_bootloader(cdc_port: &str) -> Result<String, String> {
    let before = list_port_names();

    // The touch itself — port closes immediately
    match serialport::new(cdc_port, 1200)
        .timeout(Duration::from_millis(300))
        .open()
    {
        Ok(mut port) => {
            let _ = port.write_data_terminal_ready(false);
            let _ = port.write_request_to_send(true);
            std::thread::sleep(Duration::from_millis(150));
            drop(port);
        }
        Err(e) => {
            return Err(format!(
                "could not open {cdc_port} for the reset touch: {e}"
            ))
        }
    }

    // Wait for the re-enumeration: the CDC port vanishes and the ROM
    // bootloader port appears (still an Espressif VID)
    let deadline = Instant::now() + Duration::from_secs(8);
    while Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(300));
        let now = list_port_names();
        // New port that wasn't there before
        for name in now.difference(&before) {
            return Ok(name.clone());
        }
        // Same-name re-enumeration (some hubs): CDC gone then back is NOT
        // bootloader; keep waiting for a genuinely new node.
    }

    // Fallback: any Espressif port that is not the original CDC port
    if let Ok(ports) = serialport::available_ports() {
        for p in ports {
            if let serialport::SerialPortType::UsbPort(info) = &p.port_type {
                if info.vid == ESPRESSIF_VID && p.port_name != cdc_port {
                    return Ok(p.port_name);
                }
            }
        }
    }
    Err(
        "device did not re-enumerate into the bootloader — try holding BOOT while plugging in"
            .into(),
    )
}

fn resource_bin(app: &tauri::AppHandle, name: &str) -> Result<Vec<u8>, String> {
    let path: PathBuf = app
        .path()
        .resolve(
            format!("resources/firmware/{name}"),
            tauri::path::BaseDirectory::Resource,
        )
        .map_err(|e| e.to_string())?;
    std::fs::read(&path).map_err(|e| format!("missing bundled firmware {name}: {e}"))
}

/// The firmware version bundled with this build of the app.
#[tauri::command]
pub fn bundled_firmware_version(app: tauri::AppHandle) -> Result<String, String> {
    let raw = resource_bin(&app, "version.json")?;
    let v: serde_json::Value = serde_json::from_slice(&raw).map_err(|e| e.to_string())?;
    Ok(v["version"].as_str().unwrap_or("unknown").to_string())
}

// ESP32-S3 RTC_CNTL registers (esptool targets/esp32s3.py). The 1200-bps
// touch latches "force download boot" in RTC_CNTL_OPTION1 — until it's
// cleared, no amount of resetting leaves the bootloader. esptool's USB-OTG
// hard reset clears the latch and fires the RTC watchdog; we do the same.
const S3_RTC_CNTL_OPTION1_REG: u32 = 0x6000_812C;
const S3_FORCE_DOWNLOAD_BOOT_MASK: u32 = 0x1;
const S3_RTC_CNTL_WDTCONFIG0_REG: u32 = 0x6000_8098;
const S3_RTC_CNTL_WDTCONFIG1_REG: u32 = 0x6000_809C;
const S3_RTC_CNTL_WDTWPROTECT_REG: u32 = 0x6000_80B0;
const S3_RTC_CNTL_WDT_WKEY: u32 = 0x50D8_3AA1;

fn watchdog_reset(conn: &mut Connection) -> Result<(), String> {
    let wr = |c: &mut Connection, addr: u32, val: u32, mask: Option<u32>| {
        c.write_reg(addr, val, mask).map_err(|e| e.to_string())
    };
    // Clear the forced-download latch, then arm a 2 s RTC watchdog reset
    wr(conn, S3_RTC_CNTL_OPTION1_REG, 0, Some(S3_FORCE_DOWNLOAD_BOOT_MASK))?;
    wr(conn, S3_RTC_CNTL_WDTWPROTECT_REG, S3_RTC_CNTL_WDT_WKEY, None)?; // unlock
    wr(conn, S3_RTC_CNTL_WDTCONFIG1_REG, 2000, None)?; // timeout
    wr(conn, S3_RTC_CNTL_WDTCONFIG0_REG, (1 << 31) | (5 << 28) | (1 << 8) | 2, None)?; // enable
    wr(conn, S3_RTC_CNTL_WDTWPROTECT_REG, 0, None)?; // lock
    std::thread::sleep(Duration::from_millis(500));
    Ok(())
}

/// Recovery: the deck is sitting in its ROM bootloader (interrupted flash,
/// stray 1200-bps touch). Clear the download latch and watchdog-reset it
/// back into the firmware — the CDC port reappears a moment later.
#[tauri::command]
pub async fn deck_recover(port: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let ports = serialport::available_ports().map_err(|e| e.to_string())?;
        let usb_info = ports
            .iter()
            .find(|p| p.port_name == port)
            .and_then(|p| match &p.port_type {
                serialport::SerialPortType::UsbPort(info) => Some(info.clone()),
                _ => None,
            })
            .ok_or_else(|| format!("port {port} not found"))?;

        let serial = serialport::new(&port, 115_200)
            .timeout(Duration::from_secs(3))
            .open_native()
            .map_err(|e| format!("open {port}: {e}"))?;

        let connection = Connection::new(
            serial,
            usb_info,
            ResetAfterOperation::NoReset, // the watchdog does the reset
            ResetBeforeOperation::NoReset, // already in the bootloader
            115_200,
        );
        let mut flasher = Flasher::connect(connection, false, false, true, None, None)
            .map_err(|e| format!("bootloader sync failed: {e}"))?;
        watchdog_reset(flasher.connection())?;
        crate::debuglog::log(&format!("deck_recover: watchdog reset on {port}"));
        Ok("reset".into())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn flash_firmware(
    app: tauri::AppHandle,
    state: tauri::State<'_, crate::serial::SerialState>,
    port: String,
) -> Result<String, String> {
    // Free the port — the flasher needs exclusive access
    crate::serial::close_port(&state);
    emit(&app, "entering bootloader", 0);

    let bins = [
        (0x0u32, resource_bin(&app, "bootloader.bin")?),
        (0x8000, resource_bin(&app, "partitions.bin")?),
        (0xe000, resource_bin(&app, "boot_app0.bin")?),
        (0x10000, resource_bin(&app, "app.bin")?),
    ];

    let app2 = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        let boot_port_name = enter_bootloader(&port)?;
        emit(&app2, "connecting", 0);

        let ports = serialport::available_ports().map_err(|e| e.to_string())?;
        let usb_info = ports
            .iter()
            .find(|p| p.port_name == boot_port_name)
            .and_then(|p| match &p.port_type {
                serialport::SerialPortType::UsbPort(info) => Some(info.clone()),
                _ => None,
            })
            .ok_or_else(|| format!("bootloader port {boot_port_name} vanished"))?;

        let serial = serialport::new(&boot_port_name, 115_200)
            .timeout(Duration::from_secs(3))
            .open_native()
            .map_err(|e| format!("open {boot_port_name}: {e}"))?;

        let connection = Connection::new(
            serial,
            usb_info,
            ResetAfterOperation::HardReset,
            ResetBeforeOperation::NoReset, // already in the bootloader
            115_200,
        );

        let mut flasher = Flasher::connect(connection, true, false, false, None, Some(460_800))
            .map_err(|e| format!("bootloader handshake failed: {e}"))?;

        let segments: Vec<espflash::image_format::Segment> = bins
            .iter()
            .map(|(addr, data)| espflash::image_format::Segment {
                addr: *addr,
                data: Cow::from(data.as_slice()),
            })
            .collect();

        let mut progress = Progress {
            app: &app2,
            stage: String::new(),
            total: 0,
            current: 0,
        };
        flasher
            .write_bins_to_flash(&segments, &mut progress)
            .map_err(|e| format!("flash write failed: {e}"))?;

        emit(&app2, "restarting", 100);
        drop(flasher); // ResetAfterOperation::HardReset boots the firmware
        Ok("flashed".to_string())
    })
    .await
    .map_err(|e| e.to_string())?;

    emit(&app, if result.is_ok() { "done" } else { "failed" }, 100);
    result
}

#!/usr/bin/env bash
# Build the deck firmware and bundle it into the companion app's resources
# (the app flashes these binaries from Settings → Firmware).
#
# Usage:
#   ./scripts/build_firmware.sh            # compile + bundle
#   ./scripts/build_firmware.sh --flash    # …then flash a connected deck
#
# Requires arduino-cli with the esp32 core and the Adafruit ST7735/GFX
# libraries installed (see docs/firmware/flashing.md).

set -euo pipefail
cd "$(dirname "$0")/.."

BOARD="esp32:esp32:esp32s3:USBMode=default,CDCOnBoot=cdc,FlashSize=16M,PartitionScheme=app3M_fat9M_16MB,PSRAM=opi"
OUT=/tmp/osd-fw-out
RES=app/src-tauri/resources/firmware

VERSION=$(sed -n 's/#define FIRMWARE_VERSION "\(.*\)"/\1/p' firmware/config.h)
echo "── Building firmware v${VERSION}"

arduino-cli compile -b "$BOARD" --output-dir "$OUT" firmware

echo "── Bundling into app resources"
cp "$OUT/firmware.ino.bootloader.bin" "$RES/bootloader.bin"
cp "$OUT/firmware.ino.partitions.bin" "$RES/partitions.bin"
cp "$OUT/firmware.ino.bin"            "$RES/app.bin"
printf '{"version":"%s"}\n' "$VERSION" > "$RES/version.json"
echo "   $RES ← v${VERSION}"

if [[ "${1:-}" == "--flash" ]]; then
    PORT=$(arduino-cli board list 2>/dev/null | awk '/usbmodem|ttyACM/ {print $1; exit}')
    if [[ -z "$PORT" ]]; then
        echo "!! No deck found on USB" >&2
        exit 1
    fi
    echo "── Flashing $PORT"
    arduino-cli upload -b "$BOARD" -p "$PORT" --input-dir "$OUT" firmware
fi

echo "done"

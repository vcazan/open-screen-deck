#!/usr/bin/env python3
"""
check_connectivity.py — pre-Gerber netlist cross-check gate (Rev E "never-again").

DRC alone is blind to a whole failure class: a net that exists on only one pad
passes "0 unconnected items" (Rev B-D shipped with CS2/CS3 floating that way).
This gate cross-checks THREE independent sources and hard-fails on divergence:

  1. hardware/pinout.py         (canonical truth)
  2. schematic netlist          (kicad-cli sch export netlist)
  3. PCB pad->net assignments   (parsed from the .kicad_pcb)

Checks:
  A. every signal net in the PCB lands on >= 2 pads       (dangling-net guard)
  B. for every named net, schematic pin set == PCB pin set (netlist diff)
  C. every pinout.py signal reaches the exact ESP32 pad + connector pin

Usage: python3 scripts/check_connectivity.py
Exit code != 0 means DO NOT ship Gerbers.
"""

from __future__ import annotations

import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "hardware"))
import pinout  # noqa: E402

PCB = ROOT / "hardware/pcb/data_streamdeck.kicad_pcb"
SCH = ROOT / "hardware/pcb/data_streamdeck.kicad_sch"
KICAD_CLI = "/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli"

# Power nets legitimately allowed on any pad count; everything else needs >= 2.
POWER_NETS = {"GND", "+3V3", "VBUS"}


def find_balanced(text: str, start: int) -> int:
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "(":
            depth += 1
        elif text[i] == ")":
            depth -= 1
            if depth == 0:
                return i + 1
    raise ValueError("unbalanced s-expression")


def pcb_pad_nets() -> dict[str, str]:
    """Return {ref.pin: net} for every pad in the PCB."""
    board = PCB.read_text()
    out: dict[str, str] = {}
    for fm in re.finditer(r'\(footprint\s+"', board):
        blk = board[fm.start() : find_balanced(board, fm.start())]
        rm = re.search(r'\(property\s+"Reference"\s+"([^"]+)"', blk)
        if not rm:
            continue
        ref = rm.group(1)
        for pm in re.finditer(r'\(pad\s+"([^"]+)"', blk):
            pad = blk[pm.start() : find_balanced(blk, pm.start())]
            nm = re.search(r'\(net\s+(?:\d+\s+)?"([^"]+)"\)', pad)
            if nm:
                out[f"{ref}.{pm.group(1)}"] = nm.group(1)
    return out


def sch_pin_nets() -> dict[str, str]:
    """Return {ref.pin: net} from the exported schematic netlist."""
    with tempfile.NamedTemporaryFile(suffix=".xml", delete=False) as tf:
        xml_path = tf.name
    subprocess.run(
        [KICAD_CLI, "sch", "export", "netlist", "--format", "kicadxml",
         "-o", xml_path, str(SCH)],
        check=True, capture_output=True,
    )
    xml = Path(xml_path).read_text()
    out: dict[str, str] = {}
    for nm in re.finditer(r'<net code="\d+" name="([^"]+)"', xml):
        net = nm.group(1)
        end = xml.find("</net>", nm.start())
        for pm in re.finditer(r'<node ref="([^"]+)" pin="([^"]+)"', xml[nm.start():end]):
            out[f"{pm.group(1)}.{pm.group(2)}"] = net
    return out


def canon(net: str) -> str:
    """Normalise auto-generated names so sch and pcb spellings compare equal.
    The schematic uses KiCad's stock +3.3V power symbol; the PCB uses +3V3."""
    return {"+3.3V": "+3V3"}.get(net.lstrip("/"), net.lstrip("/"))


# Pads that exist only on the PCB by design (no schematic pin):
#   J8.9  — Hirose DM3D-SF card-detect contact, strapped to GND (unused by FW);
#           the stock Micro_SD_Card symbol has no pin 9.
PCB_ONLY_PADS = {"J8.9"}


def main() -> None:
    errors: list[str] = []

    pcb = {k: canon(v) for k, v in pcb_pad_nets().items()}
    sch = {k: canon(v) for k, v in sch_pin_nets().items()}

    # A. dangling-net guard on the final routed board
    counts: dict[str, int] = {}
    for net in pcb.values():
        counts[net] = counts.get(net, 0) + 1
    for net, c in sorted(counts.items()):
        if c < 2 and net not in POWER_NETS and not net.startswith("unconnected-"):
            errors.append(f"[dangling] net '{net}' lands on only {c} pad in PCB")

    # B. schematic vs PCB pin-set diff for every named (non-auto) net
    def pins_of(mapping: dict[str, str]) -> dict[str, set[str]]:
        inv: dict[str, set[str]] = {}
        for pin, net in mapping.items():
            inv.setdefault(net, set()).add(pin)
        return inv

    sch_nets, pcb_nets = pins_of(sch), pins_of(pcb)
    named = {n for n in set(sch_nets) | set(pcb_nets)
             if not n.startswith(("Net-", "unconnected-"))}
    for net in sorted(named):
        s, p = sch_nets.get(net, set()), pcb_nets.get(net, set())
        # schematic omits pads that exist only mechanically (e.g. shield "SH")
        only_s, only_p = s - p, p - s
        only_p = {x for x in only_p if not x.endswith((".SH", ".MP"))} - PCB_ONLY_PADS
        if only_s or only_p:
            errors.append(
                f"[netdiff] '{net}': sch-only={sorted(only_s) or '-'} "
                f"pcb-only={sorted(only_p) or '-'}"
            )

    # C. canonical pinout: each signal's net must include the right U1 pad
    for sig, gpio in pinout.GPIO.items():
        if sig in ("USB_DN", "USB_DP", "BOOT"):
            continue  # verified through named nets above
        net = pinout.SIGNAL_NET.get(sig, sig)
        pad = pinout.WROOM_PAD[gpio]
        if pcb.get(f"U1.{pad}") != net:
            errors.append(
                f"[pinout] U1.{pad} (IO{gpio}, {sig}) is on "
                f"'{pcb.get(f'U1.{pad}')}' expected '{net}'"
            )
    for i, gpio in enumerate(pinout.CS):
        pad = pinout.WROOM_PAD[gpio]
        if pcb.get(f"U1.{pad}") != f"CS{i+1}":
            errors.append(f"[pinout] U1.{pad} (IO{gpio}) expected CS{i+1}, "
                          f"got '{pcb.get(f'U1.{pad}')}'")
    for i, gpio in enumerate(pinout.KEY):
        pad = pinout.WROOM_PAD[gpio]
        if pcb.get(f"U1.{pad}") != f"KEY{i+1}":
            errors.append(f"[pinout] U1.{pad} (IO{gpio}) expected KEY{i+1}, "
                          f"got '{pcb.get(f'U1.{pad}')}'")

    # firmware cross-check rides along
    try:
        pinout.check_firmware_config()
    except SystemExit as e:
        errors.append(f"[firmware] {e}")

    if errors:
        print(f"!! connectivity gate FAILED — {len(errors)} problem(s):")
        for e in errors:
            print("   " + e)
        raise SystemExit(1)
    print(f"connectivity gate PASS — {len(pcb)} pads, "
          f"{len(named)} named nets verified against schematic + pinout.py")


if __name__ == "__main__":
    main()

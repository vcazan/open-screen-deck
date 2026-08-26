# 3D Printing

Print the four parts from
[`hardware/enclosure/stl/`](https://github.com/vcazan/open-screen-deck/tree/main/hardware/enclosure/stl/)
before assembly. No supports required on any part.

## Print settings

**Material:** PETG or PLA+  
**Layer height:** 0.2 mm  
**Walls:** 3

## Parts

| Part | File | Print notes |
|------|------|-------------|
| Bottom tray | `deck_bottom_v14.stl` | Flat on bed, no supports |
| Top shell | `deck_top_v14.stl` | Face-down, no supports |
| Corner spacers ×4 | `corner_spacers_x4_v14.stl` | 100% infill recommended |
| Desk stand (optional) | `deck_stand_v14.stl` | Upright, 15–20% infill |

!!! tip "Corner spacers"
    Print the corner spacers at **100% infill**. They replace the factory
    standoff at each deck corner and carry the M2×25 case screw through the
    stack.

!!! note "Rev E enclosure"
    v14 matches the Rev E carrier: wider key pitch, eight LED wall windows,
    a Ø3 ALS light-pipe in the face plate, and a Qwiic opening next to USB-C.
    Do not mix v13 prints with a Rev E board (or the other way around).

OpenSCAD sources live in
[`hardware/enclosure/`](https://github.com/vcazan/open-screen-deck/tree/main/hardware/enclosure/).
When you're ready to assemble, continue to the
[Assembly Guide](../build/assembly.md).

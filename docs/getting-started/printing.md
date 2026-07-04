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
| Bottom tray | `deck_bottom_v11.stl` | Flat on bed, no supports |
| Top shell | `deck_top_v11.stl` | Face-down, no supports |
| Corner spacers ×4 | `corner_spacers_x4_v11.stl` | 100% infill recommended |
| Desk stand (optional) | `deck_stand_v11.stl` | Upright, 15–20% infill |

!!! tip "Corner spacers"
    Print the corner spacers at **100% infill**. They replace the factory
    standoff at each deck corner and carry the M2×25 case screw through the
    stack.

!!! note "Keycap aperture"
    The keycap opening in the top shell (`CAP_W = 19.4` in the OpenSCAD source)
    is an estimate. Measure a real ScreenKey cap and adjust before your final
    print if fit is tight.

OpenSCAD sources live in
[`hardware/enclosure/`](https://github.com/vcazan/open-screen-deck/tree/main/hardware/enclosure/).
When you're ready to assemble, continue to the
[Assembly Guide](../build/assembly.md).

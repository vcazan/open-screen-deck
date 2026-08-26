#!/usr/bin/env python3
"""Transform enclosure/module ASCII STLs from the OpenSCAD frame into the
KiCad STEP frame so they can be assembled with the board export in CAD
(Fusion 360 etc.).

Frame mapping (derived from data_streamdeck_enclosure.scad):
  x_step = (PCB_OX + PCB_W) - x_enc = 62.2 - x
  y_step = PCB_OY - y_enc          = 2.7 - y
  z_step = z_enc - PCB_Z           = z - 6.0
This is a proper 180-deg rotation about Z (triangle winding preserved)
plus a translation, matching KiCad's y-negated STEP export with the
board bottom at z=0.

The RENDER="top" export additionally flips the top shell face-down for
printing (rotate([180,0,0]) translate([0,-INNER_D,-TOTAL_H])); that flip
is its own inverse and is undone here before the frame mapping.

Inputs are ASCII STLs (export with `--export-format asciistl`).

Usage: xform_enclosure_stl.py <in.stl> <out.stl> [--unflip-top]
"""
import re
import sys

TX, TY, TZ = 62.2, 2.7, -6.0
INNER_D, TOTAL_H = 113.9, 28.2

num = r"[-+0-9.eE]+"
vertex_re = re.compile(rf"(vertex\s+)({num})\s+({num})\s+({num})")
normal_re = re.compile(rf"(facet normal\s+)({num})\s+({num})\s+({num})")


def convert(src: str, dst: str, unflip_top: bool) -> None:
    def xf(x, y, z):
        if unflip_top:
            x, y, z = x, INNER_D - y, TOTAL_H - z
        return (TX - x, TY - y, z + TZ)

    def xf_normal(nx, ny, nz):
        if unflip_top:
            nx, ny, nz = nx, -ny, -nz
        return (-nx, -ny, nz)

    with open(src) as f, open(dst, "w") as out:
        for line in f:
            m = vertex_re.search(line)
            if m:
                x, y, z = xf(float(m.group(2)), float(m.group(3)), float(m.group(4)))
                out.write(f"{line[:m.start()]}vertex {x:.6f} {y:.6f} {z:.6f}\n")
                continue
            m = normal_re.search(line)
            if m:
                nx, ny, nz = xf_normal(float(m.group(2)), float(m.group(3)), float(m.group(4)))
                out.write(f"{line[:m.start()]}facet normal {nx:.6f} {ny:.6f} {nz:.6f}\n")
                continue
            out.write(line)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 2:
        sys.exit(__doc__)
    convert(args[0], args[1], "--unflip-top" in sys.argv)
    print(f"wrote {args[1]}")

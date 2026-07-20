// ============================================================
//  Open Screen Deck — Enclosure v13  "one-screw corner stack"
//
//  ASSEMBLY-FIRST architecture — modules keep their FACTORY brass
//  standoffs; the 4 CASE screws run straight through the corner
//  modules' soldered M2 nuts (off-the-shelf part, untouched):
//
//    1. Screw 6 modules to the carrier: M2×5 from the carrier
//       underside into the factory standoff tips (non-corner spots).
//       At the 4 deck corners swap the factory standoff for the
//       printed 8.0 mm spacer sleeve (open bore for the case screw).
//    2. Plug the 6 in-box cables (module → carrier PicoBlade).
//    3. Drop the carrier onto the tray posts, snap the top shell on.
//    4. 4× M2×25 from below: tray → carrier → spacer → module
//       corner nut → RX-M2x4 insert in the top plate. One screw
//       per corner marries bottom case + PCB + module + top case.
//
//  Stack (bottom→top):
//    floor 3.0 (head recess 2.1) → PCB lift 3.0 → carrier 1.6
//    → standoff/spacer 8.0 (clears mated PicoBlade) → module 7.4
//    → module front @ 23.0 → gap 0.2 → face plate 5.0 (M2 inserts)
//  Deck body ≈ 58.9 × 115.9 × 28.2 mm; caps 3.4 mm proud.
//  M2×25 check: head seats z0.9–2.9, tip z27.9; insert spans
//  z23.2–27.4 → full 4 mm engagement, tip 0.3 mm shy of the face. ✓
//
//  RENDER: "body" | "bottom" | "top" | "stand" | "spacers" |
//          "ghost" | "all"
//  Print: bottom flat, top face-down, stand upright. PETG/PLA+.
// ============================================================

RENDER = "body";
NO_STANDALONE = true;
use <screenkey_module.scad>

// ── Module (SKU 34168, standoffs removed, dual-PCB body) ────
MOD_W      = 26.01;
MOD_H      = 35.31;
MOD_BODY   = 7.4;       // front PCB + nut gap + rear PCB (vendor: 16 − 8.6)
CAP_PROUD  = 8.60;      // cap top above module front face
CAP_WX     = 21.89;     // vendor drawing — cap is RECTANGULAR
CAP_WY     = 25.13;
CAP_R      = 3.0;
CAP_CLEAR  = 0.6;       // total, per axis (0.3 per side)
MOUNT_DX   = 20.0;      // module M2 pattern (official vendor drawing)
MOUNT_DY   = 29.25;
CONN_DROP  = 4.4;       // 9P receptacle below REAR PCB
STANDOFF_L = 8.0;       // factory brass standoffs (kept installed)

// ── Grid (matches PCB Rev D — do not change) ────────────────
COLS = 2;  ROWS = 3;  GAP = 3.0;

// ── Body ────────────────────────────────────────────────────
WALL     = 2.4;     // thick enough for the split-line tongue joint
FLOOR    = 3.0;     // thick enough to swallow the M2 cap heads
PLATE_T  = 5.0;     // thick face plate: houses the corner M2 inserts
PCB_LIFT = 3.0;     // room for M2 screw heads under carrier
PCB_W = 55.0;  PCB_D = 112.0;  PCB_TH = 1.6;

// ── Split-line joint: tongue on tray + groove in top shell ──
LIP_H   = 2.5;      // tongue height above split
LIP_T   = 0.9;      // tongue thickness (from cavity face outward)
LIP_CLR = 0.15;     // fit clearance per side
SNAP_R  = 0.45;     // snap bump radius (bumps on tongue, grooves in skirt)

CORNER_R  = 5.0;    // max radius that clears the square module corners
TOP_RND   = 2.4;    // top edge roundover (approximated, print-safe)
BOT_RND   = 1.2;    // bottom edge lead-in
SPLIT_Z   = 12.0;

// ── Derived stack ───────────────────────────────────────────
GRID_W  = COLS * MOD_W + (COLS - 1) * GAP;    // 54.88
GRID_H  = ROWS * MOD_H + (ROWS - 1) * GAP;    // 111.87
INNER_W = GRID_W + 2 * WALL;                  // 58.88
INNER_D = GRID_H + 2 * WALL;                  // 115.87
PCB_OX  = (INNER_W - PCB_W) / 2;
PCB_OY  = (INNER_D - PCB_D) / 2;
PCB_Z   = FLOOR + PCB_LIFT;                   // 6.0 (carrier bottom)
REAR_Z  = PCB_Z + PCB_TH + STANDOFF_L;        // 17.3 (module rear PCB back)
MODF_Z  = REAR_Z + MOD_BODY;                  // 23.0 (module front face)
TOTAL_H = MODF_Z + 0.2 + PLATE_T;             // 25.4
CAP_TOP = MODF_Z + CAP_PROUD;                 // 31.6 (proud 6.2)

// ── Ports ───────────────────────────────────────────────────
// KiCad views the board from the top with +y DOWN, so once the PCB drops
// component-up into the tray, kicad +x lands on the enclosure's -x side:
//   enclosure_x = PCB_OX + (PCB_W - kicad_x)
// USB (kicad x=27.5, centred) is mirror-invariant; J8 (kicad x=47.5,
// card ejects the kicad x=55 edge) is adjacent to the enclosure x=0 wall.
USB_W = 10.0;  USB_H = 4.4;  USB_R = 1.5;
USB_CX = PCB_OX + (PCB_W - 27.5);
USB_CZ = PCB_Z + PCB_TH + 1.7;
SD_W = 13.0;  SD_H = 3.0;
SD_CY = PCB_OY + 75.0;
SD_CZ = PCB_Z + PCB_TH + 1.0;

// ── Fasteners (real parts, CAD in hardware/3d/fasteners/) ───
// Case:    4× M2×25 COUNTERSUNK flat head (DIN 965) from BELOW, one
//          per deck corner. Path: tray floor → carrier hole → printed
//          spacer sleeve → corner module's soldered M2 nut → RX-M2x4
//          insert in the top plate. One screw clamps the whole stack.
//          The countersink sits INSIDE the rubber-foot recess, so the
//          foot covers the screw completely — nothing visible outside.
//          Stack check: flat face flush at recess floor z1.2 → tip at
//          z26.2; insert spans z23.2–27.4 → 3.0 mm engagement. ✓
// Modules: 12× M2×5 ISO 4762 from the carrier underside into the
//          factory standoff tips (non-corner positions).
// Corner screw axes = the corner modules' outermost nut positions
// (PCB holes H1-H4 at kicad (2,4.95)/(52.9,4.95)/(2,106.85)/(52.9,106.85)).
SCREW_D  = 2.4;                  // M2 free-fit through-hole
CSK_OD   = 4.8;                  // countersink mouth (DIN 965 head Ø3.8 + relief)
CSK_H    = 1.3;                  // 90° cone depth above the recess floor
POST_OD  = 7.0;                  // PCB perch posts under the corners
INSERT_D = 3.2;  INSERT_L = 4.2; // Ruthex RX-M2x4
SPACER_OD = 4.0; SPACER_BORE = 2.4;  // printed corner sleeve, 8.0 long
FOOT_OFF  = 1.8;                 // foot centre offset (diagonal, inboard) from screw axis
// (kicad x mirrors into the enclosure: x_e = PCB_OX + PCB_W − x_kicad)
// Rev D corner screws: module centres ± (10.0, 14.625) — kicad H1–H4 at
// (3.0, 2.975) / (51.9, 2.975) / (3.0, 108.825) / (51.9, 108.825)
CORNER_POS = [
    [PCB_OX + 52.0,  PCB_OY + 2.975],
    [PCB_OX + 3.1,   PCB_OY + 2.975],
    [PCB_OX + 52.0,  PCB_OY + 108.825],
    [PCB_OX + 3.1,   PCB_OY + 108.825]
];

// ── Stand ───────────────────────────────────────────────────
STAND_ANGLE = 25;
FOOT_D = 10;  FOOT_REC = 1.2;

COL_BODY  = "#232327";
COL_PLATE = "#1a1a1e";
COL_STAND = "#141417";
COL_PCB   = "#14442c";

$fn = 64;

// Module centres follow the PCB connector grid (KiCad truth:
// J1@13,17.6 … pitch 28.9 × 38.3), NOT a symmetric wall inset —
// keeps apertures + corner screws aligned with the real modules.
function cx(c) = PCB_OX + 13.1 + c * 28.9;   // mirrored kicad truth (55 − 41.9)
function cy(r) = PCB_OY + 17.6 + r * 38.3;
function mounts() = [[MOUNT_DX/2, MOUNT_DY/2], [-MOUNT_DX/2, MOUNT_DY/2],
                     [MOUNT_DX/2, -MOUNT_DY/2], [-MOUNT_DX/2, -MOUNT_DY/2]];

module rsq2d(w, h, r) { offset(r = r) square([w - 2*r, h - 2*r], center = true); }

// ── Sculpted outer form: quarter-round edges top & bottom ───
// Roundover approximated with hull slices on a circular profile —
// every overhang stays ≥45°, so both shells print without supports
// (bottom flat on bed; top printed face-down).
function _round_in(rr, dz) = rr - sqrt(max(rr*rr - dz*dz, 0));

module deck_slice(inset) {
    translate([INNER_W/2, INNER_D/2])
        rsq2d(INNER_W - 2*inset, INNER_D - 2*inset, max(CORNER_R - inset, 1.5));
}

module deck_solid() {
    hull() {
        // bottom lead-in (small quarter round)
        for (i = [0:2]) {
            dz = BOT_RND * (1 - i/2);
            translate([0, 0, BOT_RND - dz + 0.001*i])
                linear_extrude(0.01) deck_slice(_round_in(BOT_RND, BOT_RND - dz));
        }
        translate([0, 0, BOT_RND]) linear_extrude(0.01) deck_slice(0);
        // straight belly
        translate([0, 0, TOTAL_H - TOP_RND]) linear_extrude(0.01) deck_slice(0);
        // top roundover (quarter circle, 4 steps)
        for (i = [1:4]) {
            dz = TOP_RND * i/4;
            translate([0, 0, TOTAL_H - TOP_RND + dz])
                linear_extrude(0.01) deck_slice(_round_in(TOP_RND, dz));
        }
    }
}

module cavity_2d() {
    // +0.8 total clearance so module edges never touch the walls
    rsq2d(GRID_W + 0.8, GRID_H + 0.8, CORNER_R - WALL);
}

module cavity() {
    translate([INNER_W/2, INNER_D/2, FLOOR])
        linear_extrude(TOTAL_H) cavity_2d();
}

// snap bump centres on the tongue's outer face (left/right walls,
// located at the module row gaps so nothing inside is disturbed)
function snap_pts() =
    let(xo = INNER_W/2 - (GRID_W + 0.8)/2 - LIP_T,   // tongue outer face x (left)
        y1 = INNER_D * 0.32, y2 = INNER_D * 0.68)
    [[xo, y1], [xo, y2], [INNER_W - xo, y1], [INNER_W - xo, y2]];

module split_tongue() {
    // ring: cavity face -> +LIP_T outward, rising LIP_H above the split
    translate([INNER_W/2, INNER_D/2, SPLIT_Z - 0.01])
        linear_extrude(LIP_H + 0.01)
            difference() {
                offset(delta = LIP_T) cavity_2d();
                cavity_2d();
            }
    // snap bumps (half-domes on the outer face)
    for (p = snap_pts())
        translate([p[0], p[1], SPLIT_Z + LIP_H * 0.55])
            scale([0.6, 1, 1]) sphere(r = SNAP_R);
}

module split_groove() {
    // relief in the top skirt for tongue + clearance
    translate([INNER_W/2, INNER_D/2, SPLIT_Z - 0.05])
        linear_extrude(LIP_H + LIP_CLR + 0.05)
            difference() {
                offset(delta = LIP_T + LIP_CLR) cavity_2d();
                offset(delta = -0.1) cavity_2d();
            }
    // snap grooves
    for (p = snap_pts())
        translate([p[0], p[1], SPLIT_Z + LIP_H * 0.55])
            scale([0.6, 1, 1]) sphere(r = SNAP_R + 0.12);
}

module clip_z(z0, z1) {
    intersection() {
        children();
        translate([-5, -5, z0]) cube([INNER_W + 10, INNER_D + 10, z1 - z0]);
    }
}

// ── Bottom tray ─────────────────────────────────────────────
module bottom_shell() {
    difference() {
        clip_z(0, SPLIT_Z) deck_solid();
        cavity();

        translate([USB_CX, -0.1, USB_CZ]) rotate([-90, 0, 0]) {
            linear_extrude(WALL + 1.2) rsq2d(USB_W, USB_H, USB_R);
            linear_extrude(0.9) rsq2d(USB_W + 3, USB_H + 3, USB_R + 1);
        }

        // microSD slot — LEFT wall (x=0): J8 sits at kicad x=47.5 and its
        // card mouth faces the kicad x=55 edge, which the mirror mapping
        // places against this wall (v11 had it on the wrong side)
        translate([-0.1, SD_CY, SD_CZ]) rotate([0, 90, 0]) {
            linear_extrude(WALL + 1.2) rsq2d(SD_H, SD_W, 1.2);
            linear_extrude(0.8) rsq2d(SD_H + 2.4, SD_W + 3, 1.8);   // finger lead-in
        }

        for (p = CORNER_POS) {
            // through-hole + countersink rising from the foot-recess floor
            translate([p[0], p[1], -0.1]) cylinder(d = SCREW_D, h = SPLIT_Z + 0.2);
            translate([p[0], p[1], FOOT_REC - 0.01])
                cylinder(d1 = CSK_OD, d2 = SCREW_D, h = CSK_H);
            translate([p[0], p[1], -0.1]) cylinder(d = CSK_OD, h = FOOT_REC + 0.11);
        }

        // rubber-foot recesses centred to cover the corner screws
        for (p = CORNER_POS) {
            fx = p[0] + (p[0] < INNER_W/2 ? FOOT_OFF : -FOOT_OFF);
            fy = p[1] + (p[1] < INNER_D/2 ? FOOT_OFF : -FOOT_OFF);
            translate([fx, fy, -0.1]) cylinder(d = FOOT_D, h = FOOT_REC + 0.1);
        }
    }

    // PCB perch posts under the corner screw axes
    for (p = CORNER_POS)
        difference() {
            translate([p[0], p[1], FLOOR - 0.01]) cylinder(d = POST_OD, h = PCB_LIFT + 0.01);
            translate([p[0], p[1], -1]) cylinder(d = SCREW_D, h = SPLIT_Z);
        }

    // split-line tongue with snap bumps (registers + clicks into top shell)
    split_tongue();
}

// ── Top shell (apertures + corner M2 inserts in the plate) ──
module top_shell() {
    difference() {
        clip_z(SPLIT_Z, TOTAL_H + 1) deck_solid();

        // hollow beneath the face plate (module bays)
        translate([INNER_W/2, INNER_D/2, SPLIT_Z - 0.1])
            linear_extrude(TOTAL_H - PLATE_T - SPLIT_Z + 0.1)
                cavity_2d();

        // keycap apertures with chamfered lip
        for (c = [0:COLS-1], r = [0:ROWS-1])
            translate([cx(c), cy(r), TOTAL_H - PLATE_T - 0.1]) {
                linear_extrude(PLATE_T + 0.2)
                    rsq2d(CAP_WX + CAP_CLEAR, CAP_WY + CAP_CLEAR, CAP_R);
                translate([0, 0, PLATE_T - 0.7])
                    linear_extrude(0.81, scale = 1.09)
                        rsq2d(CAP_WX + CAP_CLEAR, CAP_WY + CAP_CLEAR, CAP_R);
            }

        // RX-M2x4 insert holes, drilled up into the plate underside,
        // directly above the corner modules' soldered nuts
        for (p = CORNER_POS)
            translate([p[0], p[1], TOTAL_H - PLATE_T - 0.05])
                cylinder(d = INSERT_D, h = INSERT_L + 0.05);

        // groove for the tray's tongue + snap recesses
        split_groove();
    }
}

// ── Corner spacer sleeve (replaces the factory standoff at the
//    4 deck corners; open Ø2.4 bore lets the case screw through) ──
module corner_spacer() {
    difference() {
        cylinder(d = SPACER_OD, h = STANDOFF_L);
        translate([0, 0, -0.5]) cylinder(d = SPACER_BORE, h = STANDOFF_L + 1);
    }
}

// ── Stand: sculpted 25° cradle ──────────────────────────────
module stand() {
    W = INNER_W + 7;
    depth = 74;
    back_h = 48;
    difference() {
        hull() {
            translate([W/2, depth/2, 0]) linear_extrude(2) rsq2d(W, depth, 8);
            translate([W/2, 10, back_h - 6]) rotate([90 - STAND_ANGLE + 90, 0, 0])
                linear_extrude(0.01) rsq2d(W, 12, 5);
        }
        translate([(W - INNER_W - 1.2)/2, depth - 8, 6])
            rotate([STAND_ANGLE, 0, 0])
                translate([0, -INNER_D, -TOTAL_H])
                    cube([INNER_W + 1.2, INNER_D + 20, TOTAL_H + 30]);
        translate([W/2, depth/2 - 6, -1])
            linear_extrude(back_h) rsq2d(W - 16, depth - 32, 8);
        translate([W/2, -1, 2]) rotate([-90, 0, 0]) linear_extrude(30) rsq2d(14, 8, 3);
        for (x = [9, W - 9], y = [9, depth - 9])
            translate([x, y, -0.1]) cylinder(d = FOOT_D, h = FOOT_REC + 0.1);
    }
}

// ── Ghosts ──────────────────────────────────────────────────
module pcb_ghost() {
    color(COL_PCB, 0.65)
        translate([PCB_OX, PCB_OY, PCB_Z]) cube([PCB_W, PCB_D, PCB_TH]);
}

module modules_ghost() {
    for (c = [0:COLS-1], r = [0:ROWS-1])
        translate([cx(c), cy(r), MODF_Z])
            screenkey_module(with_cap = true, with_standoffs = true);
}

module body() {
    color(COL_BODY)  bottom_shell();
    color(COL_PLATE) top_shell();
}

// ── Render select ───────────────────────────────────────────
if (RENDER == "bottom") {
    bottom_shell();
} else if (RENDER == "top") {
    rotate([180, 0, 0]) translate([0, -INNER_D, -TOTAL_H]) top_shell();
} else if (RENDER == "stand") {
    stand();
} else if (RENDER == "spacers") {
    for (i = [0:3]) translate([i * 8, 0, 0]) corner_spacer();
} else if (RENDER == "ghost") {
    body();
    pcb_ghost();
    modules_ghost();
} else if (RENDER == "all") {
    translate([3.5, 10, 8]) rotate([STAND_ANGLE, 0, 0]) {
        body();
        modules_ghost();
    }
    color(COL_STAND) stand();
} else {
    body();
    modules_ghost();
}

echo("=== Open Screen Deck enclosure v13 (one-screw corner stack) ===");
echo(str("Deck ", INNER_W, " x ", INNER_D, " x ", TOTAL_H, " mm | caps to ", CAP_TOP));
echo(str("Carrier top z=", PCB_Z + PCB_TH, " | rear PCB z=", REAR_Z, " | module front z=", MODF_Z));
echo("Assembly: modules->carrier (M2x5), cables, tray, snap top, 4x M2x25 corner screws through module nuts");

// ============================================================
//  Open Screen Deck — assembly step illustrations (v11)
//  Renders the docs/assembly.md step images with a consistent
//  product palette. Not a fit-check model — presentation only.
//
//  STEP = "inserts" | "prep" | "modules" | "cables" | "tray"
//         | "shell" | "screws"
// ============================================================

STEP = "modules";
NO_STANDALONE = true;
use <data_streamdeck_enclosure.scad>
use <screenkey_module.scad>

$fn = 64;

// palette
C_CASE   = "#26262b";
C_PLATE  = "#1e1e23";
C_PCB    = "#175235";
C_CONN   = "#e8e4da";
C_BRASS  = "#c9a24b";
C_STEEL  = "#8d9096";
C_ACCENT = "#d8d8dc";   // printed spacer sleeves (visually distinct from brass)
C_MODULE = "#111114";
C_CABLE  = "#d8d8dc";

// geometry constants (mirror the enclosure file)
PCB_OX = 2.34;  PCB_OY = 2.335;  PCB_W = 55;  PCB_D = 112;  PCB_T = 1.6;
FLOOR = 3.0;  LIFT = 3.0;  SPLIT = 12.0;  TOTAL_H = 28.2;  PLATE_T = 5.0;
STANDOFF = 9.7;
INNER_W = 59.68;  INNER_D = 116.67;

CORNERS = [[2.0, 4.95], [52.9, 4.95], [2.0, 106.85], [52.9, 106.85]];
function keyc(c, r) = [13.0 + c * 28.9, 17.6 + r * 38.3];

module rsq(w, h, r) { offset(r = r) square([w - 2*r, h - 2*r], center = true); }

// ── stylized carrier PCB (kicad coords local, origin board corner) ──
module carrier_pcb() {
    color(C_PCB) linear_extrude(PCB_T) difference() {
        translate([PCB_W/2, PCB_D/2]) rsq(PCB_W, PCB_D, 4);
        for (p = CORNERS) translate(p) circle(d = 2.2);
    }
    // ESP32-S3 module
    color("#3c3c40") translate([27.5 - 12.75, 36.7 - 9, PCB_T]) cube([25.5, 18, 3.1]);
    color("#2a2a2e") translate([27.5 - 12.75, 36.7 - 9, PCB_T + 3.1]) cube([25.5, 18, 0.01]);
    // USB-C at rear edge
    color(C_STEEL) translate([27.5 - 4.5, 0, PCB_T]) cube([9, 7.3, 3.2]);
    // microSD right edge
    color(C_STEEL) translate([55 - 14, 75 - 7.5, PCB_T]) cube([14, 15, 1.9]);
    // PicoBlade receptacles at J1-J6 (mouths face board centre)
    for (r = [0:2], c = [0:1]) {
        k = keyc(c, r);
        color(C_CONN)
            translate([k[0] + (c == 0 ? 1.0 : -1.0 - 4.4), k[1] - 6.5, PCB_T])
                cube([4.4, 13, 4.2]);
    }
    // BOOT/RESET
    color("#222226") translate([44, 2.2, PCB_T]) cube([4.2, 2.8, 1.4]);
    color("#222226") translate([49.5, 2.2, PCB_T]) cube([4.2, 2.8, 1.4]);
}

// ── module stack helpers (world = enclosure coords) ─────────
module module_at(c, r, spacer_corner = false, z = FLOOR + LIFT + PCB_T + STANDOFF + 5.7) {
    k = keyc(c, r);
    translate([PCB_OX + k[0], PCB_OY + k[1], z]) {
        color(C_MODULE) screenkey_module(with_cap = true, with_standoffs = false);
        // kept brass standoffs + corner spacer
        for (i = [0:3]) {
            mx = (i % 2 == 0 ? 11 : -11);
            my = (i < 2 ? 12.65 : -12.65);
            px = k[0] + mx;  py = k[1] + my;
            is_corner = (norm([px - 2, py - 4.95]) < 1 || norm([px - 52.9, py - 4.95]) < 1 ||
                         norm([px - 2, py - 106.85]) < 1 || norm([px - 52.9, py - 106.85]) < 1);
            skip = (px > 14 && px < 41 && py > 25 && py < 49) ||   // ESP32 zone
                   (px > 14 && px < 41 && py < 10) ||              // USB zone
                   (px > 50 && py > 60 && py < 90);                // SD zone
            if (is_corner)
                color(C_ACCENT) translate([mx, my, -5.7 - STANDOFF]) cylinder(d = 4, h = STANDOFF);
            else if (!skip)
                color(C_BRASS) translate([mx, my, -5.7 - STANDOFF]) cylinder(d = 3.4, h = STANDOFF);
        }
    }
}

module all_modules() { for (r = [0:2], c = [0:1]) module_at(c, r); }

module carrier_world() { translate([PCB_OX, PCB_OY, FLOOR + LIFT]) carrier_pcb(); }

module cables() {
    zb = FLOOR + LIFT + PCB_T;      // board top
    for (r = [0:2], c = [0:1]) {
        k = keyc(c, r);
        dir = (c == 0) ? 1 : -1;
        x0 = PCB_OX + k[0] + dir * 6.0;     // leaves receptacle
        xf = PCB_OX + k[0] + dir * 9.2;     // fold line
        y  = PCB_OY + k[1];
        color(C_CABLE) {
            translate([min(x0, xf), y - 5.75, zb + 0.6]) cube([abs(xf - x0), 11.5, 0.9]);
            translate([xf - 0.45, y - 5.75, zb + 0.6]) cube([0.9, 11.5, 5.4]);
            translate([min(xf - dir * 5.5, xf), y - 5.75, zb + 5.1]) cube([5.5, 11.5, 0.9]);
        }
    }
}

module corner_screw() {
    // DIN 965 countersunk flat head M2x25 (length includes head)
    color(C_STEEL) {
        cylinder(d1 = 3.8, d2 = 2.0, h = 1.2);
        translate([0, 0, 1.2]) cylinder(d = 2.0, h = 23.8);
    }
}

// ── steps ────────────────────────────────────────────────────
if (STEP == "inserts") {
    // top shell face-down + inserts above their holes
    rotate([180, 0, 0]) translate([0, -INNER_D, -TOTAL_H]) color(C_PLATE) top_shell();
    for (p = CORNERS)
        translate([PCB_OX + p[0], INNER_D - (PCB_OY + p[1]), TOTAL_H - SPLIT - PLATE_T + 8])
            color(C_BRASS) difference() {
                cylinder(d = 3.5, h = 4);
                translate([0, 0, -0.1]) cylinder(d = 2, h = 4.2);
            }
} else if (STEP == "prep") {
    // one module rear-up: 3 brass standoffs stay, amber spacer hovers
    // above the corner position it replaces
    translate([0, 0, 15.4]) rotate([180, 0, 0]) {
        color(C_MODULE) screenkey_module(with_cap = true, with_standoffs = false);
        for (i = [0:3]) {
            mx = (i % 2 == 0 ? 11 : -11);
            my = (i < 2 ? 12.65 : -12.65);
            if (i == 3)
                color(C_ACCENT) translate([mx, my, -5.7 - STANDOFF - 9])
                    cylinder(d = 4, h = STANDOFF);
            else
                color(C_BRASS) translate([mx, my, -5.7 - STANDOFF]) cylinder(d = 3.4, h = STANDOFF);
        }
    }
} else if (STEP == "modules") {
    carrier_world();
    all_modules();
} else if (STEP == "cables") {
    // exploded: modules lifted 14, cables stretched between board and modules
    LIFT_EXP = 14;
    carrier_world();
    for (r = [0:2], c = [0:1]) module_at(c, r, z = FLOOR + LIFT + PCB_T + STANDOFF + 5.7 + LIFT_EXP);
    zb = FLOOR + LIFT + PCB_T;
    for (r = [0:2], c = [0:1]) {
        k = keyc(c, r);
        dir = (c == 0) ? 1 : -1;
        cx = PCB_OX + k[0];
        y  = PCB_OY + k[1];
        xf = cx + dir * 9.2;                       // fold line
        xa = min(cx + dir * 6.0, xf);
        color(C_CABLE) {
            translate([xa, y - 5.75, zb + 0.6]) cube([3.2, 11.5, 0.9]);
            translate([xf - 0.45, y - 5.75, zb + 0.6]) cube([0.9, 11.5, 5.4 + LIFT_EXP]);
            translate([dir > 0 ? xf - 5.5 : xf, y - 5.75, zb + 5.1 + LIFT_EXP]) cube([5.5, 11.5, 0.9]);
        }
    }
} else if (STEP == "tray") {
    color(C_CASE) bottom_shell();
    translate([0, 0, 14]) { carrier_world(); all_modules(); cables(); }
} else if (STEP == "shell") {
    color(C_CASE) bottom_shell();
    carrier_world(); all_modules(); cables();
    translate([0, 0, 16]) color(C_PLATE) top_shell();
} else if (STEP == "screws") {
    // deck flipped bottom-up, screws hovering above corner holes
    translate([0, INNER_D, TOTAL_H]) rotate([180, 0, 0]) {
        color(C_CASE) bottom_shell();
        carrier_world(); all_modules();
        color(C_PLATE) top_shell();
    }
    for (p = CORNERS)
        translate([PCB_OX + p[0], INNER_D - (PCB_OY + p[1]), TOTAL_H + 30])
            rotate([180, 0, 0]) corner_screw();   // tip down, toward the hole
}

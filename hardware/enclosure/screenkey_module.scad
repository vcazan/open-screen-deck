// ============================================================
//  Waveshare 0.85" ScreenKey Module B (SKU 34168) — replica v2
//
//  Construction per dimension drawing + product photos:
//    keycap (8.60 proud) on switch
//    FRONT PCB 25.94 × 35.29 × 1.6  (switch + LCD FPC side)
//    4× SOLDERED THREADED NUTS (M2) between the boards @ 22.0 × 25.3
//    REAR PCB 25.94 × 35.29 × 1.6   (9P connector underneath)
//    4× removable brass standoffs threaded into the nuts from rear
//    Total with standoffs: 24.0 (cap top → standoff tip)
//
//  Mounting WITHOUT standoffs: M2 screws from behind, through the
//  rear-PCB corner holes, into the internal soldered nuts.
//
//  Origin: centre of FRONT PCB front face. Cap +Z, boards −Z.
// ============================================================

MOD_W       = 25.94;
MOD_H       = 35.29;
PCB_T       = 1.60;
NUT_GAP     = 2.50;    // soldered nut spacer between the two boards
CAP_PROUD   = 8.60;    // cap top above front PCB front face
MOD_TOTAL   = 24.00;   // with factory standoffs installed
// depth behind front face without standoffs:
BODY_DEPTH  = PCB_T + NUT_GAP + PCB_T;              // 5.7
STANDOFF_L  = MOD_TOTAL - CAP_PROUD - BODY_DEPTH;   // 9.7 (removable)
STANDOFF_D  = 3.4;
NUT_OD      = 4.0;     // soldered M2 nut/spacer
NUT_ID      = 1.6;     // M2 thread
MOUNT_DX    = 22.00;
MOUNT_DY    = 25.30;

CAP_W       = 19.40;
CAP_R       = 3.0;
CAP_H       = 6.2;
GLASS_W     = 15.21;

SW_BODY_W   = 14.0;
SW_BODY_H   = 2.4;

CONN_W      = 3.6;     // 9P PicoBlade receptacle on rear PCB underside
CONN_L      = 13.0;
CONN_H      = 4.4;

function screenkey_mounts() = [
    [ MOUNT_DX/2,  MOUNT_DY/2],
    [-MOUNT_DX/2,  MOUNT_DY/2],
    [ MOUNT_DX/2, -MOUNT_DY/2],
    [-MOUNT_DX/2, -MOUNT_DY/2]
];

// z of the rear PCB back face relative to origin (mounting datum)
function screenkey_rear_z() = -BODY_DEPTH;

module _rsq(w, h, r) {
    offset(r = r) square([w - 2*r, h - 2*r], center = true);
}

module _pcb(z_top) {
    color("#161618")
        translate([0, 0, z_top - PCB_T])
            linear_extrude(PCB_T)
                difference() {
                    _rsq(MOD_W, MOD_H, 1.5);
                    for (p = screenkey_mounts())
                        translate(p) circle(d = 2.2);
                }
}

module screenkey_cap() {
    color("#141416")
        translate([0, 0, SW_BODY_H])
            linear_extrude(CAP_H - 1.2)
                _rsq(CAP_W, CAP_W, CAP_R);
    color("#0d0d10")
        translate([0, 0, SW_BODY_H + CAP_H - 1.2])
            hull() {
                linear_extrude(0.01) _rsq(CAP_W, CAP_W, CAP_R);
                translate([0, 0, 1.2])
                    linear_extrude(0.01) _rsq(CAP_W - 1.6, CAP_W - 1.6, CAP_R - 0.6);
            }
    color("#1a2b3c")
        translate([0, 0, SW_BODY_H + CAP_H + 0.011])
            linear_extrude(0.05)
                _rsq(GLASS_W, GLASS_W, 0.8);
}

module screenkey_module(with_cap = true, with_standoffs = false) {
    // FRONT PCB (switch carrier)
    _pcb(0);

    // soldered threaded nut spacers between the boards
    for (p = screenkey_mounts())
        color("#c9a24b")
            translate([p[0], p[1], -PCB_T - NUT_GAP])
                difference() {
                    cylinder(d = NUT_OD, h = NUT_GAP, $fn = 24);
                    translate([0, 0, -0.1]) cylinder(d = NUT_ID, h = NUT_GAP + 0.2, $fn = 16);
                }

    // REAR PCB (connector board)
    _pcb(-PCB_T - NUT_GAP);

    // 9P receptacle on rear PCB underside
    color("#e8e4da")
        translate([MOD_W/2 - CONN_W - 0.6, -CONN_L/2, -BODY_DEPTH - CONN_H])
            cube([CONN_W, CONN_L, CONN_H]);

    // switch body on front
    color("#3a3a3e")
        linear_extrude(SW_BODY_H)
            _rsq(SW_BODY_W, SW_BODY_W, 1.2);

    // factory standoffs (removable — unscrew from the nuts)
    if (with_standoffs)
        for (p = screenkey_mounts())
            color("#b28a3e")
                translate([p[0], p[1], -BODY_DEPTH - STANDOFF_L])
                    difference() {
                        cylinder(d = STANDOFF_D, h = STANDOFF_L, $fn = 24);
                        translate([0, 0, -0.1]) cylinder(d = NUT_ID, h = STANDOFF_L + 0.2, $fn = 16);
                    }

    if (with_cap) screenkey_cap();
}

if (is_undef(NO_STANDALONE)) screenkey_module(with_standoffs = true);

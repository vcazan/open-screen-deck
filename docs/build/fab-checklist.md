# Fab Checklist — Open Screen Deck Carrier PCB

Use before ordering from JLCPCB / PCBWay.

## Generate outputs

```bash
chmod +x scripts/build_hardware.sh
./scripts/build_hardware.sh
```

## Pre-order (KiCad GUI)

1. Open `hardware/pcb/data_streamdeck.kicad_pro`
2. **Schematic** — run ERC; confirm ESP32 ↔ ScreenKey nets
3. **PCB** — finish routing from ESP32 module to global labels (generator places footprints + SPI trunk)
4. **DRC** — target zero errors (current generator may show courtyard/clearance warnings until routing complete)
5. **3D view** — USB-C aligns with enclosure rear slot; microSD reachable via bottom cutout
6. Assign **LCSC/JLC** parts in BOM tool if using SMT assembly

## Upload to fab

| File | Location |
|------|----------|
| Gerbers | `hardware/pcb/gerbers/*.gbr` |
| Drill | `hardware/pcb/gerbers/*-NPTH.drl` and `*-PTH.drl` |
| BOM | `hardware/pcb/bom.csv` |

**Suggested spec:** 2-layer, 1.6 mm, FR4, **ENIG**, matte black mask, 1 oz copper.

## Assembly order

1. Solder **U1** (ESP32-S3 module) — reflow or hot plate  
2. Solder **J7** USB-C — verify orientation (rear-facing)  
3. Solder **J1–J6** — pin 1 toward KEY net (see schematic title block)  
4. Solder **J8** microSD  
5. Passives **0402/0805**  
6. Mount modules per [Assembly Guide](assembly.md) (M2×5 into factory standoffs; corner
   spacers at H1–H4 for the M2×25 case screws)  
7. Plug **6× ScreenKey** cables (in-box 200 mm; fold slack flat)  
8. Flash firmware over the on-board USB-C — see [Flashing](../firmware/flashing.md)  

## Bring-up tests

- [ ] USB-C powers board; 3.3 V at module connectors  
- [ ] All six displays init (SPI)  
- [ ] All six keys debounce  
- [ ] HID F13–F18 typed on Mac/Win/Linux (page 1 defaults)  
- [ ] CDC serial: `PING` → `pong`  
- [ ] microSD mounts (`SD_INFO` reports the card)  

## Enclosure fit

- [ ] M2×25 corner screws pass H1–H4 → module nuts → top-plate inserts  
- [ ] USB-C flush with rear slot  
- [ ] microSD access slot (optional cutout)  
- [ ] Top shell closes; keys travel OK  

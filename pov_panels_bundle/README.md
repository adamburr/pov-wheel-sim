# POV wheel LED panels — design notes and generator

Hardware for running the **pov-wheel-sim** display on a real bicycle wheel: two identical flat-cut panels
that clamp onto the front hub, one on each side, and carry the LED strips, battery and electronics.

Target wheel: **700c front, 32 spokes, 3-cross, rim brake (no rotor)**.
Final material: **G-10/FR-4, 1/16" (1.6 mm), waterjet cut** (SendCutSend).

> **Status: not yet verified on the bike.** Only the bore (1.5") and the tip radius (11.75") are measured.
> Every other wheel and fork dimension is a *typical value*. Read [Before you order](#before-you-order).

---

## Contents of this bundle

| Path | What it is |
|---|---|
| `README.md` | This file |
| `pov_panels.py` | The generator: geometry, bending model, clearance checks, DXF and preview output |
| `wheel3x.py` | 3D model of a laced wheel (spoke paths, crossings, interlace), used by the checks |
| `out/700c_32h3x_{2,3,4}strips_g10_063/` | One folder per layout (2, 3 or 4 LED strips per side) |
| `…_panel_QTY2_cut_in.dxf` | **The cut file.** Inches, one layer, closed outlines. Order **2** (left and right are the same part) |
| `…_reference_mm.dxf` | Both panels in mm with LED lines and labels. For reference only, **do not cut** |
| `…_preview.png` | Panels on the wheel (plan), side section with all 32 spokes, dimensioned flat part, summary numbers |
| `…_report.json` | Every computed number: geometry, forces, stresses, clearances, settings for the simulator |

---

## How it works

Each panel is a flat **star of straight, tapered blades**, one blade per LED strip. The panels are cut flat
and go on the hub with a 1.5" centre bore. Each one rests on the spoke heads of its own hub flange.

The blade tips reach the rim, where they meet the matching tips of the other panel in the wheel's centre
plane. **Tips are zip-tied tip-to-tip to each other, never to the spokes.** Pulling the tips together bends
every blade like a leaf spring. The reaction from that bending clamps both panels onto the hub and keeps
them centred. Nothing else holds them.

**Assembly**
1. Zip-tie the battery and electronics to the left panel's plate (inner face).
2. Fit the LED strips on the outer faces. Ties go across the strip, between pixels.
3. Slide the left panel over the hub, then the right panel. Line each tip up between two spokes, or over a
   spoke for the 3-blade layout (see below).
4. Tie each pair of tips together through the outermost hole pair.
5. Connect the strips to the electronics.

## Geometry

Every edge is a straight line with a rounded corner (R2.0 mm on the outline, R1.0 mm on the holes, about R1.8 mm
in the slot). The only curve is the centre bore. Every blade has identical geometry, so both panels flex the
same way and the tips meet on the centre line.

**Blade**
- **Length and taper:** each blade runs 301.8 mm from the centre when flat. Bending shortens it by 3.3 mm, so
  the tip end lands at 298.4 mm, the measured 11.75". The arm tapers from 56.1 mm wide at the centre to 27 mm
  at the tip.
- **Electronics plate:** 82.6 mm wide, running 50.4 mm out from the centre. It then tapers over 71.1 mm to the
  plain blade. The taper is fitted to the holes: its edge clears the 4th hole column of the second row by
  exactly 4 mm.
- **Nipple slot:** every tip has a slot 5.0 mm wide and 3.7 mm deep, open at the tip end. When a tip lands on a
  spoke, the nipple sits in the slots of both panels. The slot bottom is 1 mm inside the nipple's inner end.
  Change it with `tip_slot` (`all` / `auto` / `none`).
- **3- and 4-blade parts:** straight edges join the corners of neighbouring plates around the hub, so no
  narrow slots are left between blades.

**Zip-tie holes**
- **Hole size:** square holes, 4.6 mm (tie width 3.6 + 1.0). They fit 40 lb ties (178 N, 3.6 × 1.27 mm) and
  18 lb ties (80 N, 2.4 × 1.1 mm) either way round.
- **Rows:** the two rows beside the LED lane have their hole centres on the 14 mm strip's edges (±7 mm), so a tie
  hugs the strip. Further rows are every 14 mm across the blade.
- **Along the blade:** holes are every 2 pixels (13.89 mm), so ties across the strip land between LEDs.
- **One grid per blade:** the grid is pushed out toward the tip as far as the edge rule allows.
- **Spacing rules:** at least 4.0 mm of material from any hole to the outer edge, including the slot, and at
  least 3.0 mm to the bore. Holes are at least 7.7 mm apart.
- **Where grids meet (3 and 4 blades):** each hole belongs to the blade whose axis it is nearest. A hole closer
  than 4 mm to a hole of another blade is dropped.
- **Centre column (2 blades):** two holes sit on the line through the bore, above and below it.

**Tie heads**
- **Inner face:** heads go on the inner face, across the LED lane.
- **Innermost tie on each blade (r ≈ 30 mm):** the head would hit the spokes, so put it on the outer face
  beside the strip. It stands lower than the strip.
- **3-blade layout:** one extra position also needs the head outside (r ≈ 44 mm on the blade at 296°).
  `report.json → tie_heads_inside.move_outside` lists every such position.

## Layouts (G-10)

| Strips | Blade spacing | Holes | Panel mass | Max stress (limit 60) | Tip force | Part size |
|---|---|---|---|---|---|---|
| 2 | 180° | 122 | 78.7 g | 31.7 MPa | 1.76 N | 3.26 × 23.77 in |
| 3 | 120° ×3, one tip on a spoke | 168 | 114.5 g | 16.0 MPa | 1.76 N | 18.25 × 21.04 in |
| 4 | 90° ×4 | 216 | 142.7 g | 25.5 MPa | 1.76 N | 17.48 × 17.48 in |

All three layouts carry 39 LEDs per blade, from r = 23 mm to r = 294 mm on the wheel.

**3 blades on 32 spokes.** Three evenly spaced tips can't all fall between spokes on a 32-spoke wheel, so one
blade is centred on a spoke (rim hole 5). That tip pair **sandwiches the spoke**, with the nipple sitting in the
tip slots.
- **Pros:** the blades stay exactly 120° apart, which matches the simulator's evenly spaced strips. Clamping the
  spoke also stops the panels rotating on the hub.
- **Cost:** at the ties the spoke is about 1.8 mm off the centre plane, so that tip pair sits slightly
  off-centre. The other two tips clear their spokes by 3.4 mm sideways.

## The model (what `pov_panels.py` computes)

1. **Wheel** (`wheel3x.py`). A 32-hole, 3-cross lacing with holes alternating between flanges, heads-in and
   heads-out faces, and interlacing at the outermost cross. Spokes run straight from the flange to the rim. The
   modelled rim sits just outside the measured tip.
2. **Tip angles.** Tips go exactly 360°/N apart, rotated so they get the most room between spokes. If even
   spacing can't clear the spokes (3 strips), one tip is centred on a spoke instead (`sandwich_ok`).
3. **Flat geometry.**
   - Build the reference blade: hole grid, plate snapped to the grid, grid pushed to the tip, taper fitted.
   - Repeat it around the hub and add the hub plate.
   - Fillet every corner with true arcs.
   - Cut the nipple slots.
   - Place and check the holes.
4. **Bending.**
   - Each blade is a tapered cantilever, from the contact ring on the spoke heads (r = PCD/2) to the tip tie.
     The hub area adds a little rotation of its own.
   - The model gives the tip force, the clamp force on the hub (N × tip force) and the bent shape.
   - The flat blade is lengthened until the bent tip lands on the measured radius.
   - Stress is checked along the blade and across the hub section, with the bore and holes removed. For
     3 and 4 blades, the hub section is limited to each blade's own sector.
5. **Checks.**
   - Panel against all 32 spokes in 3D: collisions, gaps along the blade and at the tips, and the sandwiched
     spoke reported separately.
   - Outer side against the fork: the bare panel face, and the LED strip plus a tie band over it (4.0 + 1.27 mm).
   - Tie heads on the inner face against the spokes.
6. **Output.**
   - The cut DXF is rotated to its smallest bounding box. It contains only LWPOLYLINEs with arc bulges, plus
     one CIRCLE for the bore, all on layer 0, in inches.
   - Also written: the reference DXF, the preview and the report.

**Not modelled:** with 3 or 4 blades the hub area has to dish slightly, like a shallow cone, which adds some
in-plane stress the beam model doesn't capture. Stresses are well under the limit, but treat the 3- and
4-blade margins as less certain than the 2-blade one.

## Running it

Requires Python 3 with `shapely`, `ezdxf` and `matplotlib`.

```bash
python3 pov_panels.py --all                       # G-10, 2, 3 and 4 strips -> out/
python3 pov_panels.py --strips 3                  # one layout
python3 pov_panels.py --material hardboard_125    # prototype material (also birch_125, delrin_125)
python3 pov_panels.py --size 650b --strips 2      # other wheel sizes: 700c, 29in, 650b, 26in, 24in, 20in
python3 pov_panels.py --set led_pitch=7.0 tip_slot=none pcd_left=45 pcd_right=45
```

`--set key=value` overrides any `WHEEL`, `PANEL` or material key. These are the ones you're most likely to change:

| Key | Default | Meaning |
|---|---|---|
| `bore_d` | 38.1 | Centre hole (measured 1.5") |
| `tip_end_r` | 298.45 | Radius of the tip end on the wheel (measured 11.75") |
| `led_pitch` | 6.944 | Pixel pitch; tie holes every `holes_every` pixels |
| `strip_w`, `strip_t` | 14, 4 | Strip in its sleeve (Adafruit 2241) |
| `tie_w`, `tie_t`, `tie_clear` | 3.6, 1.27, 1.0 | Tie strap and hole clearance |
| `grid_edge`, `bore_edge` | 4.0, 3.0 | Minimum material from a hole to the edge / to the bore |
| `plate_half_w`, `plate_len`, `plate_taper_cols` | 41.3, 48, 4 | Electronics plate (snapped to the hole grid) |
| `tip_slot`, `nipple_d`, `tip_slot_clear` | all, 4.0, 1.0 | Nipple slot |
| `pcd_left/right`, `c2f_left/right`, `old` | 44, 35, 100 | Hub (typical) |
| `fork_crown_r`, `fork_crown_half`, `min_fork_clear` | 340, 22, 3 | Fork (typical, straight legs) |
| `material` | g10_063 | `g10_063`, `birch_125`, `hardboard_125`, `delrin_125` |

The console prints a summary line per layout and a **WARNING** for any check that fails.

## Materials

| Key | Material | Thickness | E | Stress target | Use |
|---|---|---|---|---|---|
| `g10_063` | G-10/FR-4 | 1.6 mm | 18 GPa | 60 MPa | Final, waterjet |
| `birch_125` | Baltic birch plywood | 3.175 mm | 9 GPa | 25 MPa (short-term) | Prototype, laser; blades along the face grain |
| `hardboard_125` | Hardboard | 3.175 mm | 4.5 GPa | 15 MPa (short-term) | Prototype, laser |
| `delrin_125` | Delrin 150 | 3.175 mm | 2.9 GPa | 20 MPa | Laser |

These are typical material values, not tested ones. The prototype targets are short-term, about a third of typical
bending strength. Use prototypes for fit checks only.

## Before you order

| Check | Why it matters |
|---|---|
| **Fork inner width along the legs (M11/M12)** | **Tight.** On the typical straight-leg fork model, the LED strip plus a tie band clears by only **0.8 mm** at r ≈ 90 mm. The target is 3 mm; the bare panel clears by 6 mm. If your fork is tight, leaving ties off the strip between r ≈ 80 and 110 mm gets back to about 2 mm. |
| **LED pixel pitch** | Adafruit says "144 LEDs per meter" and "7 mm" (rounded). The model uses 1000/144 = 6.944 mm. Measure from the centre of pixel 1 to the centre of pixel 37: 250.0 mm means 6.944, 252.0 mm means 7.0. At the wrong pitch the outer ties drift about 2 mm onto the LEDs. |
| **Flange spoke-hole circle (M21)** | Assumed 44 mm. It must be larger than the 1.5" bore for the panel to rest on the spoke heads. |
| **What the 1.5" bore sits on** | It centres the panels. |
| **Tip position** | Confirm that 11.75" is where the blade tip should end, not the rim. |
| **Rim wall and nipple length inside the rim (M20/M23), nipple diameter** | These set the slot depth and the sandwiched tip. |

## Known limitations and ideas not adopted

- **Fork clearance is unproven** until the fork is measured (see above).
- **Hub stretching not modelled:** the 3- and 4-blade hubs must dish slightly, and that stress isn't computed.
  Radial slots at the bore along each blade would relieve it. That idea was discussed and not adopted yet.
- **Recessing the strip into a slot for fork clearance was rejected.** The slot would need to be about 15 mm
  wide and would cut through the hole rows. It gains at most 1.6 mm, and in the wrong place.
- **3.6 mm ties are wider than the gap between pixels.** The 5050 LED packages leave about 1.9 mm between them,
  so 40 lb ties overlap each package edge by about 0.8 mm. 18 lb ties (2.4 mm) nearly fit the gap.

## Revision summary

- Panels went from zip-tied to spokes (PVC/HDPE concepts) to self-supporting blades tied tip-to-tip.
- Straight edges only, with every corner rounded. Hole grid with tie-sized square holes. Single grid alignment
  and a 4 mm edge rule.
- 1.5" bore and 11.75" tip from measurements. Adafruit 2241 strip. G-10 final material, wood prototypes.
- Identical panels with an electronics plate 6 holes wide. Rows on the strip edges, 14 mm apart. Grid pushed
  to the tips. Centre plate holes restored. Taper fitted to 4 columns.
- 2-, 3- and 4-blade layouts with a hub plate. Three blades at an even 120°, with one tip sandwiching a spoke.
- Nipple slot in every tip. Fork check now includes the strip and tie band; tie-head check added. Cut files
  rotated to the smallest bounding box.

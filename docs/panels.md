# LED panels: design notes

Hardware for running the display on a real bicycle wheel: two identical flat-cut panels that clamp onto the
front hub, one on each side, and carry the LED strips. The battery and electronics attach to the hub. The
app designs the panels in the **Panels** tab and writes the cut file.

Target wheel: **700c front, 32 spokes, 3-cross, rim brake (no rotor)**.
Material: **Baltic birch plywood, .125" (3.18 mm), laser cut by SendCutSend**, with **2 strips** per side so
both blades run along the face grain (see [Baltic birch](#baltic-birch)). G-10/FR-4 1/16" (waterjet) also works,
with any of the layouts.

> **Status: not yet verified on the bike.** Only the bore (1.5") and the tip radius (11.75") are measured.
> Every other wheel and fork dimension is a *typical value*. Read [Before you order](#before-you-order).

## Using the Panels tab

Open **⚙️ Settings → Panels**. The main area switches to a drawing of the part (**← Ride** goes back):

- **Flat part**: the part as cut, with the dimensions needed to check or rebuild it.
- **On the wheel**: the bent panel seen from the right, over every spoke, with the LED strips and magnetometer
  boards. *Left* / *Right* picks the panel.
- **Side section**: a section through the axle with all the spokes, both panels bent by the tip ties, the
  flanges, the fork and the rim (lateral scale ×3).

Drag to pan, scroll or pinch to zoom, and double-click (or press **F**) to fit. **📏 Measure** (or **M**)
measures between two clicked points, snapping to outline corners, hole corners and hole centres; **Esc** stops.

The tab shows the result (part size, holes, mass, LEDs, forces, stress and clearances, with a warning for any
check that fails) and the downloads:

| Download | What it is |
|---|---|
| **Cut file (DXF, inches)** | `…_panel_QTY2_cut_in.dxf`. Inches, one layer, closed outlines. Order **2** (left and right are the same part). If the two panels ever differ, it writes a LEFT and a RIGHT file instead |
| **Reference DXF (mm)** | Both panels in mm with LED lines, sensor boards and labels. For reference only, **do not cut** |
| **Report (JSON)** | Every computed number: geometry, forces, stresses, clearances, and settings for the simulator |

**Use in simulator** points the simulator's strips at where the panels hold the LEDs: their start radius and
length, and a shallower rim when the outer LEDs need one.

### Shared settings

The panels use the same build as the simulator. From the **Hardware** tab:

| Setting | Used for |
|---|---|
| *Strips* | Blades per side (the panels come with 2, 3 or 4). Also under Panels |
| *LEDs / m* | Pixel pitch: the tie holes sit every *Holes every N pixels* LEDs, between pixels |
| *Spokes* | The laced wheel model |
| *Wheel size*, *Rim BSD*, *Rim depth* | The rim's inner wall (BSD/2 − depth) and the spoke ends (ERD = 2 × (wall radius + 4 mm)). When the measured tips don't fit inside that wall, the rim is assumed just outside them |
| *Sync*, *Sensor per strip* | Magnetometer boards under the left panel's blades: one per strip, or one in all |

The panels' own settings are part of the setup file:

| Setting | Default | Meaning |
|---|---|---|
| Material | Baltic birch 1/8" | See [Materials](#materials) |
| Tip radius | 298.45 mm | Radius of the tip end on the wheel (measured 11.75"); 0 = just inside the rim wall |
| Bore Ø | 38.1 mm | Centre hole (measured 1.5") |
| Nipple slot | every tip | Slot in the tip end for a spoke nipple |
| Strip width, thickness | 14, 4 mm | Strip in its sleeve (Adafruit 2241) |
| Tie width, hole clearance | 3.6, 1.0 mm | Tie strap and hole clearance: the holes are square, 4.6 mm |
| Holes every N pixels | 2 | Tie holes along the blade |
| Hole to edge, to bore | 4.0, 3.0 mm | Minimum material from a hole to the outer edge, and to the bore |
| Corner radius | 2.0 mm | On every outline corner |
| Blade width at centre | 75 mm | The blade tapers straight from this to the tip width (27 mm) |
| Plate half width, length, taper columns | 55.3, 20 mm, 1 | Hub plate: a wide, short plate round the bore that carries the bending through the hub (snapped to the hole grid) |
| Holes beside the bore | off | Holes on the line through the bore; they weaken the hub section |
| Spoke crosses, flange hole circle, centre to flange, over-locknut | 3, 44, 35, 100 mm | Hub (typical) |
| Fork crown radius, half-width at crown | 340, 22 mm | Fork (typical, straight legs) |

## How it works

Each panel is a flat **star of straight, tapered blades**, one blade per LED strip. The panels are cut flat
and go on the hub with a 1.5" centre bore. Each one rests on the spoke heads of its own hub flange.

The blade tips reach the rim, where they meet the matching tips of the other panel in the wheel's centre
plane. **Tips are zip-tied tip-to-tip to each other, never to the spokes.** Pulling the tips together bends
every blade like a leaf spring. The reaction from that bending clamps both panels onto the hub and keeps
them centred. Nothing else holds them.

**Assembly**
1. Fit the battery and electronics to the hub.
2. Fit the LED strips on the outer faces. Ties go across the strip, between pixels.
3. Slide the left panel over the hub, then the right panel. Line each tip up between two spokes, or over a
   spoke for the 3-blade layout (see below).
4. Tie each pair of tips together through the outermost hole pair.
5. Connect the strips to the electronics.

## Baltic birch

SendCutSend's .125" Baltic birch is 3-ply (3.18 mm, B/BB, laser cut, ±0.005"). Plywood is far stiffer and stronger
along its face grain. For 4 mm 3-ply birch, [Metsä Wood's declaration of performance](https://www.metsagroup.com/globalassets/metsa-wood/dop-documents/dop_metsa_wood_birch_plywood_muf_2019-12-2_en.pdf)
gives:

| | Along the face grain | Across |
|---|---|---|
| Bending stiffness (mean) | 16 471 MPa | 1 029 MPa |
| Bending strength (characteristic) | 65.9 MPa | 10.6 MPa |
| Stress target: permanent load, 0.6 × strength / 1.2 (Eurocode 5) | 33.0 MPa | 5.3 MPa |

Blades at other angles follow Hankinson's formula. The bent shape doesn't depend on stiffness, so each blade's
tip force and stress scale with its stiffness along its own direction.

- **Use 2 strips.** Only the 2-blade part has every blade along the grain. With 3 strips the two blades at 60° to
  the grain push 1.1 N against the first one's 13.5 N, so the panel clamps the hub unevenly and tilts on it. With
  4 strips the two blades along the grain carry nearly all the clamp, and they and the hub section are
  overstressed (49 MPa).
- **Order note:** SendCutSend doesn't say how it lays parts on the sheet. Ask for the face grain along the part's
  length (along the blades), and check the face veneer when the parts arrive. The cut file has the length along Y.
- **The blade shape is close to the limit.** A blade this thick, bent this far over this span, carries at least
  about δ·E·t / L² ≈ 38 mm × 16 471 MPa × 3.18 mm / (265 mm)² ≈ 29 MPa, whatever its shape. The design reaches
  30.1 MPa in the blade and 30.0 MPa in the hub section. That's why the hub plate is wide (110.6 mm) and short,
  the blades are 75 mm wide at the centre, and no holes sit beside the bore: each moves stress off whichever
  section was worst.
- **Creep:** under the tie preload, plywood creeps and the clamp relaxes to about half (k_def 1.0, service class
  2), from 27 N to 13.5 N. That still holds the panels down to 11 g sideways. Seal the panels: Baltic birch isn't
  weatherproof, and wet plywood creeps more.
- **Cutting:** every web is 2.03 mm (0.08") or more, SendCutSend's minimum for unsupported features. The holes
  are 4.6 mm, and the part (4.36 × 23.77 in) is well inside their 30 × 44 in limit. Expect dark edges where the
  laser burns the glue lines.
- **Fork:** the panel is 1.6 mm thicker than G-10, so its outer face and the LED strip stand 1.6 mm further out.
  On the typical fork the strip plus a tie band hits the fork leg by 0.7 mm at r ≈ 84 mm. The bare panel clears
  it by 4.6 mm. No blade shape fixes this; measure the fork (see [Before you order](#before-you-order)).

| Baltic birch, 2 strips | |
|---|---|
| Part | 4.36 × 23.77 in (110.7 × 603.6 mm), 120 holes, 62.8 g |
| Blade | 301.8 mm from the centre flat, 298.4 mm bent; 75 → 27 mm wide |
| Hub plate | 110.6 mm wide, 44.4 mm long, tapering to the blade by r = 29.9 mm |
| Tip force | 13.5 N per tip (zip ties: 80 N or more) |
| Clamp on the hub | 27 N, about 13.5 N once crept |
| Stress | 30.1 MPa blade, 30.0 MPa hub section (target 33.0) |
| Spokes | 2.34 mm gap, no collisions |
| LEDs | 39 per blade, r 22.7–293.9 mm |

## Geometry

The numbers in this section and the next are for the original G-10 layout: 2-, 3- and 4-blade, with a hole grid
for electronics on the plate (plate 82.6 × 100.8 mm, blades 56.1 mm wide at the centre).

Every edge is a straight line with a rounded corner (R2.0 mm on the outline, R1.0 mm on the holes, about R1.8 mm
in the slot). The only curve is the centre bore. Every blade has identical geometry, so both panels flex the
same way and the tips meet on the centre line.

**Blade**
- **Length and taper:** each blade runs 301.8 mm from the centre when flat. Bending shortens it by 3.3 mm, so
  the tip end lands at 298.4 mm, the measured 11.75". The arm tapers from 56.1 mm wide at the centre to 27 mm
  at the tip.
- **Plate:** 82.6 mm wide, running 50.4 mm out from the centre. It then tapers over 71.1 mm to the
  plain blade. The taper is fitted to the holes: its edge clears the 4th hole column of the second row by
  exactly 4 mm.
- **Nipple slot:** every tip has a slot 5.0 mm wide and 3.7 mm deep, open at the tip end. When a tip lands on a
  spoke, the nipple sits in the slots of both panels. The slot bottom is 1 mm inside the nipple's inner end.
  Change it with *Nipple slot* (every tip, only a tip on a spoke, or none).
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
  The report's `sides.LEFT.tieHeadsInside.moveOutside` lists every such position.

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

## The model

The generator is [`src/panels/design.ts`](../src/panels/design.ts); it runs in a worker, so the page stays
responsive while it works (most of a second per design).

1. **Wheel** (`src/panels/wheel.ts`). A 32-hole, 3-cross lacing with holes alternating between flanges, heads-in and
   heads-out faces, and interlacing at the outermost cross. Spokes run straight from the flange to the rim. The
   modelled rim sits just outside the measured tip.
2. **Tip angles.** Tips go exactly 360°/N apart, rotated so they get the most room between spokes. If even
   spacing can't clear the spokes (3 strips), one tip is centred on a spoke instead (`sandwichOk`).
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
   - The cut DXF is rotated to its smallest bounding box. It is DXF R12 (read by every CAD and CAM tool, and by
     SendCutSend): closed POLYLINEs whose bulges make every fillet a true arc, plus one CIRCLE for the bore, all
     on layer 0, in inches.
   - Also written: the reference DXF and the report.

**Not modelled:** with 3 or 4 blades the hub area has to dish slightly, like a shallow cone, which adds some
in-plane stress the beam model doesn't capture. Stresses are well under the limit, but treat the 3- and
4-blade margins as less certain than the 2-blade one.

## Materials

| Key | Material | Thickness | E | Stress target | Use |
|---|---|---|---|---|---|
| `g10_063` | G-10/FR-4 | 1.6 mm | 18 GPa | 60 MPa | Final, waterjet |
| `birch_125` | Baltic birch plywood (SendCutSend .125", 3-ply) | 3.18 mm | 16.5 GPa along the face grain, 1.0 GPa across | 33.0 MPa along, 5.3 MPa across (permanent load) | Laser; blades along the face grain, 2 strips |
| `hardboard_125` | Hardboard | 3.175 mm | 4.5 GPa | 15 MPa (short-term) | Prototype, laser |
| `delrin_125` | Delrin 150 | 3.175 mm | 2.9 GPa | 20 MPa | Laser |

These are typical material values, not tested ones. The hardboard and Delrin targets are short-term, about a third
of typical bending strength: use them for fit checks only.

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
- Ported from the Python generator (shapely, ezdxf, matplotlib) to TypeScript and built into the simulator's
  Panels tab, sharing its build settings. The results match the Python version's to its rounding; cut files
  are DXF R12.
- Baltic birch from SendCutSend: plywood is modelled along and across its face grain (Metsä Wood's 3-ply values,
  Eurocode 5 permanent-load targets, creep). Two strips with both blades along the grain; a wide, short hub plate,
  wider blade roots and no holes beside the bore bring the stress to 30 MPa. The electronics moved to the hub.

# LED panels: design notes

Hardware for running the display on a real bicycle wheel: two flat-cut panels, one on each side of the front
wheel, that lie on that side's spokes, are zip-tied to them, and carry the LED strips and a hall sensor per
strip. The battery and electronics attach to the hub. The app designs the panels in the **Panels** tab and
writes the cut files.

Default wheel: **700c front, 32 spokes, 3-cross, rim brake (no rotor)**. The model takes any common lacing:
20 to 36 spokes, radial to 4-cross (*Spokes* in the Hardware tab, *Spoke crosses* under Panels).
Material: **polypropylene sheet, 0.8 mm**, laser or knife cut (a CNC drag knife or a vinyl cutter takes it).

> **Status: not yet verified on the bike.** Only the bore (1.5") and the tip radius (11.75") are measured.
> Every other wheel and fork dimension is a *typical value*. Read [Before you order](#before-you-order).

## Using the Panels tab

Open **⚙️ Settings → Panels**. The main area switches to a drawing of the part (**← Ride** goes back):

- **Flat part**: the part as cut, with the dimensions needed to check or rebuild it. The spokes it lies on
  are dashed over it. Holes are coloured by what they're for: grey strip ties, green spoke ties, purple disc
  ties, pink hall sensor ties, yellow wire holes.
- **On the wheel**: the panel seen from the right, over every spoke, with the LED strips and the hall sensors
  (purple). The spokes tied to a blade are green. *Left* / *Right* picks the panel.
- **Side section**: a section through the axle with all the spokes, both panels lying on their spokes, the
  flanges, the fork and the rim (lateral scale ×3). Green dots are the spoke ties.

Drag to pan, scroll or pinch to zoom, and double-click (or press **F**) to fit. **📏 Measure** (or **M**)
measures between two clicked points, snapping to outline corners, hole corners and hole centres; **Esc** stops.

The tab shows the result (part size, mass, blades, LEDs, the disc, the sensors, spoke ties, spans, holes,
fork and valve clearance, with a warning for any check that fails) and the downloads:

| Download | What it is |
|---|---|
| **Cut file(s) (DXF, inches)** | Inches, one layer, closed outlines (the disc's edge and every corner are true arcs). When the two panels are mirror images, one file, `…_panel_QTY2_cut_in.dxf`: cut two and turn one over. Otherwise a LEFT and a RIGHT file |
| **Reference DXF (mm)** | Both panels in mm, seen from the right, with LED lines, sensors, the spokes they lie on and labels. For reference only, **do not cut** |
| **Report (JSON)** | Every computed number: geometry, ties, clearances, and settings for the simulator |

**Use in simulator** points the simulator's strips at where the panels hold the LEDs: their start radius and
length, and a shallower rim when the outer LEDs need one.

### Shared settings

The panels use the same build as the simulator. From the **Hardware** tab:

| Setting | Used for |
|---|---|
| *Strips* | Blades per side, 2 to 6. Also under Panels |
| *LEDs / m* | Pixel pitch: the strip ties sit every *Strip ties every N pixels* LEDs, between pixels |
| *Spokes* | The laced wheel model |
| *Wheel size*, *Rim BSD*, *Rim depth* | The rim's inner wall (BSD/2 − depth) and the spoke ends (ERD = 2 × (wall radius + 4 mm)). When the measured tips don't fit inside that wall, the rim is assumed just outside them |

The panels' own settings are part of the setup file:

| Setting | Default | Meaning |
|---|---|---|
| Tip radius | 298.45 mm | Radius of the blade tips on the wheel (measured 11.75"); 0 = just inside the rim wall |
| Bore Ø | 38.1 mm | Centre hole round the hub (measured 1.5") |
| Nipple slot | where a nipple is under a tip | Slot the tip round a nipple under it, or stop every blade short of the nipples |
| Disc to spoke cross | 0 (the outermost) | The disc reaches this spoke cross, counted from the hub, and is tied at every crossing there. 0 is the outermost, interlaced cross: cross 3 on a 3-cross wheel (r ≈ 80 mm). Radial lacing has no crosses: the disc is tied straight to its spokes |
| Ties at most every | 80 mm | Longest stretch of each blade edge between spoke ties (the disc's ties count) |
| Tie within this of each tip | 30 mm | Each blade edge's outermost spoke tie is at most this far in from the tip |
| Tab reach beyond blade | 0 (auto) | Farthest a tab reaches past the blade's edge to a spoke. Auto: far enough to reach a spoke midway between two on one side at the rim (60 mm on 32 spokes, 95 mm on 20) |
| Strip width, thickness | 14, 4 mm | Strip in its sleeve (Adafruit 2241) |
| Tie width, hole clearance | 3.6, 1.0 mm | Tie strap and hole clearance: the holes are square, 4.6 mm |
| Strip ties every N pixels | 2 | Strip ties along the blade |
| Hole to edge | 4.0 mm | Minimum material from a hole to the edge, and between ties |
| Corner radius | 2.0 mm | On every outline corner |
| Blade width | 0 (narrowest: 27 mm) | The strip, its ties, and 4 mm outside them |
| Hall sensor to strip | 12 mm | From the strip's edge to the sensor's body |
| Spoke crosses, flange hole circle, centre to flange, over-locknut | 3, 44, 35, 100 mm | Hub and lacing (typical) |
| Fork crown radius, half-width at crown | 340, 22 mm | Fork (typical, straight legs) |

## How it works

Each panel is a **disc round the hub with N straight radial blades**, one blade per LED strip. The panel lies
on the outboard side of its own side's spokes and is zip-tied to them. Nothing bends it on purpose; it just
follows the spokes.

- **The disc** goes round the hub (the 1.5" bore) and reaches the outermost spoke cross (3 on a 3-cross
  wheel), so it is 174 mm across. It is tied round each of the 8 crossings there, at r ≈ 80 mm: a hole either
  side of the crossing, in the wide angles between the two spokes, so the tie wraps both. A crossing that falls
  under a strip isn't tied (its holes or band would sit under the strip); the blade's strip ties hold the
  panel there. On a radially laced wheel, each tie straddles a spoke 30 mm out from the flange.
- **The blades** run from the disc to the rim, **evenly spaced whatever the spoke pattern**. Each carries one
  LED strip along its centre line, from r 22 mm to the tip.
- **Strip ties** hold the strip: hole pairs centred on the strip's edges, every 2 pixels, between LEDs. These
  holes are for the strip only.
- **Spoke ties hold both edges of every blade** (against flutter), each with its own hole pair, one hole either
  side of the spoke, 0.5 mm clear of it. Each edge is tied within 30 mm of the tip and at least every 80 mm in
  from there to the disc's ties. A tie on one edge sits beside the strip ties (at least 4 mm away), on a **tab**
  where its spoke runs outside the blade.
- Where an edge has no spoke of its own within reach, or a spoke runs **under the strip**, the tie goes
  **across the whole blade**: one hole on the strip's far edge, one past the spoke, the band over the strip
  between two LEDs. That one tie holds both edges. The strip ties next to it, which would be too close, are
  left out on that blade. The generator ties the edge with fewer places for a tab first, so its ties across
  the blade serve the other edge too, and uses them only where no tab will do.
- **A hall sensor beside each strip** (Melexis US5881, Adafruit 158), on the disc, 12 mm from the strip's
  edge, as far out as fits (the strip's current falls toward its tip). See [Hall sensors](#hall-sensors).
- **A wire hole by each strip**: Ø6 mm, in the disc beside the strip's inner end (r ≈ 31 mm) on its sensor's
  side, clear of the strip ties. The strip's four wires and the sensor's three go through it to the inner
  side, toward the electronics on the hub.

Near the rim, 3-cross spokes run almost parallel to the blades (4–12° off radial), so a spoke can run beside
a blade for a long way. The tab goes where its spoke is closest to the blade's edge.

**Turning the blades.** The blades all turn together, staying evenly spaced, in 0.25° steps (plus the angles
that make the panels mirror images). The generator keeps the turn that, in order:

1. ties every stretch of every blade edge;
2. keeps the valve clear;
3. needs the smallest tabs (to within 5 mm);
4. needs the fewest ties across a strip;
5. makes the two panels mirror images of each other, so one cut file makes both (turn one over);
6. leaves the fewest disc ties out from under the strips.

**Strips and spokes.** Near the rim one side's spokes are evenly spaced (22.5° apart on 32 spokes), and the
left and right sides are offset by half that. To be tied on both edges, a blade tip has to sit close to a spoke
(tied across the strip) or close to midway between two (a tab each side, or across the blade). Every blade can
do that when the spoke pattern repeats with the blades, which is easiest when the strips divide the spoke
count: 2 or 4 strips on 32 spokes, 2, 3, 4 or 6 on 36. With the tips tied within 30 mm and the tab reach on
auto, 2 to 6 strips all tie on the default 32-spoke 3-cross wheel. When a stretch can't be tied, the tab warns
and names the strip counts that divide the spoke count.

**The dish.** The spokes form a shallow cone: from the spoke heads at the flange (z ≈ 38 mm) to the rim
(z ≈ 0), 36 mm over 280 mm. The panel lies on the highest spoke surfaces at each radius, spanned straight over
the dips. A flat strip along a cone is still straight, so the blades follow it with no stretch. The flat part
is laid out along the slope, so a blade is 2.4 mm longer flat than its reach on the wheel, and the ties land
on their spokes. The disc dishes too, by about 8 mm from the bore to its edge; 0.8 mm polypropylene follows
it by flexing.

**Nipples and valve.** Where a nipple (from either side) is under a tip, the tip gets a slot 5 mm wide whose
bottom is 1 mm inside the nipple's end. Choose *None* to stop every blade short of the nipples instead. Tabs
near the rim keep clear of every nipple and inside the rim wall. The valve (8 mm with its nut, 35 mm inside
the rim) must clear the panel by 3 mm.

**Assembly**
1. Fit the battery and electronics to the hub.
2. Tie the hall sensors to the outer faces (marked face out, leads toward the hub), then fit the LED strips on
   the outer faces with the strip ties. Tie heads go beside the strip.
3. Put each panel over the hub onto its spokes, each blade at its angle. The drawing gives the angles,
   counter-clockwise seen from the right from rim hole 0, the first hole past the valve.
4. Tie the disc round its crossings, then each blade to its spokes, tips first, both edges.
5. Pass each strip's and sensor's wires through the wire hole by the strip's inner end, and connect them to
   the electronics.

## Hall sensors

One **Melexis US5881LUA** unipolar hall switch per strip ([Adafruit 158](https://www.adafruit.com/product/158),
the sensor Adafruit chose for its SpokePOV kit): 4.08 × 3.00 × 1.51 mm, 3.5–24 V, open-drain output that
pulls low when a **south pole** faces its marked side (10 kΩ pull-up). From the
[Melexis datasheet](https://www.melexis.com/-/media/files/documents/datasheets/us5881-datasheet-melexis.pdf):
it switches on at 15 mT minimum (25 typical, 30 maximum) and off at 9.5 mT minimum, with 2–5.5 mT of
hysteresis.

**Mounting and orientation.** The sensor senses along the axis through its marked face. It lies flat on the
panel's outer face with the marked face out, so it looks along the axle at the fork leg; the magnet goes on
the inside of the fork leg at the sensor's radius (r ≈ 66–72 mm), south pole toward the wheel. That leaves
about 10 mm from the sensor's face to the fork for the magnet. Its leads lie flat toward the hub. One tie
goes across its body and one across its leads (strain relief), each through its own pair of holes. It can be
tied on bare; a small carrier board with the 10 kΩ pull-up and a 100 nF decoupling capacitor beside the
sensor is optional and fits the same ties if it is no wider than about 5 mm, or on a wider tab otherwise.

**Interference from the LEDs.** Two ways the strip could upset the sensor:

- *Magnetic.* The strip's supply and ground carry the current of every LED beyond a point: up to 60 mA per LED
  at full white ([SK9822/APA102](https://www.adafruit.com/product/2574): 20 mA per colour), about 2.3 A for
  39 LEDs at the strip's inner end. Taken as two opposite line currents 10 mm apart, the field 12 mm from the
  strip's edge is about **9 µT** at full white, which is about 1,000 times below the switch's 9.5 mT release
  point. Even directly beside the strip it stays under 0.5 mT, so for this switch the field is no concern.
  (A linear magnetometer is different: the TMAG5273 considered first has 68 µT of noise per reading and 11 µT
  averaged ([TI datasheet](https://www.ti.com/product/TMAG5273)), so the same 9 µT would have shown.) The
  LEDs' PWM (about 4.7 kHz on SK9822, 19 kHz on APA102) makes that small field ripple, still far below the
  hysteresis.
- *Electrical.* The real risk is the sensor's open-drain line picking up the strip's clock and data edges
  (MHz, sharp) along shared wiring. Run the sensor's three wires apart from the strip's data and clock, or
  twist them with ground, keep the pull-up at the controller, and debounce the input (the simulator's
  *Debounce* setting). The 12 mm gap also keeps the sensor and its ties clear of the strip ties and their
  heads.

The tab shows the strip's field at the sensors and the room to the fork for the magnet.

## Layouts

On the default 700c 32-hole 3-cross wheel:

| Strips | Parts | Part size (in) | Mass (L / R) | Spoke ties per blade (L / R) | Across a strip (L / R) | Tabs up to | Disc ties (L / R) |
|---|---|---|---|---|---|---|---|
| 2 | LEFT + RIGHT | 6.83 × 23.2 | 24 / 31 g | 3 / 6 | 6 / 0 | 50 mm | 8 / 6 |
| 3 | LEFT + RIGHT | 18.6 × 21.0 | 35 / 34 g | 4–5 / 4–5 | 5 / 6 | 60 mm | 7 / 7 |
| 4 | LEFT + RIGHT | 17.4 × 17.4, 19.2 × 19.2 | 31 / 45 g | 3 / 6 | 12 / 0 | 50 mm | 8 / 4 |
| 5 | LEFT + RIGHT | 21.7 × 23.0 | 47 / 45 g | 3–7 | 10 / 10 | 60 mm | 5 / 6 |
| 6 | LEFT + RIGHT | 21.0 × 23.7 | 54 / 52 g | 4–5 | 10 / 12 | 60 mm | 6 / 6 |

Every layout has the same disc (Ø 173.6 mm, ties at r 79.7 mm) and the same strips (39 LEDs from r 22.1 mm to
293.8 mm, where a nipple slot cuts into a strip's lane). Spans between ties are at most 80 mm on each edge,
and every edge is tied within 30 mm of the tip. The hall sensors sit at r 66–72 mm, all on the disc. The LED
strip and a tie band over it clear the typical fork by 3.5 mm, at the start of the strip (r 25 mm).

With 2 and 4 strips, one panel's tips sit over its spokes (tied across the strip) and the other's midway
between them (tabs each side): the left and right sides' spokes are offset by half a gap. On 36 spokes the
panels can come out as mirror images (3 or 4 strips with 2- or 3-cross): one part, cut twice.

Across the common lacings (20–36 spokes, radial to 4-cross) with 2 or 4 strips, every edge ties. The few
combinations that leave one stretch untied are 3 strips on 20 spokes (2- and 3-cross) and on radially laced
32 spokes; the tab warns.

## Material

**Polypropylene sheet, 0.8 mm** (0.905 g/cm³), laser, CNC drag knife or vinyl cutter: tough, flexible and
weatherproof. The panels carry almost no load, since the ties hold them on the spokes. Thickness sets the fork
clearance and the mass, and thin, flexible sheet follows the dished spokes best. Stiff sheet (G-10, plywood,
hardboard) won't follow the dish over the disc, so the other materials were removed.

## Before you order

| Check | Why it matters |
|---|---|
| **Fork inner width along the legs (M11/M12)** | The LED strip plus a tie band clears the typical straight-leg fork by 3.5 mm at r ≈ 25 mm, where the strip starts. Measure your fork. |
| **Room for the magnet** | About 10 mm from each hall sensor's face to the fork leg at r ≈ 70 mm, on the typical fork. The magnet and the gap to it must give the switch 15 mT or more (south pole). |
| **Lacing and hub** | Spoke count, crosses, the flange spoke-hole circle (44 mm) and flange spacing (35 mm) set where the crossings are and how the spokes dish, so where every tie goes. |
| **LED pixel pitch** | Adafruit says "144 LEDs per meter" and "7 mm" (rounded). The model uses 1000/144 = 6.944 mm. Measure from the centre of pixel 1 to the centre of pixel 37: 250.0 mm means 6.944, 252.0 mm means 7.0. At the wrong pitch the outer ties drift about 2 mm onto the LEDs. |
| **What the 1.5" bore sits on** | The hub body outboard of the flange. It centres the disc. |
| **Tip position** | Confirm that 11.75" is where the blade tip should end. |
| **Rim wall and nipple length inside the rim (M20/M23), nipple diameter** | These set the nipple slots and how close to the rim the tabs can go. |
| **Valve** | Its stem and nut inside the rim must clear the panels. |

A cheap check before cutting: print the reference DXF at 1:1 and lay it on the wheel.

## Known limitations

- **Typical wheel values.** The spoke positions come from a laced-wheel model with a typical hub. The ties are
  placed on those modelled spokes; a different hub or lacing moves them.
- **The dish is modelled, not measured.** The panel is taken to lie on the highest spoke surface at each
  radius. Under a blade, only the spokes there hold it up.
- **The disc must dish to follow the spokes.** A flat disc can't follow a cone exactly; 0.8 mm polypropylene
  takes the small difference by flexing. Stiffer sheets won't.
- **Ties under the panel catch spokes too.** A strip tie whose band passes under the panel where a spoke runs
  beneath will also wrap that spoke.
- **Long tabs.** Where a blade sits midway between one side's spokes, its tabs reach 50–60 mm (more on wheels
  with fewer spokes). They are tied at their ends, but are the floppiest part of the panel.
- **3.6 mm ties are wider than the gap between pixels.** The 5050 LED packages leave about 1.9 mm between them,
  so 40 lb ties overlap each package edge by about 0.8 mm. 18 lb ties (2.4 mm) nearly fit the gap.

## Revision summary

- Panels went from zip-tied to spokes (PVC/HDPE concepts) to self-supporting blades tied tip-to-tip, with
  G-10, Baltic birch and hardboard versions (the leaf-spring design is in the git history up to commit
  7792cc5).
- Ported from the Python generator (shapely, ezdxf, matplotlib) to TypeScript and built into the simulator's
  Panels tab, sharing its build settings. Cut files are DXF R12.
- **Spoke-tied redesign for 0.8 mm polypropylene.** A disc round the hub, tied at a spoke cross, and radial
  blades from the disc to the rim, evenly spaced whatever the spoke pattern. Strip ties and spoke ties have
  separate holes. The blades turn together for the smallest tabs, and the panels come out as mirror images
  when that costs nothing. The flat part is laid out along the dished spokes.
- The disc reaches the outermost (interlaced) spoke cross, so the strips start at r 22 mm; a crossing under a
  strip isn't tied.
- Both edges of every blade tied (against flutter), with ties across the whole blade where an edge has no
  spoke of its own in reach. Tab reach scales with the spoke spacing; tabs near the rim checked against each
  nipple. Any common lacing (20–36 spokes, radial to 4-cross); radial wheels tie the disc to the spokes.
  2 to 6 strips.
- A hall switch (US5881) per strip, on the disc beside its strip, tied on, marked face toward the fork; the
  strip's stray field estimated at the sensor.
- A Ø6 mm wire hole per strip in the disc, by the strip's inner end. Polypropylene is the only material.

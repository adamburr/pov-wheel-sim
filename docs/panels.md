# LED panels: design notes

Hardware for running the display on a real bicycle wheel: two flat-cut panels, one on each side of the front
wheel, that lie on that side's spokes, are zip-tied to them, and carry the LED strips and a hall sensor per
strip. The battery and electronics attach to the hub. The app designs the panels in the **Panels** tab and
writes the cut files.

Default wheel: **700c front, 32 spokes, 3-cross, rim brake (no rotor)**. The model takes any common lacing:
20 to 36 spokes, radial to 4-cross (*Spokes* and *Spoke crosses* under Hardware → Wheel → Rim).
Material: **polypropylene sheet, 0.8 mm**, laser or knife cut (a CNC drag knife or a vinyl cutter takes it).

> **Status: not yet verified on the bike.** Only the hub at the panels (1.5", the bore's minimum) and the tip radius (11.75") are measured.
> Every other wheel, hub and fork dimension is a *typical value*. Read [Before you order](#before-you-order).

## Using the Panels tab

Open **⚙️ Settings → Panels**. The main area switches to a drawing of the part (**← Ride** goes back):

- The panel on the wheel, seen from the right with blade 1 pointing right, over every spoke: the part as cut
  (it lies flat on the spokes), with the dimensions needed to check or rebuild it. This side's spokes are grey
  (heads in) or amber (heads out), dashed where they run under the part, and green where a blade is tied to
  them; the other side's are faint. Holes are coloured by what they're for: grey strip ties, green spoke
  ties, purple disc ties, pink hall sensor ties, yellow wire slots. The hall sensors and their leads are
  purple. The rim wall is dashed, with the valve and the nipples. *Left* / *Right* picks the panel.

Drag to pan, scroll or pinch to zoom, and double-click (or press **F**) to fit. **📏 Measure** (or **M**)
measures between two clicked points, snapping to outline corners, hole corners and hole centres; **Esc** stops.

The tab shows the result (part size, mass, blades, LEDs, the disc, the sensors, spoke ties, spans, holes,
fork and valve clearance, with a warning for any check that fails) and the downloads:

| Download | What it is |
|---|---|
| **Cut file(s) (DXF, inches)** | Inches, one layer, closed outlines (the disc's edge and every corner are true arcs). When the two panels are mirror images, one file, `…_panel_QTY2_cut_in.dxf`: cut two and turn one over. Otherwise a LEFT and a RIGHT file |
| **Reference DXF (mm)** | Both panels in mm, seen from the right, with LED lines, sensors, the spokes they lie on and labels. For reference only, **do not cut** |
| **Report (JSON)** | Every computed number: geometry, ties and clearances |

The simulator places its LEDs by the same rule as the panels (see [Where the LEDs sit](#where-the-leds-sit)),
so the two always agree. The one exception is a measured tip that reaches past the nipples, where a nipple
slot can cross a strip's lane: the strip ends short there, the simulator still shows it full length, and the
tab warns.

### Where the LEDs sit

One rule places the LEDs for both the simulator and the panels. Each strip is laid from the blade tip inward
in whole pixels, so the outermost LED sits as far out as it can, no closer to the axle than *Min strip radius*, and is one half-metre strip at most. Both settings are under Hardware → LEDs:

| Setting | Default | Meaning |
|---|---|---|
| Tip radius | 298.45 mm | Radius of the blade tips on the wheel (measured 11.75"). 0 = automatic: just inside the nipples, so no nipple slot is needed. A measured tip that reaches past the nipples is slotted round them |
| Min strip radius | 30 mm | The strips' inner ends stop at least this far from the axle, where the fork is close |

The strip is the standard one: Adafruit DotStar 144/m (2328) in its sleeve, 14 × 4 mm.

### Shared settings

The panels use the same build as the simulator. From the **Hardware** tab:

| Setting | Used for |
|---|---|
| *Strips per side* (top of the tab) | Blades per side, 1 to 4 (3 by default). With one, its hall sensor sits opposite the blade, and the wheel needs a rim weight (see the Electronics tab's balance) |
| *Size*, and under *Rim*: *Rim BSD*, *Rim depth* | The rim's inner wall (BSD/2 − depth) and the spoke ends (ERD = 2 × (wall radius + 4 mm)). When the measured tips don't fit inside that wall, the rim is assumed just outside them |
| *Spokes*, *Spoke crosses* (Rim) | The laced wheel model: 32 spokes, 3-cross. Crosses are limited to spokes/8 |
| *Hub*: type, over-locknut width, flange hole circle, centre to flange | Hub and lacing: *Front, 100 mm* (100, 44, 35 mm) or *Boost front, 110 mm*, with typical values, or *Custom* once one is edited |
| *Hub*: hub Ø at the panels | 38.1 mm (measured 1.5"). The bore is worked out: it reaches out to 4 mm inside the strips' inner ends (Ø 57.1 mm on the default wheel), and is never smaller than this |
| *Fork*: crown radius, half-width at crown | 340, 22 mm (typical, straight legs) |

Choosing a size sets the rim, tire and spokes, the typical crosses (3 from 700c to 20", 2 on 16", 1 on 12"),
a fork crown just over the tire, and puts the tip radius back to automatic: a measured tip belongs to the old
wheel.

The panels' own settings, in the **Panels** tab, are part of the setup file too:

| Setting | Default | Meaning |
|---|---|---|
| Nipple slot | Slot round them | Slot the tip round a nipple under it, or *Stop short*: every blade stops short of the nipples |
| Disc to cross | 0 (the outermost) | The disc reaches this spoke cross, counted from the hub, and is tied at every crossing there. 0 is the outermost, interlaced cross: cross 3 on a 3-cross wheel (r ≈ 80 mm). Radial lacing has no crosses: the disc is tied straight to its spokes |
| Max tie spacing | 80 mm | Longest stretch of each blade edge between spoke ties (the disc's ties count) |
| Tip tie within | 30 mm | Each blade edge's outermost spoke tie is at most this far in from the tip |
| Tie reach | 0 (auto) | Farthest a spoke tie sits off the blade's edge (its reach). Auto: a whole gap between one side's spokes at the rim (118 mm on 32 spokes), so every edge can reach a spoke of its own |
| Tie width, hole clearance | 3.6, 1.0 mm | Tie strap and hole clearance: the holes are square, 4.6 mm |
| Strip ties every (px) | 2 | Strip ties along the blade |
| Hole to edge | 4.0 mm | Minimum material from a hole to the edge, and between ties |
| Corner radius | 2.0 mm | On every outline corner |
| Blade width | 0 (narrowest: 27 mm) | The strip, its ties, and 4 mm outside them |

## How it works

Each panel is a **disc round the hub with N straight radial blades**, one blade per LED strip. The panel lies
on the outboard side of its own side's spokes and is zip-tied to them. Nothing bends it on purpose; it just
follows the spokes.

- **The disc** goes round the hub, its bore reaching out to 4 mm inside the strips' inner ends (Ø 57.1 mm), and reaches the outermost spoke cross (3 on a 3-cross
  wheel), so it is 174 mm across. It is tied round each of the 8 crossings there, at r ≈ 80 mm: a hole either
  side of the crossing, in the wide angles between the two spokes, so the tie wraps both. A crossing that falls
  under a strip isn't tied (its holes or band would sit under the strip); the blade's strip ties hold the
  panel there. On a radially laced wheel, each tie straddles a spoke 30 mm out from the flange.
- **The blades** run from the disc to the rim, **evenly spaced whatever the spoke pattern**. Each carries one
  LED strip along its centre line, laid from the tip in so the outermost LED sits as far out as it can and the
  image is as large as it can be. Each strip is one half-metre strip (72 LEDs) at most, in whole pixels, and
  stops short of the hub, where the fork is close: no nearer than *Min strip radius* (Hardware → LEDs;
  30 mm).
- **Strip ties** hold the strip: hole pairs centred on the strip's edges, every 2 pixels, between LEDs. These
  holes are for the strip only.
- **Each edge of every blade has its own spoke ties** (against flutter). Each tie has its own hole pair, one
  hole either side of the spoke, 0.5 mm clear of it, at least 4 mm outside the strip ties. Each edge is tied
  within 30 mm of the tip (where no tie fits there, within 45 mm) and at least every 80 mm in from there to
  the disc's ties. The ties sit as far off the blade as their spoke needs (the reach): on the default wheel,
  up to 110 mm on one blade, and about 30 mm on one edge and 80 mm on the other with 2 or 4 strips.
- **Each tie on its own tab, ending along its spoke.** A tab runs from the blade's edge (blended into it) out
  to a straight edge along the tie's spoke, just outside the material round its holes (each tie's square pad,
  *Hole to edge* outside its holes), and is only as long as that material. Between the tabs there is nothing,
  so the panels leave as little as they can for a cross-wind to push on. Each blade's tip is an arc round the
  hub, at the tip radius, and the ties near it keep their pads inside it.
- **Spoke ties never use or touch the strip's holes**, so the strips and their ties go on the panels before
  the panels go on the wheel.
- Only where a spoke runs **under the strip** and no tie can reach another spoke does a tie go **over the
  strip**, between two LEDs at a pixel gap with no strip tie, through a hole on each edge outside the strip
  ties. It holds both edges and goes on after the strip. On the default wheel none are needed.
- **A hall sensor per strip** (Melexis US5881, Adafruit 158), on the disc midway between two strips (on the
  bisector half a blade spacing on from its strip), near the disc's edge just inside the disc ties. All sit
  at one radius, so they repeat with the strips and match on both panels. Where the disc has no room for
  them (a radially laced disc with 4 strips), each goes on a small lobe off the disc. See
  [Hall sensors](#hall-sensors).
- **A wire slot by each hall sensor**: 10 mm wide, from a round end in the disc on the sensor's centre line,
  just inside the end of its leads (r 48 mm on the default wheel, 54 mm with 4 strips), straight in to the
  bore, all at the same spot beside their sensors. The slots open the disc's ring, so it bends more easily to
  the spokes' cone, and the wires can be slipped in from the bore instead of threaded. The sensor's three
  wires go straight in; the strip's four run across the disc from the inner end of the strip next to it.
  Both go through to the inner side, toward the electronics on the hub. The bore and its slots are cut as
  one outline, with 2 mm fillets where each slot meets the bore. Where a disc tie sits in a slot's way, its
  round end moves in until the slot clears it. Where the disc has no room inside the sensors (radially laced
  wheels with 2 or 3 strips), the slot goes beside the strip's inner end; where no slot fits there, a round
  hole does.

Near the rim, 3-cross spokes run almost parallel to the blades (4–12° off radial), so a spoke can run beside
a blade for a long way. Each tie goes where its spoke is closest to the blade's edge.

**Turning the blades.** The blades all turn together, staying evenly spaced, in 0.25° steps (plus the angles
that make the panels mirror images). The generator keeps the turn that, in order:

1. ties every stretch of every blade edge;
2. keeps the valve clear;
3. makes the two panels mirror images of each other, so one cut file makes both (turn one over), or else
   as alike as it can: the same longest reach and tie count on each side;
4. leaves the fewest disc ties out from under the strips;
5. needs the shortest reach (to within 5 mm);
6. needs the fewest ties over a strip.

A symmetric hub has a mirror axis every half repeat of the spoke pattern (every 22.5° on 32 spokes, from
16.875°); the blades are tried symmetric about each.

**Strips and spokes.** Near the rim one side's spokes are evenly spaced (22.5° apart on 32 spokes), and the
left and right sides are offset by half that. A blade's ties hold each edge to the nearest spoke on that side
that runs beside the blade, not under the strip. The blades suit the wheel best when the spoke pattern repeats
with them, which is easiest when the strips divide the spoke count: 2 or 4 strips on 32 spokes, 2, 3 or 4 on
36. With 3 strips on 32 spokes one blade has a spoke along its strip's edge near the tip, too close for a tie
beside the strip ties, and the next spokes are over 100 mm away where a tie would sit at the rim; its last ties
sit a little farther in (up to 45 mm from the tip) and reach up to 110 mm. Across the common lacings every
edge ties; when a stretch can't, the tab warns and names the strip counts that divide the spoke count.

**The dish.** The spokes form a shallow cone: from the spoke heads at the flange (z ≈ 38 mm) to the rim
(z ≈ 0), 36 mm over 280 mm. 0.8 mm polypropylene follows it by flexing, so the part is laid out as it sits on
the wheel, seen from the right: the flat part and the panel on the wheel are the same shape. Along the slope
a blade is about 2.4 mm longer than its reach on the wheel, so the outer ties land up to about 2 mm out along
their spokes, which run nearly radially there; the tie still closes round the spoke. The dish is used only for
the clearances to the fork and for the magnet.

**Nipples and valve.** Where a nipple (from either side) is under a blade's arced tip or a tab near it, the
panel gets a slot there 5 mm wide whose bottom is 1 mm inside the nipple's end. Choose *Stop short* to stop
every blade short of the nipples instead. An automatic tip radius (0) stops short of the nipples too, so it
needs no slot. Spoke ties near the rim keep clear of every nipple and inside the rim wall, and the panel keeps
5 mm clear of every other nipple, which trims the corner of a tab that runs out along its spoke toward it. The valve (8 mm with its nut, 35 mm inside the rim) must clear the panel by 3 mm.

**Assembly**
1. Fit the hub module's bracket to the hub, then the battery pack and the electronics box (see
   [docs/electronics.md](electronics.md)).
2. Tie the hall sensors to the left panel's outer face (marked face out, leads toward the hub). The left panel
   times both sides, so the right panel's sensor ties stay empty. Then fit the LED strips on the outer faces
   with the strip ties. Tie heads go beside the strip.
3. Put each panel over the hub onto its spokes, each blade at its angle. The drawing gives the angles,
   counter-clockwise seen from the right from rim hole 0, the first hole past the valve.
4. Tie the disc round its crossings, then each blade's ties to their spokes, tips first, both edges, then any
   tie over a strip.
5. Slip each strip's and sensor's wires into the wire slot inside that sensor, from the bore, and connect
   them to the electronics.

## Hall sensors

One **Melexis US5881LUA** unipolar hall switch per strip ([Adafruit 158](https://www.adafruit.com/product/158),
the sensor Adafruit chose for its SpokePOV kit): 4.08 × 3.00 × 1.51 mm, 3.5–24 V, open-drain output that
pulls low when a **south pole** faces its marked side (10 kΩ pull-up). From the
[Melexis datasheet](https://www.melexis.com/-/media/files/documents/datasheets/us5881-datasheet-melexis.pdf):
it switches on at 15 mT minimum (25 typical, 30 maximum) and off at 9.5 mT minimum, with 2–5.5 mT of
hysteresis.

**Mounting and orientation.** The sensor senses along the axis through its marked face. It lies flat on the
panel's outer face with the marked face out, so it looks along the axle at the fork leg; the magnet goes on
the inside of the fork leg at the sensors' radius (r 71 mm on the default wheel, 77 mm with 2 or 4 strips), south pole toward the wheel. That leaves
about 10 mm from the sensor's face to the fork for the magnet. Its leads lie flat toward the hub. One tie
goes across its body and one across its leads (strain relief), each through its own pair of holes. It can be
tied on bare; a small carrier board with the 10 kΩ pull-up and a 100 nF decoupling capacitor beside the
sensor is optional and fits the same ties if it is no wider than about 5 mm, or on a wider tab otherwise.

**Interference from the LEDs.** Two ways the strip could upset the sensor:

- *Magnetic.* The strip's supply and ground carry the current of every LED beyond a point: up to 60 mA per LED
  at full white ([SK9822/APA102](https://www.adafruit.com/product/2574): 20 mA per colour), about 2.3 A for
  38 LEDs at the strip's inner end. Taken as two opposite line currents 10 mm apart, the field midway between
  the strips, summed over every strip, is at most about **4 µT** at full white (1.5 µT with 2 strips), which is
  more than 2,000 times below the switch's 9.5 mT release point. Even directly beside the strip it stays under 0.5 mT, so for this switch the field is no concern.
  (A linear magnetometer is different: the TMAG5273 considered first has 68 µT of noise per reading and 11 µT
  averaged ([TI datasheet](https://www.ti.com/product/TMAG5273)), so a strip's field beside it would have shown.) The
  LEDs' PWM (about 4.7 kHz on SK9822, 19 kHz on APA102) makes that small field ripple, still far below the
  hysteresis.
- *Electrical.* The real risk is the sensor's open-drain line picking up the strip's clock and data edges
  (MHz, sharp) along shared wiring. Run the sensor's three wires apart from the strip's data and clock, or
  twist them with ground, keep the pull-up at the controller, and debounce the input (the simulator's
  *Hall debounce*, under Hardware → Controller → Firmware details). Midway between the strips the sensor and
  its ties are well clear of the strip ties and their heads.

The tab shows the strip's field at the sensors and the room to the fork for the magnet.

## Layouts

On the default 700c 32-hole 3-cross wheel:

| Strips | Blades at | Parts | Part size (in) | Mass | Spoke ties per blade | Over a strip | Reach up to | Disc ties |
|---|---|---|---|---|---|---|---|---|
| 2 | 84.375° + 180° | 2 × one part (mirror images) | 6.8 × 23.36 | 34 g | 6 (3 per edge) | 0 | 81 mm | 8 |
| 3 | 54.375° + 120° steps | 2 × one part (mirror images) | 20.35 × 21.55 | 49 g | 6 (3 per edge) | 0 | 110 mm | 7 |
| 4 | 39.375° + 90° steps | 2 × one part (mirror images) | 19.98 × 19.98 | 53 g | 6 (3 per edge) | 0 | 81 mm | 8 |

Every layout has the same disc (Ø 172.7 mm, ties at r 79.7 mm) and the same strips (38 LEDs from r 32.6 mm out to
the tip end at 296.5 mm, one half-metre strip each). Spans between ties are at most 80 mm on each edge, and every edge is tied within 30 mm of the tip (45 mm on one 3-strip blade).
The hall sensors sit midway between the strips at r 71 mm with 3 strips (clear of a disc tie) and 77 mm with 2 or 4, all on the disc. The LED strip and a tie band over it clear the typical
fork by 3.9 mm, at the strip's inner end (r 32.6 mm).

**Both sides alike.** The left and right sides' spokes are offset by half a spoke gap (360/32 = 11.25°), so a
blade over one side's spokes is midway between the other side's. With 2 and 4 strips the blades sit a quarter
of a gap off the spokes (360/64 = 5.625° past a rim hole: 84.375°, 39.375°), the same on both sides, and the
two panels come out as mirror images: one part, cut twice and one turned over, with the same tabs and ties on
each. Each blade then has a spoke about a quarter of a gap (≈ 28 mm at the rim) beside one edge and three
quarters (≈ 83 mm) beside the other, so one edge's tabs are short and the
other's long. With 3 strips one blade sits there and the other
two either side of it, mirror images too.

Across the common lacings (20–36 spokes, radial to 4-cross) every edge ties, and nearly every layout comes out
as mirror images. Ties reach about 70–120 mm on 24–36 spokes and up to 160 mm on 20. A few layouts on 20 and
28 spokes need a tie or two over a strip.

## Material

**Polypropylene sheet, 0.8 mm** (0.905 g/cm³), laser, CNC drag knife or vinyl cutter: tough, flexible and
weatherproof. The panels carry almost no load, since the ties hold them on the spokes. Thickness sets the fork
clearance and the mass, and thin, flexible sheet follows the dished spokes best. Stiff sheet (G-10, plywood,
hardboard) won't follow the dish over the disc, so the other materials were removed.

## Before you order

| Check | Why it matters |
|---|---|
| **Fork inner width along the legs (M11/M12)** | The LED strip plus a tie band clears the typical straight-leg fork by 3.5 mm at r ≈ 25 mm, where the strip starts. Measure your fork. |
| **Room for the magnet** | About 10 mm from each hall sensor's face to the fork leg at r 71–77 mm, on the typical fork. The magnet and the gap to it must give the switch 15 mT or more (south pole). |
| **Lacing and hub** | Spoke count, crosses, the flange spoke-hole circle (44 mm) and flange spacing (35 mm) set where the crossings are and how the spokes dish, so where every tie goes. |
| **LED pixel pitch** | Adafruit says "144 LEDs per meter" and "7 mm" (rounded). The model uses 1000/144 = 6.944 mm. Measure from the centre of pixel 1 to the centre of pixel 37: 250.0 mm means 6.944, 252.0 mm means 7.0. At the wrong pitch the outer ties drift about 2 mm onto the LEDs. |
| **The hub at the panel** | The bore (Ø 57.1 mm) clears the 1.5" hub body with room to spare, so it no longer centres the disc: the disc ties do. Check nothing on the hub outboard of the flange is larger than the bore's minimum (*Hub body Ø*). |
| **Tip position** | Confirm that 11.75" is where the blade tip should end. |
| **Rim wall and nipple length inside the rim (M20/M23), nipple diameter** | These set the nipple slots and how close to the rim the ties and their tabs can go. |
| **Valve** | Its stem and nut inside the rim must clear the panels. |

A cheap check before cutting: print the reference DXF at 1:1 and lay it on the wheel.

## Known limitations

- **Typical wheel values.** The spoke positions come from a laced-wheel model with a typical hub. The ties are
  placed on those modelled spokes; a different hub or lacing moves them.
- **The part is laid out flat.** It flexes to follow the dished spokes, which puts the outer ties up to about
  2 mm farther out along their spokes than drawn. The dish (for the clearances) is modelled, not measured:
  the panel is taken to lie on the highest spoke surface at each radius. Stiffer sheets won't follow it.
- **Ties under the panel catch spokes too.** A strip tie whose band passes under the panel where a spoke runs
  beneath will also wrap that spoke.
- **Long tabs.** Every edge has its own ties, so the edge farther from its spokes has tabs reaching about
  80 mm to them on 32 spokes (more on wheels with fewer spokes).
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
  separate holes. The blades turn together for the shortest reach, and the panels come out as mirror images
  when that costs nothing.
- The disc reaches the outermost (interlaced) spoke cross; a crossing under a strip isn't tied. The strips are laid
  from the tips in and stop at r 32.6 mm, outside the 30 mm limit.
- Both edges of every blade tied (against flutter).
- A hall switch (US5881) per strip, on the disc midway between strips, just inside the disc ties, all at one
  radius, tied on, marked face toward the fork; the strips' stray field estimated at the sensor.
- A wire slot per strip, from the disc in to the bore. Polypropylene is the only material.
- The blades turn for matching sides first: with 2 and 4 strips on 32 spokes they sit a quarter of a spoke
  gap off the spokes, and the two panels are mirror images (one part). 1 to 4 strips.
- Every blade edge on its own spoke ties, reaching as far as they need to (auto reach: a whole spoke gap).
  Spoke ties never use the strip's holes, so the strips go on before the panels go on the wheel; where a spoke
  runs under a strip and nothing else is in reach, one tie goes over the strip through its own holes.
- Where no tie fits within 30 mm of a tip, the last may sit up to 45 mm in before a tie goes over the
  strip: no 32-spoke layout needs a tie over a strip.
- The part is laid out as it sits on the wheel (polypropylene flexes to follow the dish), and the drawing is
  one view: the part on the wheel over every spoke, with its dimensions. The side section is gone.
- The wire holes are slots, 10 mm wide, from just inside the hall sensors' leads in to the bore: the disc
  bends to the cone more easily, and the wires slip in from the bore.
- One rule places the LEDs for both the simulator and the panels, so **Use in simulator** is gone. The tip
  radius and the strips' inner limit moved to Hardware → LEDs, and the hub, lacing and fork values to
  Hardware → Wheel. The strip's size is fixed: the standard strip in its sleeve.
- Each spoke tie's tab now ends in a straight edge along the tie's spoke, and each blade's tip is an arc round
  the hub, slotted round any nipple under it. The panels stay as light as they were, for the least area in a
  cross-wind. *Tab reach* is now *Tie reach*.

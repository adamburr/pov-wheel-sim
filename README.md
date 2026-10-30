# POV Wheel Simulator

A tunable three.js simulation of a DIY persistence-of-vision (POV) bicycle wheel display, in the spirit of Adafruit's [CircuitPython POV Bike Wheel](https://learn.adafruit.com/circuitpython-pov-bike-wheel/overview). Use it to see what a build will look like *before* you cut LED strips: wheel size, strip count, LED density, speed, firmware timing and camera exposure are all adjustable. The electronics are one platform: an Adafruit Feather RP2350 driving Adafruit DotStar (SK9822) strips.

**Live demo:** https://adamburr.github.io/pov-wheel-sim/

![The Ball on a bridge preset at 10 mph: a ball bouncing above the hub, riding with the bike, over a truss bridge pinned to the road, in the roadside strip (top) and the follow view](docs/images/hero-bridge.jpg)

## Examples

These are all renders from the simulator, starting from the Water preset and the build as it was when they were taken (700c wheel, 3 strips of 144 LED/m APA102, RP2350, 60% pedal surge) with stop-and-go off and the roadside strip hidden, unless the caption says otherwise. The banner shots are crops of the roadside strip.

<table>
  <tr>
    <td width="50%"><img src="docs/images/eye-default.jpg" alt="Water seen by the human eye"><br><sub><b>Human eye</b> (default view) at 12 mph: each point refreshes about 7 times a second, so the water shows in fading sectors.</sub></td>
    <td width="50%"><img src="docs/images/water-splashy.jpg" alt="Splashy water throwing spray"><br><sub><b>Splashy fluid,</b> 12 mph, 1/4 s: softer particle packing throws more spray.</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/images/water-brake.jpg" alt="Water surging forward under braking"><br><sub><b>Braking from 15 mph</b> (ideal sync, 1/2 s, about 1 s after the brakes go on): the water surges forward and up the front wall.</sub></td>
    <td width="50%"><img src="docs/images/smiley-half-second.jpg" alt="A smiley face at a 1/2 s exposure"><br><sub><b>Smiley test pattern,</b> 15 mph, 1/2 s: a full image, with a brighter hub where the inner LEDs sweep smaller circles.</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/images/smiley-ride.jpg" alt="The bouncing smiley dragged up the rear wall and tilted"><br><sub><b>Bouncing smiley</b> (Smiley preset), human eye, 12 mph: the turning wall drags it up the rear wall and tilts it, while its weight, near the mouth, holds it there.</sub></td>
    <td width="50%"><img src="docs/images/smiley-brake.jpg" alt="The bouncing smiley thrown forward under braking"><br><sub><b>Bouncing smiley braking</b> from 15 mph at 0.5 g, human eye: it's thrown forward against the front wall.</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/images/clock-face.jpg" alt="A Roman-numeral clock with spinning hands"><br><sub><b>Clock face,</b> 15 mph, 1/8 s: an old Roman-numeral dial whose hands spin in opposite directions, one turn each every 2 s, so they smear.</sub></td>
    <td width="50%"><img src="docs/images/spiral-spin.jpg" alt="A four-armed rainbow spiral"><br><sub><b>Rainbow spiral,</b> 15 mph, 1/8 s: a still picture the firmware turns once every 16 s by shifting the columns it sends.</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/images/dryer-ride.jpg" alt="Colourful ribbons tumbling up the rear side of the wheel"><br><sub><b>Tumble dryer preset,</b> 12 mph, 1/4 s: the paddles carry the ribbons up the rear side of the drum until they fall back, the nearer ribbons covering the ones behind.</sub></td>
    <td width="50%"><img src="docs/images/soup-preset.jpg" alt="A painting of a cat cropped to fill the wheel"><br><sub><b>Soup preset,</b> 15 mph, 1/2 s: your own picture (here a painting of a cat, from <code>media/</code>), zoomed out and moved so the hub sits on her chest, with her face and both paws in view; a heavily blurred mirror of the painting fills the rest of the wheel.</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/images/shutter-1-30.jpg" alt="Three wedges at a 1/30 s shutter"><br><sub><b>1/30 s photo</b> at 10 mph: each of the 3 strips sweeps only 25°.</sub></td>
    <td width="50%"><img src="docs/images/wide-text-wheel.jpg" alt="HELLO between rainbow lines on the wheel"><br><sub><b>Wide text, wheel-locked,</b> 15 mph, 1/2 s: the text sits in the upper half, clear of the hub.</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/images/ws2812-dashes.jpg" alt="Dashed arcs from WS2812 PWM"><br><sub><b>WS2812B at 400 Hz PWM</b> (close-up, 2020 LEDs, no diffuser, 20 mph, 1/30 s, polar test grid): the arcs break into dashes.</sub></td>
    <td width="50%"><img src="docs/images/adafruit-floor.jpg" alt="Broken-up image below the 400 lines/s floor"><br><sub><b>A 400 lines/s floor</b> (as in Adafruit's CircuitPython guide; Firmware details) at 10 mph, 1 s, smiley: below it the image squeezes, repeats and breaks up.</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/images/ride-by.jpg" alt="Cycloid streaks from a roadside camera"><br><sub><b>Ride-by,</b> 10 mph, 1/4 s, smiley: a fixed roadside camera sees the LEDs trace cycloids.</sub></td>
    <td width="50%"><img src="docs/images/banner-text.jpg" alt="Hi! painted in the air above rainbow arches in banner mode"><br><sub><b>Text banner preset,</b> roadside, 10 mph, 2 s: "Hi!" is pinned to the road in the upper half, and rainbow arches outline the voids the strips never sweep below the hub.</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/images/banner-scallops.jpg" alt="Alternating coloured scallops around dark arch-shaped voids"><br><sub><b>Scallops lower half,</b> roadside, 10 mph, 2 s: the lit ground between the voids is filled in alternating colours, so the arch-shaped voids show plainly.</sub></td>
    <td width="50%"><img src="docs/images/banner-surge.jpg" alt="Torn banner while pulling away"><br><sub><b>Banner while pulling away</b> from 4 to 16 mph, with 4 ms hall polling and no motion prediction: dead-reckoning errors from the pedal surges tear the text and fling the arches.</sub></td>
  </tr>
  <tr>
    <td colspan="2"><img src="docs/images/banner-bridge.jpg" alt="A ball bouncing along above a truss bridge"><br><sub><b>Ball on a bridge preset,</b> roadside, 10 mph, 1/2 s: the truss bridge is pinned to the road while the ball rides with the bike, showing each time a strip sweeps over it.</sub></td>
  </tr>
</table>

## Using the app

Two views show the same moment and the same animation. The main view follows the bike, and a narrow **roadside strip** above it watches the bike ride past like a basic phone camera at night, without flash (a 1/8 s exposure by default). The main view mimics the human eye. You can move the strip below the main view, give it its own exposure, or hide it under *Simulator → Camera*. The panel at the bottom is for riding: the current **preset**, then the wheel's two buttons, then the speed, its slider and **Auto**:

- **Next ▶** is the wheel's preset button. Click for the next preset (or press **N**); double-click to toggle **Auto**.
- **☀** is the wheel's brightness button. Click to step 100, 50, 25 and 12 % (or press **B**). Double-click to put the wheel to sleep; a click on either button wakes it.

**⚙️ Settings** opens a panel: on the right on a computer, or from the bottom on a phone. Every section starts with just a few choices, and its **Details** folders hold the rest.

| Tab | What it holds |
|---|---|
| **Presets** | The list of presets and the settings of the selected one: what to show (a pattern or your own image, GIF or video), text, wheel-locked or banner mode, brightness, water and animation options |
| **Hardware** | The build: wheel size, strips per side and LED details, the sensors, with every timing value under Details |
| **Simulator** | How the simulation looks and rides: camera side, human eye or camera shutter, the roadside strip's position and exposure, units, pedal surge, rendering. Not part of the setup |
| **Stats** | Live build stats: rpm, column timing, resolution, refresh rate, RAM, current draw and battery life, with warnings for common pitfalls |
| **Panels** | The flat-cut panels that are tied to the spokes and hold the strips: a drawing of the part (pan, zoom, measure), its tie and clearance checks, and the cut files for a laser or knife cutter. See [LED panels](#led-panels) |
| **Electronics** | The circuit, the wiring, the hub module and the carrier board's layout, the battery and LED current limit, and a **shopping list** (on screen and as CSV). See [Electronics](#electronics) |

### Presets

A real wheel has one button that steps through its presets in order while you ride; **Next ▶** does the same here. The default setup has nine: Soup (your own picture: a painting of a cat, until you choose another), Tumble dryer (colourful ribbons tumbling in a drum), Rainbow spiral (which turns slowly), Water, Smiley (a smiley loose inside the wheel that bounces around as you ride), Beating heart, Clock face (an old Roman-numeral dial whose hands spin in opposite directions), Text banner ("Hi!" painted in the air) and Ball on a bridge. A new setup always starts on the first preset. Edit any of them, add a copy with **＋ New preset**, reorder them with ↑ / ↓, or delete them. **Reset** (at the top of Settings) brings back the originals, along with the default hardware and simulator settings. Delete, Reset and Reset hardware ask for a second click to confirm.

To show your own picture, set **Show** to *Image / video* and pick a file with the button under it (an image, animated GIF/WebP/APNG, or video); dropping or pasting a file does the same. The file is stored in the selected preset. A picture is always shown as it is, whatever the preset showed before: it starts cropped to fill the wheel and turning with it, and you can then letterbox the whole picture instead (*Fill*, under *Picture details*), zoom and move it (so a face stays clear of the hub; where it no longer reaches, a blurred mirror of it fills in), spin it, or make it a banner. As a banner it fills the full height, with no lower-half pattern.

### Setups

A setup is the hardware build plus all the presets. It saves automatically in the browser, uploaded images included, and comes back when you open the page again (a new tab, a link or a bookmark). Reloading the page, plainly or forced, starts over from the defaults instead, like **Reset**. **Save** downloads it as a `.json` file with images embedded, **Open** (or dropping the file on the page) loads one, and **Reset** puts everything back to the defaults: the hardware, the built-in presets and the simulator settings. The setup file is also what a future version will flash to the wheel's controller.

### LED panels

![The default LEFT panel in the Panels tab: four blades on the wheel over every spoke, with the disc round the hub, spoke and disc ties, hall sensors and the strips' 38 LEDs](docs/images/panel-drawing.png)

To build the wheel, two flat-cut panels of 0.8 mm polypropylene lie on the spokes, one each side, zip-tied to them, and carry the strips (the electronics go on the hub). Each is a disc round the hub, tied at the interlaced (third) spoke cross, with one radial blade per strip from the disc to the rim, evenly spaced whatever the spoke pattern. The strips have their own tie holes; the blades are tied to the spokes by separate hole pairs, on small tabs where a spoke runs beside the blade; with both edges of every blade tied against flutter; a hall sensor per strip sits on the disc midway between strips, just inside the disc ties; and a wire slot from just inside each sensor in to the bore takes its wires and its strip's to the inner side (the slots also let the disc bend to the spokes' cone). Each strip is one half-metre strip (38 of its 72 LEDs on the default wheel), laid from the blade's tip inward so the image is as large as it can be. The strips stop short of the hub, where the fork is close, and the bore grows to 4 mm inside their inner ends: Ø 57 mm on the default wheel, never smaller than the measured 1.5" hub. It works for any common lacing (20–36 spokes, radial to 4-cross; 32-spoke 3-cross by default) and 1 to 4 strips (one blade per side needs a rim weight to balance it); the blades turn so the left and right panels come out alike, as mirror images on the default wheel (one part, cut twice). The **Panels** tab designs them from the same build as the simulator (strips, LEDs / m, spokes, rim, magnet sensors) plus their own settings (material, bore, tip radius, ties, holes, hub and fork). While it's open, the main area shows the part instead of the ride: on the wheel over every spoke, as cut, with its dimensions. Drag to pan, scroll or pinch to zoom, double-click to fit, and **📏 Measure** between snapped points. The tab lists the part size, mass, ties, spans and clearances, with a warning for any check that fails, and writes the **cut files** (DXF, inches), a reference drawing and a full report. **Use in simulator** points the simulator's strips at where the panels hold the LEDs. [docs/panels.md](docs/panels.md) has the design notes and what to measure before you order.

![Close-up of the disc: four 10 mm wire slots open into the 57 mm bore, with the hall sensors' ties beside them and the strips' tie holes along the blades](docs/images/panel-disc.png)

### Electronics

One platform: an Adafruit Feather RP2350 (8 MB PSRAM) in a module on the hub shell, between the flanges, driving 144/m DotStar strips (SK9822).

- **Data:** one PIO program gives every strip its own data lane on GPIO0–7, with a clock per side on GPIO10/11. All of these reach the Feather's headers, so there is no ribbon cable.
- **Level shifting:** three 74AHCT125s shift the 3.3 V signals to 5 V.
- **Sensors:** a hall sensor per strip sits on the left panel.
- **Power:** two 18650 cells feed a 5 V boost converter, which the firmware turns off when the wheel stops.
- **Controls:** a magnet held to a reed switch turns the wheel on and off. Two sealed buttons in the electronics box's lid choose the preset and the brightness, as the ride bar's **Next ▶** and **☀** do in the simulator.
- **Connections:** the left panel is wired straight to the module. The right panel plugs in through a 9-pin IP68 connector (Weipu SP13), which also takes a USB-C charging lead when the right panel is off.

The **Electronics** tab works all of this out from the build (strips per side, LEDs per strip, spokes, hub). It lists the power budget and a **shopping list** (on screen and as CSV), and draws four sheets. [docs/electronics.md](docs/electronics.md) has the design notes.

The **Circuit** sheet shows the power path, the on/off latch, the controller's pins, the level shifters, the buttons and both panels' connections:

![Circuit sheet: battery, protection, fuse, boost and charger; the reed-switch latch; the Feather's pin map with eight data lanes on GPIO0–7; hall and button inputs; three 74AHCT125 level shifters; the left harness and the right connector's pins](docs/images/electronics-circuit.png)

The **Wiring** sheet shows the left panel's harness, the hub module's layers, the right panel's plug-in connector and the charging lead, with every wire's colour and gauge:

![Wiring sheet: the left panel's 13-wire harness into the hub module, the logic, power board and battery pack in their bracket, the 9-pin connector to the right panel, the USB-C charging lead, and the harness and connector pin tables](docs/images/electronics-wiring.png)

The **Hub module** sheet shows the module to scale. It is one stack on one side of the hub shell: the battery pack, then the electronics box, in a 3D-printed bracket tied to the shell. A hook-and-loop strap holds the pack and box, so they come off easily. The sheet checks the stack's fit between the spoke cones, and adds up the module, the connector and the valve to work out the rim weight that balances them (10.5 g on the default wheel):

![Hub module sheet: end view with the bracket, strap, lid buttons and zip ties; section through the axle with the room between the spoke cones; and the whole-wheel balance with the rim weight](docs/images/electronics-hub.png)

The **Board** sheet shows the carrier board's layout. The Feather plugs in above it, with the shifters, latch and pull-ups underneath and numbered wire pads at each end:

![Board sheet: the 62 × 23 mm carrier with the Feather's header rows, three SOIC shifters, the power switches, and numbered pads for the left harness, the right connector and the box's power board and controls](docs/images/electronics-board.png)

### Changing the defaults

The defaults (the hardware and the presets) are a setup file in the repo, [`default-setup.json`](default-setup.json). The app uses it on first load, for **Reset** and **Reset hardware**. To change the defaults, set things up in the app, press **Save**, replace `default-setup.json` with the downloaded file, and commit. Uploaded images come along, embedded in the file. To keep the file small, an image can live in [`media/`](media) instead: replace its media entry's `"data"` with `"path": "media/name.jpg"`. The app serves the file along with the page (on GitHub Pages too) and fetches it at startup. The Soup preset's painting is stored this way, at 512 px across (the size the app squares pictures to, far more than the LEDs can show). A new setup always starts on the first preset, so put the look you want to start with at the top of the list. `npm test` checks that the file is a valid setup. When the file changes, every browser that saved a setup starts over from the new defaults once, on its next visit, so new and renamed presets show up everywhere (and that browser's own edits are lost). Simulator settings (camera, units, the roadside strip) aren't part of a setup, so their defaults stay in `src/params.ts`.

## Running

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # timing / firmware unit tests
npm run build
```

## How it works

Each frame is one simulated **exposure window**. A fragment shader on the LED plane works out, in closed form, every moment an LED's footprint covered each pixel during that window. It then integrates the light the LED was emitting at that moment: the column the firmware had latched, gated by the LED's PWM. Effects you see in real photos come out of the timing model rather than being drawn on:

- partial wedges at short shutter speeds, and a full image at long ones
- dashed arcs from low PWM rates (WS2812) or the APA102's slow global-brightness PWM
- image breakup below the Adafruit firmware's 400 lines/s floor
- stretching when the chip or LED bus can't send columns fast enough
- brighter hub area (inner LEDs sweep smaller circles)
- slight spiral twist from APA102 data rippling down the chain
- mirrored image on the non-drive side when back-to-back strips share data
- cycloid streaks when a roadside camera watches the bike ride by
- human-eye mode with exponential persistence instead of a box shutter

### Animations

Load an animated GIF, WebP, or APNG, or a short video clip, or pick one of the animated test patterns. Animated images decode through WebCodecs' `ImageDecoder` where the browser supports it; otherwise only the first frame is used. Videos are sampled at a set rate. The firmware stores one buffer per frame, and the stats warn when the frames won't fit in the chip's RAM.

Frames can advance on a timer (at the clip's fps) or every N wheel revolutions:
- **Timed** keeps the clip's speed. A frame can change mid-revolution, so different sectors show different frames (visible seams).
- **Revolution-synced** switches cleanly at the magnet, but the playback rate rises and falls with the bike's speed.

In banner mode the frames advance as the bike travels, so the road becomes a flip-book. On a banner the bouncing ball has its own layout: it bounces on the deck of the *Truss bridge* lower half. In the *Ball on a bridge* preset the ball rides with the bike while the bridge stays pinned to the road, so it bounces along above the hub as the bridge passes underneath.

### Water mode

The **Water** preset fills the bottom of the disc with simulated water (or choose *Water* under any preset's **Show** menu). Use the speed panel at the bottom of the screen to ride:
- Drag the slider to change speed: the cruise speed with Auto on, the riding speed with it off.
- **Auto** (on by default) rides stop-and-go and goes to the next preset at each stop, when the lights go out. Off, the bike rides on steadily at the slider's speed. Stop-and-go rides through the city: it pulls away to a top speed between half and one and a half times the stop-and-go cruise speed, rides a block of 4–12 s, brakes for a light, and waits 1–3 s. Pulling away is strong at first and eases off as the speed builds, the way pedal power does, and each pull-away varies. Along the block the speed wanders around the trip's speed, with the odd slowdown. Each light turns red at a random distance ahead (3–40 m): if it's far, the rider coasts a moment, then brakes just hard enough to stop there. Below about 3 mph the rider brakes firmly to a stop instead of creeping, and a slow rider pedals on towards a far light rather than crawling to it. So some stops are sharp and others a slow roll-down.

Each pedal stroke pulses the rider's push (*pedal surge*, default ±60%). The push comes from an estimate of the power needed: accelerating the bike and rider (85 kg) plus air drag and rolling resistance. So the surge is strong when pulling away, gentle when cruising, and absent when braking or coasting. The Stats tab shows the estimated rider power. The water surges against each speed change and sloshes back and forth afterwards. It's one body of water seen from both sides: from the non-drive side, braking pushes it to the viewer's left. The firmware model runs a small FLIP fluid simulation (default: a 24-cell grid with ~570 particles at 30 Hz). It paints each LED through a lookup table from LED position to grid cell, so no frames are stored.

**Rim drag.** The spinning rim drags the water touching it, using the wheel's speed as the magnet measures it. While riding, water is pulled back along the bottom and up the rear wall, where it tumbles over in breaking waves; when stopped, the rim is still and just damps the slosh. *Rim friction* (default 0.05) sets how strongly: around 0.2 or more carries the water all the way round into a ring, as real water in a spinning wheel would.

**Fluid types** (a preset's *Water → Fluid*):
- **Water** (default): lively, little damping.
- **Splashy:** livelier still, with softer particle packing, so it throws more spray.
- **Thick (oil):** viscous, slow and heavy.

Each type sets the liveliness (FLIP ratio), viscosity and particle spacing, all also adjustable under *Water → Details*.

**Rendering.** The LEDs read a map twice as fine as the simulation grid, built from the particles each step:
- the body of water is deep blue
- fast-moving surface water foams, shifting from blue through green and yellow to white as it speeds up
- loose droplets glint white as spray

A magnet-only build can't sense bumps, so there are no bump splashes.

*Slosh gain* (default 2×) multiplies the sensed acceleration. A real firmware might do the same so the motion still reads at POV refresh rates; set it to 1 for strict physics.

The firmware senses braking from the magnet alone: the change in revolution time between the last two passes. The estimate arrives about a revolution late. Hard braking also rotates the whole picture until the next pass, because the firmware assumes the wheel kept its last speed. *Ideal* sync shows the best case, with no lag or angle error. A 6-axis IMU at the axle would close most of that gap.

The **Stats** tab shows:
- the estimated sensed vs true acceleration
- the simulation's MFLOP/s as a share of one core on the chosen chip (about 33% of an RP2350 core at the defaults)
- firmware RAM for the lookup table and simulation state

### Bouncing smiley

The **Smiley** preset is the firmware's second physics look: a rigid smiley three quarters the size of the wheel, loose inside it. Like the water, the firmware simulates it from what the magnet tells it. Gravity holds it at the bottom, braking throws it forward and speeding up throws it back, and it bounces off the round wall, drawn as a light blue ring at the edge of the LEDs' reach. Its centre of mass is near the mouth, so it's bottom-heavy and rocks back upright like a weeble. The turning wall grips it and drags it up the rear wall, tilting it, while its weight pulls it back. With the default grip of 0.45 its weight just holds it, tilted far up the rear wall and rocking; from about 0.5 the wall wins and keeps flipping it over, so it tumbles around the bottom of the wheel. Its look settings are **Bounce**, **Wall grip** and **Push ×** (how much the sensed acceleration is exaggerated, like the water's slosh). Spin damping keeps it from spinning up to the wall's speed, so the face stays readable. Each LED shows the smiley's pixel at its position, from a 64×64 bitmap; nothing is stored per frame. The physics rate and acceleration smoothing are hardware settings (*Controller → Physics simulation*), shared with the water.

### Tumble dryer

The **Tumble dryer** preset is the third physics look: six colourful cloth ribbons tumbling in a drum. The drum is the wheel, with three paddles (white bars) on its wall, and it turns clockwise with the wheel, geared down to a quarter of its speed by default. At the wheel's full speed the drum pins the ribbons to the wall like a spin cycle, so they'd just ride round with it. The paddles carry the ribbons up the rising (rear) side until they fall back, and braking throws them forward.

- **Ribbons:** chains of 12 points, each about one and a half wheel radii long and a quarter of a radius wide. Every segment keeps its exact length, and points two apart can't come closer than 1.85 segments, so a ribbon curls and flaps but never folds flat or balls up.
- **Depth:** ribbons pass through each other rather than colliding. They're drawn back to front with opaque colour, so where two cross the nearer one covers the other, and the back ones are dimmer (65% brightness, rising to 100% at the front). Now and then two neighbouring layers swap, as the load shifts front to back in a real drum.

Its look settings are **Ribbons** (3–10), **Drum turn** (the drum's spin as a share of the wheel's), **Drum grip**, **Push ×** and **Layer shuffle** (swaps per second; 0 keeps the order fixed). Like the smiley, each step is drawn into a 64×64 bitmap and each LED shows the pixel at its position. It costs about 1.4 MFLOP/s at 30 Hz, around 2.4% of one RP2350 core, and about 6 KB of RAM; the Stats tab shows both.

### Banner mode

Set a preset's **Mode** to *Banner on the road* (or pick the *Text banner* preset) and the image stops turning with the wheel. It is pinned to the world instead and tiles along the road. At every update the firmware works out where each LED is and lights it with that spot of the banner, so the spinning strips act like a scanner that reveals a picture hanging in the air. Give the roadside strip a long exposure (1–2 s) and the bike paints the whole banner as it rides by; at the default 1/8 s, like a phone at night, it shows the stretch the bike has just passed.

Set the preset's **Picture** to *Rides with the bike* and the picture is drawn around the hub instead, upright and not turning with the wheel, so it travels with the bike while the lower-half pattern stays on the road. In a long roadside exposure it then smears along the road, as anything riding with the bike would.

Banners keep their text and pictures in the **upper half**. Below the hub the strips leave **voids**: arches standing on the road that no LED ever passes over. With 3 strips per side on a 700c wheel, about 90% of the bottom quarter and half of the band just below the middle stay dark, in a pattern that repeats every 71 cm (the circumference divided by the strips). The firmware works out banner position from the wheel's rotation, so the voids always fall in the same place in the banner, at any speed.

So the lower half isn't a picture. It is a pattern drawn along the LEDs' own paths, so every lit LED lands on ground the strips actually cover, and the patterns outline the voids exactly. Near the ground the outer LED traces the void's edge; higher up it is the point on the strip that is momentarily moving along the strip. Choose it with **Lower half** (shown in banner mode):
- **Arches** (default): a coloured outline around each void.
- **Rainbow arches:** a white outline with nested rainbow lines inside, one LED radius each.
- **Scallops:** the lit ground between voids in alternating colours, with a bright edge.
- **Beads:** round dots along each void's edge.
- **Truss bridge:** a deck just above the hub, a truss hanging below it whose big diagonals span each void, and a pier down to the road at every point where a strip points straight down (the only places the strips reach the ground). Unlike the other patterns, any strip may draw any part of it, so it uses all the coverage there is.
- **Picture (full height):** the image fills the whole height, as before.

Slow LEDs near the road dwell and look brighter, so the patterns dim each LED by its speed over the road. Text and Wide text put their words in the upper half, and other patterns are fitted into it. An uploaded image or video always fills the full height instead.

Position comes from hall-sensor dead reckoning: whole turns at each magnet pass, plus the time since the pass divided by the last revolution period. Polling delay and pedal surges show up as a torn or doubled banner. *Predict motion* computes each update for the middle of the time it's displayed instead of when it's sent. The *ideal* sync mode shows the best case. LEDs near the ground move slowly relative to the road and leave bright cusps, while the top edge streaks past at about twice road speed. The bitmap is stored at about one pixel per LED pitch, as tall as the LEDs reach.

### Settings reference

| Where | Highlights |
|---|---|
| Presets | Show: test patterns (some animated) or your own image, animated GIF/WebP/APNG, or video. Text, wheel-locked or banner mode, spin (the firmware turns a wheel-locked picture once every so many seconds, fractions allowed, by shifting the columns it sends, so it needs no extra frames), banner gap, whether a banner picture is pinned to the road or rides with the bike, the banner's lower-half pattern (arches, rainbow arches, scallops, beads, truss bridge or a full-height picture; your own pictures always fill the full height), brightness. *Water:* fluid type (water, splashy, thick), fill, rim drag, slosh, and under Details the FLIP ratio, viscosity and particle spacing. *Bouncing smiley:* bounce, wall grip, push. *Tumble dryer:* ribbons, drum turn, drum grip, push, layer shuffle. *Animation:* playback speed, timed or every-N-turns frame advance. *Picture details:* polar (picture) or Adafruit columns-as-angles layout, fill (crop to fill the wheel, or the whole picture letterboxed), zoom and move (to keep a face out of the dark hub), edges (where the picture doesn't reach: a heavily blurred mirror of it, or dark), fit, rotation. Presets hold only the look; hardware and simulator settings don't change when you switch presets |
| Hardware | Setup name. *Wheel:* size presets (700c default, 29", 27.5", 26", 24", 20", 16", 12"), with rim, tire, depth and spokes under Details. *LEDs:* strips per side (1 to 4), both sides, with LED/m, package, diffuser, start radius, length, back-strip data (own data by default, so images read correctly from both sides; *shared* mirrors the non-drive side like the Adafruit wiring), stagger, gamma, bit depth and inner-LED dimming under Details. *Controller:* sensor per strip and the preset switching, with clock, overhead, PWM, sync (hall sensors, an ideal encoder, or free-running), columns per turn, lines/s floor, hall poll and debounce, the animation import limits (max frames, video sample rate), and the firmware's physics simulation (sim rate and acceleration smoothing for the water and the bouncing smiley, plus the water's grid and pressure iterations) under the details folders |
| Simulator | *Camera:* drive or non-drive side, human eye or camera shutter for the main view, roadside strip above, below or hidden, strip exposure (the same as the main view, or its own shutter, 1/8 s by default, like a phone camera at night), with eye persistence, auto exposure and EV under Details. *Ride:* mph or km/h, pedal surge (from estimated rider power), with cadence, acceleration and braking under Details. *Render:* daylight, glow, wheel and column-buffer display, time scale, pause |
| Panels | Strips per side, tip radius, the bore's minimum (the measured hub; the bore grows to just inside the strips), nipple slot. *Spoke ties:* disc cross, tie spacing, tip tie, tab reach. *Strip, holes and blade:* strip size, how close to the axle the strips may come, tie and hole sizes, corners, blade width. *Hub and fork:* lacing, flange and fork dimensions |
| Electronics | 18650 cells in parallel and their capacity (the Stats battery figure follows), the LED current limit, the hub shell's diameter. The result lists the pins, power, balance and the shopping list |

LED PWM rates vary between datasheets, so the timing values under Details can still be edited.

## Layout

- `src/params.ts`: parameters, the platform's chip and LED figures, and which settings belong to presets vs the hardware
- `default-setup.json`, `src/defaults.ts`: the default setup and how the app loads it
- `media/`: images the default presets show, referenced by path from `default-setup.json`
- `src/presets.ts`, `src/setupFile.ts`, `src/mediaStore.ts`: named presets, the setup file, and stored uploads
- `src/ui.ts`: the settings panel and preset list
- `src/sim/`: LED bus timing, wheel kinematics, hall-sensor firmware model, stats
- `src/image/`: test patterns, image loading, conversion to the firmware column buffer
- `src/render/`: POV integration shader, wheel model with motion blur, HDR/bloom, camera
- `src/electronics/`: the electronics design (pins, level shifters, connector, harnesses, power, hub module, shopping list), its drawings and the Electronics tab
- `src/panels/`: the LED panel generator (laced-wheel model, the dished spoke surface for the clearances, the part's geometry, spoke and strip ties, clearance checks), its worker, DXF output, the drafting view and the Panels tab
- `test/`: unit tests for timing, the PWM integral, the firmware model, presets and setup files, the panel design and the electronics

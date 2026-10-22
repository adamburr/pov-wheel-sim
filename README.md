# POV Wheel Simulator

A tunable three.js simulation of a DIY persistence-of-vision (POV) bicycle wheel display, in the spirit of Adafruit's [CircuitPython POV Bike Wheel](https://learn.adafruit.com/circuitpython-pov-bike-wheel/overview). Use it to see what a build will look like *before* you cut LED strips: wheel size, strip count, LED density, speed, chip, LED type, firmware, and camera exposure are all adjustable.

**Live demo:** https://adamburr.github.io/pov-wheel-sim/

![The default Ball on a bridge preset at 10 mph: a ball bouncing above the hub, riding with the bike, over a truss bridge pinned to the road, in the roadside strip (top) and the follow view](docs/images/hero-bridge.jpg)

## Examples

These are all renders from the simulator, starting from the Water preset and the default build (700c wheel, 3 strips of 144 LED/m APA102, RP2350, 60% pedal surge) with stop-and-go off and the roadside strip hidden, unless the caption says otherwise. The banner shots are crops of the roadside strip.

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
    <td width="50%"><img src="docs/images/shutter-1-30.jpg" alt="Three wedges at a 1/30 s shutter"><br><sub><b>1/30 s photo</b> at 10 mph: each of the 3 strips sweeps only 25°.</sub></td>
    <td width="50%"><img src="docs/images/wide-text-wheel.jpg" alt="HELLO between rainbow lines on the wheel"><br><sub><b>Wide text, wheel-locked,</b> 15 mph, 1/2 s: the text sits in the upper half, clear of the hub.</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/images/ws2812-dashes.jpg" alt="Dashed arcs from WS2812 PWM"><br><sub><b>WS2812B at 400 Hz PWM</b> (close-up, 2020 LEDs, no diffuser, 20 mph, 1/30 s, polar test grid): the arcs break into dashes.</sub></td>
    <td width="50%"><img src="docs/images/adafruit-floor.jpg" alt="Broken-up image below the 400 lines/s floor"><br><sub><b>Adafruit CircuitPython preset</b> at 10 mph, 1 s, smiley: below its 400 lines/s floor the image squeezes, repeats and breaks up.</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/images/ride-by.jpg" alt="Cycloid streaks from a roadside camera"><br><sub><b>Ride-by,</b> 10 mph, 1/4 s, smiley: a fixed roadside camera sees the LEDs trace cycloids.</sub></td>
    <td width="50%"><img src="docs/images/banner-hello.jpg" alt="HELLO WORLD painted in the air above rainbow arches in banner mode"><br><sub><b>HELLO banner preset,</b> roadside, 10 mph, 2 s: the text is pinned to the road in the upper half, and rainbow arches outline the voids the strips never sweep below the hub.</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/images/banner-scallops.jpg" alt="Alternating coloured scallops around dark arch-shaped voids"><br><sub><b>Scallops lower half,</b> roadside, 10 mph, 2 s: the lit ground between the voids is filled in alternating colours, so the arch-shaped voids show plainly.</sub></td>
    <td width="50%"><img src="docs/images/banner-surge.jpg" alt="Torn banner while pulling away"><br><sub><b>Banner while pulling away</b> from 4 to 16 mph, with 4 ms hall polling and no motion prediction: dead-reckoning errors from the pedal surges tear the text and fling the arches.</sub></td>
  </tr>
  <tr>
    <td colspan="2"><img src="docs/images/banner-bridge.jpg" alt="A ball bouncing along above a truss bridge"><br><sub><b>Ball on a bridge</b> (the default preset), roadside, 10 mph, 1/2 s: the truss bridge is pinned to the road while the ball rides with the bike, showing each time a strip sweeps over it.</sub></td>
  </tr>
</table>

## Using the app

Two views show the same moment and the same animation. The main view follows the bike, and a narrow **roadside strip** above it watches the bike ride past as a fixed camera would, with a 1 s exposure by default. You can move the strip below the main view, give it its own exposure, or hide it under *Simulator → Camera*. The panel at the bottom is for riding: the current **preset** with a **Next ▶** button (or press **N**), then the speed, **🛑 Brake**, **▶ Ride** and **Stop-and-go**.

**⚙️ Settings** opens a panel: on the right on a computer, or from the bottom on a phone. Every section starts with just a few choices, and its **Details** folders hold the rest.

| Tab | What it holds |
|---|---|
| **Presets** | The list of presets and the settings of the selected one: what to show (a pattern or your own image, GIF or video), text, wheel-locked or banner mode, brightness, water and animation options |
| **Hardware** | The build: wheel size, LED type, strip count and density, controller chip, firmware and battery, with every timing value under Details |
| **Simulator** | How the simulation looks and rides: camera side, human eye or camera shutter, the roadside strip's position and exposure, units, pedal surge, rendering. Not part of the setup |
| **Stats** | Live build stats: rpm, column timing, resolution, refresh rate, RAM, current draw and battery life, with warnings for common pitfalls |

### Presets

A real wheel has one button that steps through its presets in order while you ride; **Next ▶** does the same here. The app starts with seven: Water, Smiley, Rainbow spiral (which turns slowly), Clock face (an old Roman-numeral dial whose hands spin in opposite directions), Beating heart, HELLO banner and Ball on a bridge, and opens on Ball on a bridge. Edit any of them, add a copy with **＋ New preset**, reorder them with ↑ / ↓, or delete them. **Restore built-in presets** (under *Manage presets*) brings back the originals. Delete, Restore, New and Reset hardware ask for a second click to confirm. Dropping or pasting an image puts it in the selected preset.

### Setups

A setup is the hardware build plus all the presets. It saves automatically in the browser, uploaded images included. **Save** downloads it as a `.json` file with images embedded, **Open…** (or dropping the file on the page) loads one, and **New** puts everything back to the defaults: the hardware, the built-in presets and the simulator settings. The setup file is also what a future version will flash to the wheel's controller.

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
- Drag the slider to change speed.
- **🛑 Brake** stops the bike; **▶ Ride** sets off again.
- **Stop-and-go** (on by default) rides through the city automatically: it pulls away to a top speed between half and one and a half times the stop-and-go cruise speed, cruises for 4–12 s, brakes for a light, and waits 2–6 s. Each light turns red at a random distance ahead (3–40 m), and the rider brakes just hard enough to stop there, so some stops are sharp and others a slow roll-down. Each pull-away varies too.

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

### Banner mode

Set a preset's **Mode** to *Banner on the road* (or pick the *HELLO banner* preset) and the image stops turning with the wheel. It is pinned to the world instead and tiles along the road. At every update the firmware works out where each LED is and lights it with that spot of the banner, so the spinning strips act like a scanner that reveals a picture hanging in the air. In the roadside strip's long exposure, the bike paints the banner as it rides by.

Set the preset's **Picture** to *Rides with the bike* and the picture is drawn around the hub instead, upright and not turning with the wheel, so it travels with the bike while the lower-half pattern stays on the road. In a long roadside exposure it then smears along the road, as anything riding with the bike would.

Banners keep their text and pictures in the **upper half**. Below the hub the strips leave **voids**: arches standing on the road that no LED ever passes over. With 3 strips per side on a 700c wheel, about 90% of the bottom quarter and half of the band just below the middle stay dark, in a pattern that repeats every 71 cm (the circumference divided by the strips). The firmware works out banner position from the wheel's rotation, so the voids always fall in the same place in the banner, at any speed.

So the lower half isn't a picture. It is a pattern drawn along the LEDs' own paths, so every lit LED lands on ground the strips actually cover, and the patterns outline the voids exactly. Near the ground the outer LED traces the void's edge; higher up it is the point on the strip that is momentarily moving along the strip. Choose it with **Lower half** (shown in banner mode):
- **Arches** (default): a coloured outline around each void.
- **Rainbow arches:** a white outline with nested rainbow lines inside, one LED radius each.
- **Scallops:** the lit ground between voids in alternating colours, with a bright edge.
- **Beads:** round dots along each void's edge.
- **Truss bridge:** a deck just above the hub, a truss hanging below it whose big diagonals span each void, and a pier down to the road at every point where a strip points straight down (the only places the strips reach the ground). Unlike the other patterns, any strip may draw any part of it, so it uses all the coverage there is.
- **Picture (full height):** the image fills the whole height, as before.

Slow LEDs near the road dwell and look brighter, so the patterns dim each LED by its speed over the road. Text and Wide text put their words in the upper half; other patterns and uploaded images are fitted into it.

Position comes from hall-sensor dead reckoning: whole turns at each magnet pass, plus the time since the pass divided by the last revolution period. Polling delay and pedal surges show up as a torn or doubled banner. *Predict motion* computes each update for the middle of the time it's displayed instead of when it's sent. The *ideal* sync mode shows the best case. LEDs near the ground move slowly relative to the road and leave bright cusps, while the top edge streaks past at about twice road speed. The bitmap is stored at about one pixel per LED pitch, as tall as the LEDs reach.

### Settings reference

| Where | Highlights |
|---|---|
| Presets | Show: test patterns (some animated) or your own image, animated GIF/WebP/APNG, or video. Text, wheel-locked or banner mode, spin (the firmware turns a wheel-locked picture once every so many seconds by shifting the columns it sends, so it needs no extra frames), banner gap, whether a banner picture is pinned to the road or rides with the bike, the banner's lower-half pattern (arches, rainbow arches, scallops, beads, truss bridge or a full-height picture), brightness. *Water:* fluid type (water, splashy, thick), fill, rim drag, slosh, and under Details the FLIP ratio, viscosity, particle spacing, grid size, sim rate, pressure iterations and acceleration smoothing. *Animation:* playback speed, timed or every-N-turns frame advance, import frame limit, video sample rate. *Picture details:* polar (picture) or Adafruit columns-as-angles layout, fit, rotation, inner-LED dimming |
| Hardware | Setup name. *Wheel:* size presets (700c default, 29", 27.5", 26", 24", 20", 16", 12"), with rim, tire, depth and spokes under Details. *LEDs:* type (APA102, SK9822, HD107S, WS2812B, SK6812), strip count, LED/m, both sides, with package, diffuser, start radius, length, back-strip data (own data by default, so images read correctly from both sides; *shared* mirrors the non-drive side like the Adafruit wiring), stagger, gamma and bit depth under Details. *Controller:* chip (ATmega328P → Teensy 4.x, RP2350 default), firmware (C/Arduino hall sensor, Adafruit CircuitPython guide behaviour, or ideal encoder-locked), battery, with clock, lanes, overhead, PWM, sync, columns per turn, lines/s floor, hall poll and debounce under the details folders |
| Simulator | *Camera:* drive or non-drive side, human eye or camera shutter for the main view, roadside strip above, below or hidden, strip exposure (the same as the main view, or its own shutter, 1 s by default), with eye persistence, auto exposure and EV under Details. *Ride:* mph or km/h, pedal surge (from estimated rider power), with cadence, acceleration and braking under Details. *Render:* daylight, glow, wheel and column-buffer display, time scale, pause |

LED PWM rates vary between datasheets and clone parts, so every value filled in from the LED and chip tables can still be edited.

## Layout

- `src/params.ts`: parameters, the hardware lookup tables, and which settings belong to presets vs the hardware
- `src/presets.ts`, `src/setupFile.ts`, `src/mediaStore.ts`: named presets, the setup file, and stored uploads
- `src/ui.ts`: the settings panel and preset list
- `src/sim/`: LED bus timing, wheel kinematics, hall-sensor firmware model, stats
- `src/image/`: test patterns, image loading, conversion to the firmware column buffer
- `src/render/`: POV integration shader, wheel model with motion blur, HDR/bloom, camera
- `test/`: unit tests for timing, the PWM integral, the firmware model, presets and setup files

# POV Wheel Simulator

A tunable three.js simulation of a DIY persistence-of-vision (POV) bicycle wheel display, in the spirit of Adafruit's [CircuitPython POV Bike Wheel](https://learn.adafruit.com/circuitpython-pov-bike-wheel/overview). Use it to see what a build will look like *before* you cut LED strips: wheel size, strip count, LED density, speed, chip, LED type, firmware, and camera exposure are all adjustable.

**Live demo:** https://adamburr.github.io/pov-wheel-sim/

![A smiley face on a 700c wheel with 3 LED strips at 15 mph, 1/2 s exposure](docs/images/hero-smiley.jpg)

## Examples

These are all renders from the simulator, starting from the defaults (700c wheel, 3 strips of 144 LED/m APA102, RP2350, 10 mph) unless the caption says otherwise.

<table>
  <tr>
    <td width="50%"><img src="docs/images/eye-default.jpg" alt="Human-eye view with fading sectors"><br><sub><b>Human eye</b> (default): at 10 mph each point refreshes about 6 times a second, so you see fading sectors.</sub></td>
    <td width="50%"><img src="docs/images/shutter-1-30.jpg" alt="Three wedges at a 1/30 s shutter"><br><sub><b>1/30 s photo:</b> each of the 3 strips sweeps only 25°.</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/images/ws2812-dashes.jpg" alt="Dashed arcs from WS2812 PWM"><br><sub><b>WS2812B at 400 Hz PWM</b> (close-up, 2020 LEDs, no diffuser, 20 mph, 1/30 s): the arcs break into dashes.</sub></td>
    <td width="50%"><img src="docs/images/adafruit-floor.jpg" alt="Broken-up image below the 400 lines/s floor"><br><sub><b>Adafruit CircuitPython preset at 10 mph:</b> below its 400 lines/s floor the image squeezes, repeats and breaks up.</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/images/ride-by.jpg" alt="Cycloid streaks from a roadside camera"><br><sub><b>Ride-by, 1/4 s:</b> a fixed roadside camera sees the LEDs trace cycloids.</sub></td>
    <td width="50%"><img src="docs/images/banner-hello.jpg" alt="HELLO painted in the air in banner mode"><br><sub><b>Banner mode, 2 s:</b> the image is pinned to the world and painted as the bike rides past.</sub></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/images/banner-surge.jpg" alt="Torn banner from hall-sensor dead reckoning"><br><sub><b>Banner with 20% pedal surge and 4 ms hall polling:</b> dead-reckoning errors tear and double the text.</sub></td>
    <td width="50%"><img src="docs/images/banner-flipbook.jpg" alt="Bouncing ball animation as a flip-book along the road"><br><sub><b>Animated banner:</b> frames advance as the bike travels, so the road becomes a flip-book.</sub></td>
  </tr>
</table>

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

In banner mode the frames advance as the bike travels, so the road becomes a flip-book.

### Banner mode

Set **Image → display mode** to *banner (world-locked)* and the image stops turning with the wheel. It is pinned to the world instead and tiles along the road. At every update the firmware works out where each LED is and lights it with that spot of the banner, so the spinning strips act like a scanner that reveals a picture hanging in the air. Seen from the roadside with a long exposure, the bike paints the banner as it rides by.

Position comes from hall-sensor dead reckoning: whole turns at each magnet pass, plus the time since the pass divided by the last revolution period. Polling delay and pedal surges show up as a torn or doubled banner. *Predict motion* computes each update for the middle of the time it's displayed instead of when it's sent. The *ideal* sync mode shows the best case. LEDs near the ground move slowly relative to the road and leave bright cusps, while the top edge streaks past at about twice road speed. The bitmap is stored at about one pixel per LED pitch, as tall as the LEDs reach.

### Parameters

| Group | Highlights |
|---|---|
| Wheel | Size presets (700c default, 29", 27.5", 26", 24", 20", 16", 12"), tire width, rim depth, spokes |
| Strips & LEDs | Strip count, LED/m, package size, diffuser, start radius, double-sided, back-strip data, radial stagger |
| Ride | Speed (mph or km/h), pedal-surge wobble, cadence |
| Electronics | Chip preset (ATmega328P → Teensy 4.x, RP2350 default), LED type (APA102, SK9822, HD107S, WS2812B, SK6812), clock, parallel lanes, overhead, PWM, global brightness |
| Firmware | C/Arduino hall-sensor, Adafruit CircuitPython guide behaviour, or ideal encoder-locked; columns/rev, lines/s floor, hall poll, debounce |
| Image | Wheel-locked or banner (world-locked) display, load/drop/paste an image, animated GIF/WebP/APNG, or video, or pick a test pattern (some animated), polar (picture) or Adafruit columns-as-angles mapping, gamma, bit depth, inner-LED dimming |
| Animation | Timed or revolution-synced frame advance, playback rate (×, kept across clips), source fps, revolutions per frame, import frame limit, video sample rate |
| Camera | Chase or ride-by view, drive or non-drive side, shutter speed or human-eye persistence, auto exposure, EV, time scale |

The stats panel reports rpm, column timing, achievable resolution, refresh rate, RAM use, current draw, and battery life, with warnings for common pitfalls.

LED PWM rates vary between datasheets and clone parts, so every preset value can be edited.

## Layout

- `src/params.ts`: parameters and preset tables
- `src/sim/`: LED bus timing, wheel kinematics, hall-sensor firmware model, stats
- `src/image/`: test patterns, image loading, conversion to the firmware column buffer
- `src/render/`: POV integration shader, wheel model with motion blur, HDR/bloom, camera
- `test/`: unit tests for timing, the PWM integral, and the firmware model

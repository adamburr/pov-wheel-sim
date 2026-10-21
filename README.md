# POV Wheel Simulator

A tunable three.js simulation of a DIY persistence-of-vision (POV) bicycle wheel display, in the spirit of Adafruit's [CircuitPython POV Bike Wheel](https://learn.adafruit.com/circuitpython-pov-bike-wheel/overview). Use it to see what a build will look like *before* you cut LED strips: wheel size, strip count, LED density, speed, chip, LED type, firmware, and camera exposure are all adjustable.

**Live demo:** https://adamburr.github.io/pov-wheel-sim/

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
| Image | Wheel-locked or banner (world-locked) display, load/drop/paste any image or pick a test pattern, polar (picture) or Adafruit columns-as-angles mapping, gamma, bit depth, inner-LED dimming |
| Camera | Chase or ride-by view, drive or non-drive side, shutter speed or human-eye persistence, auto exposure, EV, time scale |

The stats panel reports rpm, column timing, achievable resolution, refresh rate, RAM use, current draw, and battery life, with warnings for common pitfalls.

LED PWM rates vary between datasheets and clone parts, so every preset value can be edited.

## Layout

- `src/params.ts`: parameters and preset tables
- `src/sim/`: LED bus timing, wheel kinematics, hall-sensor firmware model, stats
- `src/image/`: test patterns, image loading, conversion to the firmware column buffer
- `src/render/`: POV integration shader, wheel model with motion blur, HDR/bloom, camera
- `test/`: unit tests for timing, the PWM integral, and the firmware model

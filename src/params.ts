// Single source of truth for every tunable value. The UI writes here, the sim and renderer read.
// Preset tables only seed these values; every seeded value stays editable afterwards.

export interface WheelPreset { bsdMm: number; tireMm: number; spokes: number }
export const WHEELS: Record<string, WheelPreset> = {
  '700c (622)':        { bsdMm: 622, tireMm: 28, spokes: 32 },
  '29" MTB (622)':     { bsdMm: 622, tireMm: 57, spokes: 32 },
  '27.5" / 650b (584)': { bsdMm: 584, tireMm: 55, spokes: 32 },
  '26" (559)':         { bsdMm: 559, tireMm: 50, spokes: 32 },
  '24" (507)':         { bsdMm: 507, tireMm: 45, spokes: 32 },
  '20" (406)':         { bsdMm: 406, tireMm: 50, spokes: 28 },
  '16" (305)':         { bsdMm: 305, tireMm: 47, spokes: 28 },
  '12" (203)':         { bsdMm: 203, tireMm: 50, spokes: 16 },
};

export interface ChipPreset {
  cpuMHz: number;
  maxClockMHz: number;   // practical LED clock the peripheral (SPI/PIO/I2S) can drive
  maxLanes: number;      // parallel data lines on a shared clock (PIO/I2S/FlexIO)
  ramKB: number;
  overheadUsC: number;   // per-column firmware overhead, compiled C/Arduino
  overheadUsPy: number;  // per-column overhead under CircuitPython (0 = unsupported)
}
// Approximate figures; overheads are order-of-magnitude estimates for a tight column loop.
export const CHIPS: Record<string, ChipPreset> = {
  'ATmega328P (Uno/Nano)': { cpuMHz: 16,  maxClockMHz: 8,  maxLanes: 1, ramKB: 2,    overheadUsC: 40, overheadUsPy: 0 },
  'SAMD21 (M0)':           { cpuMHz: 48,  maxClockMHz: 12, maxLanes: 1, ramKB: 32,   overheadUsC: 15, overheadUsPy: 1200 },
  'SAMD51 (M4)':           { cpuMHz: 120, maxClockMHz: 24, maxLanes: 1, ramKB: 192,  overheadUsC: 6,  overheadUsPy: 350 },
  'nRF52840':              { cpuMHz: 64,  maxClockMHz: 8,  maxLanes: 1, ramKB: 256,  overheadUsC: 10, overheadUsPy: 500 },
  'RP2040':                { cpuMHz: 133, maxClockMHz: 20, maxLanes: 4, ramKB: 264,  overheadUsC: 4,  overheadUsPy: 300 },
  'RP2350':                { cpuMHz: 150, maxClockMHz: 24, maxLanes: 4, ramKB: 520,  overheadUsC: 3,  overheadUsPy: 220 },
  'ESP32':                 { cpuMHz: 240, maxClockMHz: 20, maxLanes: 8, ramKB: 320,  overheadUsC: 8,  overheadUsPy: 300 },
  'ESP32-S3':              { cpuMHz: 240, maxClockMHz: 20, maxLanes: 8, ramKB: 512,  overheadUsC: 6,  overheadUsPy: 250 },
  'Teensy 4.x':            { cpuMHz: 600, maxClockMHz: 30, maxLanes: 4, ramKB: 1024, overheadUsC: 1,  overheadUsPy: 120 },
};

export type Protocol = 'clocked' | 'single-wire';
export interface LedPreset {
  protocol: Protocol;
  maxClockMHz: number;  // clocked: max SCK; single-wire: fixed bit rate
  bitsPerLed: number;
  pwmHz: number;
  gbMode: 'pwm' | 'current' | 'none'; // how 5-bit global brightness is implemented
  gbPwmHz: number;       // APA102 superimposes a slower PWM when global brightness < 31
  resetUs: number;       // single-wire latch/reset gap
}
// PWM rates disagree between datasheets and clone parts; treat these as editable starting points.
export const LEDS: Record<string, LedPreset> = {
  'APA102 / DotStar':  { protocol: 'clocked',     maxClockMHz: 20,  bitsPerLed: 32, pwmHz: 19200, gbMode: 'pwm',     gbPwmHz: 580, resetUs: 0 },
  'SK9822':            { protocol: 'clocked',     maxClockMHz: 15,  bitsPerLed: 32, pwmHz: 4700,  gbMode: 'current', gbPwmHz: 0,   resetUs: 0 },
  'HD107S':            { protocol: 'clocked',     maxClockMHz: 40,  bitsPerLed: 32, pwmHz: 27000, gbMode: 'current', gbPwmHz: 0,   resetUs: 0 },
  'WS2812B / NeoPixel': { protocol: 'single-wire', maxClockMHz: 0.8, bitsPerLed: 24, pwmHz: 1000,  gbMode: 'none',    gbPwmHz: 0,   resetUs: 280 },
  'SK6812':            { protocol: 'single-wire', maxClockMHz: 0.8, bitsPerLed: 24, pwmHz: 1100,  gbMode: 'none',    gbPwmHz: 0,   resetUs: 80 },
};

// Emitter footprint (mm) for common LED packages.
export const PACKAGES: Record<string, number> = { '5050': 5.0, '3535': 3.5, '2020': 2.0 };

export type SyncMode = 'hall' | 'ideal' | 'free';
export interface FirmwarePreset {
  label: string;
  python: boolean;
  syncMode: SyncMode;
  hallPollMs: number;
  debounceMs: number;
  minLinesPerSec: number;
  columnsPerRev: number;
  clockMHz?: number;
}
export const FIRMWARE: Record<string, FirmwarePreset> = {
  'C / Arduino (hall interrupt)':  { label: 'C', python: false, syncMode: 'hall', hallPollMs: 0, debounceMs: 20,  minLinesPerSec: 0,   columnsPerRev: 256 },
  'Adafruit guide (CircuitPython)': { label: 'CircuitPython', python: true, syncMode: 'hall', hallPollMs: 4, debounceMs: 120, minLinesPerSec: 400, columnsPerRev: 144, clockMHz: 4 },
  'Ideal (encoder-locked)':        { label: 'ideal', python: false, syncMode: 'ideal', hallPollMs: 0, debounceMs: 0, minLinesPerSec: 0, columnsPerRev: 256 },
};

export const SHUTTERS: Record<string, number> = {
  '1/2000 s': 1 / 2000, '1/1000 s': 1 / 1000, '1/500 s': 1 / 500, '1/250 s': 1 / 250,
  '1/125 s': 1 / 125, '1/60 s': 1 / 60, '1/30 s': 1 / 30, '1/15 s': 1 / 15, '1/8 s': 1 / 8,
  '1/4 s': 1 / 4, '1/2 s': 1 / 2, '1 s': 1, '2 s': 2,
};

export const PATTERNS = ['Smiley', 'Polar test grid', 'Clock face', 'Color wheel', 'Rainbow spiral', 'Checkerboard', 'Text', 'Wide text',
  'Bouncing ball (animated)', 'Beating heart (animated)', 'Counter (animated)'] as const;
export type PatternName = (typeof PATTERNS)[number];

export const MPH = 0.44704; // m/s

export function defaultParams() {
  const wheel = WHEELS['700c (622)'];
  const chip = CHIPS['RP2350'];
  const led = LEDS['APA102 / DotStar'];
  const fw = FIRMWARE['C / Arduino (hall interrupt)'];
  return {
    // Wheel
    wheelPreset: '700c (622)',
    bsdMm: wheel.bsdMm,
    tireMm: wheel.tireMm,
    rimDepthMm: 22,
    spokes: wheel.spokes,

    // Strips & LEDs
    stripCount: 3,
    ledDensity: 144,          // LED/m
    ledPackage: '5050',
    dieMm: PACKAGES['5050'],
    diffusionMm: 1.5,         // silicone sleeve / diffuser spread
    stripStartMm: 30,         // radius where the first LED sits (clears the hub flange)
    autoLength: true,
    stripLengthMm: 250,
    doubleSided: true,
    backData: 'same' as 'same' | 'independent',
    radialStagger: false,

    // Ride
    speedUnit: 'mph' as 'mph' | 'km/h',
    speed: 10,
    wobblePct: 0,             // pedal-stroke speed surge amplitude
    cadenceRpm: 80,           // two surges per crank revolution

    // Electronics
    chip: 'RP2350',
    ledType: 'APA102 / DotStar',
    clockMHz: Math.min(chip.maxClockMHz, led.maxClockMHz),
    lanes: 3,
    overheadUs: chip.overheadUsC,
    pwmHz: led.pwmHz,
    globalBrightness: 31,     // 0..31
    gbPwmHz: led.gbPwmHz,
    batteryMah: 5000,

    // Firmware
    firmware: 'C / Arduino (hall interrupt)',
    python: fw.python,
    syncMode: fw.syncMode as SyncMode,
    columnsPerRev: fw.columnsPerRev,
    minLinesPerSec: fw.minLinesPerSec,
    hallPollMs: fw.hallPollMs,
    debounceMs: fw.debounceMs,
    overflow: 'wrap' as 'wrap' | 'blank',
    predictMotion: true,      // banner mode: compute each update for mid-display time, not send time
    freeRunColsPerSec: 540,

    // Image
    displayMode: 'wheel' as 'wheel' | 'banner', // banner: image pinned to the world, tiled along the road
    tileGapM: 0,
    // Animation
    frameAdvance: 'timed' as 'timed' | 'revolution', // timed: at animFps; revolution: at the magnet
    animFps: 12,              // the clip's own frame rate (set when a clip or pattern loads)
    playbackRate: 1,          // speed multiplier, kept across clips
    revsPerFrame: 1,
    maxFrames: 48,            // frames kept when importing a GIF/video
    videoFps: 12,             // sampling rate for video clips
    pattern: 'Smiley' as PatternName,
    text: 'HELLO',
    mapping: 'polar' as 'polar' | 'columns',
    fit: 'disc' as 'disc' | 'annulus',
    imageRotationDeg: 0,
    gamma: 2.2,
    colorBits: 8,
    radialCompensation: false,
    showBuffer: false,

    // Camera / exposure
    view: 'chase' as 'chase' | 'ride-by',
    side: 'drive' as 'drive' | 'non-drive',
    exposureModel: 'eye' as 'camera' | 'eye',
    shutter: '1/4 s',
    eyeTauMs: 60,
    autoExposure: true,
    ev: 0,
    timeScale: 1,
    paused: false,

    // Render
    ambient: 0.08,
    bloom: 0.45,
    showWheel: true,
    quality: 48,              // max exposure slices per frame
    trackLengthM: 6,
  };
}
export type Params = ReturnType<typeof defaultParams>;

/** Frames per second the firmware aims for in timed playback. */
export function playbackFps(p: Params): number {
  return p.animFps * p.playbackRate;
}

export function speedMps(p: Params): number {
  return p.speedUnit === 'mph' ? p.speed * MPH : p.speed / 3.6;
}

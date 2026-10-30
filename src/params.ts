// Single source of truth for every tunable value. The UI writes here, the sim and renderer read.
// Preset tables only seed these values; every seeded value stays editable afterwards.
import { MATERIALS } from './panels/materials';

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
  name: string;
  cpuMHz: number;
  maxClockMHz: number;   // practical LED clock the PIO can drive through the level shifters and wiring
  maxLanes: number;      // parallel data lines on a shared clock (PIO)
  ramKB: number;
  overheadUs: number;    // per-column firmware overhead, compiled C
  mflops: number;        // sustained single-precision MFLOP/s on one core (rough)
}
// The one electronics platform: an Adafruit Feather RP2350 (with HSTX port and PSRAM) driving Adafruit
// DotStar strips. PIO on the HSTX port's eight pins sends every strip its own data on a shared clock per
// side (see src/electronics). Figures are approximate; mflops assumes ~0.4 flop/cycle on the M33's FPU.
export const CHIP: ChipPreset = { name: 'RP2350', cpuMHz: 150, maxClockMHz: 24, maxLanes: 8, ramKB: 520, overheadUs: 3, mflops: 60 };

export type Protocol = 'clocked' | 'single-wire';
export interface LedPreset {
  name: string;
  protocol: Protocol;
  maxClockMHz: number;  // clocked: max SCK; single-wire: fixed bit rate
  bitsPerLed: number;
  pwmHz: number;
  gbMode: 'pwm' | 'current' | 'none'; // how 5-bit global brightness is implemented
  gbPwmHz: number;       // APA102 superimposes a slower PWM when global brightness < 31
  resetUs: number;       // single-wire latch/reset gap
}
// Adafruit DotStar 144/m (products 2241, 2328) use SK9822 LEDs. The PWM rate disagrees between
// datasheets; treat it as an editable starting point.
export const LED: LedPreset = { name: 'DotStar (SK9822)', protocol: 'clocked', maxClockMHz: 15, bitsPerLed: 32, pwmHz: 4700, gbMode: 'current', gbPwmHz: 0, resetUs: 0 };

// Emitter footprint (mm) for common LED packages.
export const PACKAGES: Record<string, number> = { '5050': 5.0, '3535': 3.5, '2020': 2.0 };

export type SyncMode = 'hall' | 'ideal' | 'free';

export interface FluidPreset { flip: number; viscosity: number; separation: number }
// How the simulated liquid behaves. FLIP near 1 keeps motion lively; viscosity damps it.
export const FLUIDS: Record<string, FluidPreset> = {
  'Water': { flip: 0.97, viscosity: 0, separation: 1 },
  'Splashy': { flip: 0.99, viscosity: 0, separation: 0.5 },
  'Thick (oil)': { flip: 0.7, viscosity: 0.4, separation: 1 },
};

export const SHUTTERS: Record<string, number> = {
  '1/2000 s': 1 / 2000, '1/1000 s': 1 / 1000, '1/500 s': 1 / 500, '1/250 s': 1 / 250,
  '1/125 s': 1 / 125, '1/60 s': 1 / 60, '1/30 s': 1 / 30, '1/15 s': 1 / 15, '1/8 s': 1 / 8,
  '1/4 s': 1 / 4, '1/2 s': 1 / 2, '1 s': 1, '2 s': 2,
};

export const PATTERNS = ['Smiley', 'Polar test grid', 'Clock face', 'Color wheel', 'Rainbow spiral', 'Checkerboard', 'Text', 'Wide text',
  'Bouncing ball (animated)', 'Beating heart (animated)', 'Counter (animated)', 'Water (fluid sim)', 'Bouncing smiley', 'Tumble dryer'] as const;
export type PatternName = (typeof PATTERNS)[number];

/**
 * What fills the lower half of a banner. Near the ground the strips leave arch-shaped voids
 * they never pass over; the patterns are drawn along the LEDs' own paths, around those voids.
 * 'picture' uses the whole height for the image instead.
 */
export const BANNER_LOWER = ['picture', 'arches', 'rainbow', 'scallops', 'beads', 'bridge'] as const;
export type BannerLower = (typeof BANNER_LOWER)[number];

export const MPH = 0.44704; // m/s

/** The brightness button's steps: each press scales every LED (and the firmware's current limit) by the next. */
export const BRIGHTNESS_STEPS = [1, 0.5, 0.25, 0.125];
export const brightnessScale = (p: { brightnessLevel: number; switchedOff: boolean }) => (p.switchedOff ? 0 : BRIGHTNESS_STEPS[p.brightnessLevel] ?? 1);

export function defaultParams() {
  const wheel = WHEELS['700c (622)'];
  return {
    setupName: 'My wheel',    // names the setup file

    // Wheel
    wheelPreset: '700c (622)',
    bsdMm: wheel.bsdMm,
    tireMm: wheel.tireMm,
    rimDepthMm: 9,            // bead seat to the rim's inner wall: the prototype's, from the panels' measured tip radius
    spokes: wheel.spokes,

    // Strips & LEDs
    stripCount: 4,            // strips per side
    ledDensity: 144,          // LED/m
    ledPackage: '5050',
    dieMm: PACKAGES['5050'],
    diffusionMm: 1.5,         // silicone sleeve / diffuser spread
    stripStartMm: 33,         // radius where the first LED sits: the panels' strips, laid from the tip in
    autoLength: false,
    stripLengthMm: 264,       // to the panels' tips: 38 LEDs, from one half-metre strip each
    doubleSided: true,
    backData: 'independent' as 'same' | 'independent', // independent: each side has its own strips and data
    radialStagger: false,

    // Panels: the flat-cut LED supports, tied to the spokes (see src/panels). Strips, LED density,
    // spokes and the rim come from the settings above.
    panelMaterial: 'pp_08',   // polypropylene sheet, 0.8 mm
    panelBoreMm: 38.1,        // smallest centre hole: round the hub (measured 1.5"); the bore grows to just inside the strips' inner ends
    panelTipRadiusMm: 298.45, // radius of the blade tips on the wheel (measured 11.75"); 0 = just inside the rim
    panelTipSlot: 'auto' as 'auto' | 'none', // a nipple under a tip: slot the tip round it, or stop the blades short of the nipples
    panelStripWidthMm: 14,    // LED strip in its sleeve (Adafruit 2241)
    panelStripThickMm: 4,
    panelTieWidthMm: 3.6,     // zip tie strap; holes are square, tie width + clearance
    panelTieClearMm: 1,
    panelHolesEvery: 2,       // strip ties every N pixels
    panelEdgeMm: 4,           // minimum material from a hole to the edge, and between ties
    panelCornerMm: 2,         // radius on every outline corner
    panelBladeWidthMm: 0,     // blade width; 0 = the narrowest that holds the strip ties
    panelDiscCross: 0,        // the disc reaches this spoke cross (1 = nearest the hub; 0 = the outermost, interlaced one) and is tied at each crossing there
    panelTieSpanMm: 80,       // longest stretch of blade between spoke ties
    panelTipTieMm: 30,        // a spoke tie within this of each tip
    panelStripMinMm: 30,      // the strips, laid from the tips in, stop at least this far from the axle (the fork is close by the hub)
    panelTabMaxMm: 0,         // farthest a tab reaches beyond the blade's edge to a spoke; 0 = the gap between one side's spokes
    spokeCrosses: 3,          // lacing
    hubFlangePcdMm: 44,       // flange spoke-hole circle (typical; must be larger than the bore)
    hubFlangeOffsetMm: 35,    // hub centre to each flange (typical)
    hubOldMm: 100,            // over-locknut width
    forkCrownRadiusMm: 340,   // where the fork legs meet the crown, from the axle (typical)
    forkCrownHalfMm: 22,      // half the inside width at the crown (typical)

    // Ride
    speedUnit: 'mph' as 'mph' | 'km/h',
    speed: 10,
    pedalSurgePct: 60,        // each pedal stroke pulses the rider's push by ±this much
    cadenceRpm: 80,           // two surges per crank revolution
    speedRampG: 0.3,          // how quickly speed changes reach the target (0 = instantly)
    brakeG: 0.5,
    braking: false,           // set by the Brake button; braking uses brakeG
    resumeSpeed: 10,
    cityMode: true,           // automatic stop-and-go riding
    citySpeed: 12,            // cruise speed between lights (same units as speed)

    // Electronics
    clockMHz: 12,             // LED clock: 12 MHz is comfortable through the level shifters, wiring and the connector
    overheadUs: CHIP.overheadUs,
    pwmHz: LED.pwmHz,
    globalBrightness: 31,     // 0..31
    gbPwmHz: LED.gbPwmHz,
    batteryMah: 6000,         // set from the cells in the Electronics tab
    cells: 2,                 // 18650 cells in parallel (1S)
    cellMah: 3000,
    ledCapA: 3.5,             // firmware limit on the strips' total current (the boost gives about 4 A)
    hubShellMm: 30,           // hub shell diameter between the flanges (typical; measure)

    // Firmware
    syncMode: 'hall' as SyncMode,
    columnsPerRev: 256,
    minLinesPerSec: 0,
    hallPollMs: 0,            // 0: an interrupt on each sensor's pin
    debounceMs: 20,
    hallPerStrip: true,       // a hall sensor per strip: a magnet pass every 1/strips turn
    overflow: 'wrap' as 'wrap' | 'blank',
    predictMotion: true,      // banner mode: compute each update for mid-display time, not send time
    nextOnDark: true,         // switch to the next preset each time the lights go out (stopping)
    brightnessLevel: 0,       // the wheel's brightness button: a step of BRIGHTNESS_STEPS, kept when switched off
    switchedOff: false,       // its double click switches the wheel off, and on again (not saved)
    freeRunColsPerSec: 540,

    // Image
    useMedia: false,          // show the preset's uploaded image/clip instead of the pattern
    displayMode: 'wheel' as 'wheel' | 'banner', // banner: image pinned to the world, tiled along the road
    tileGapM: 0,
    bannerLower: 'arches' as BannerLower, // banner: the lower half is a picture or a pattern drawn around the voids
    bannerUpper: 'road' as 'road' | 'bike', // banner: the picture is pinned to the road or rides with the bike
    spinSeconds: 0,           // wheel-locked: the firmware turns the picture once every this many seconds (0 = still; positive turns it against the wheel, negative with it)
    backSide: 'reads' as 'reads' | 'mirror', // own-data back strips: redraw the picture to read right, or show the drive side's pixels (a mirror image)
    // Animation
    frameAdvance: 'timed' as 'timed' | 'revolution', // timed: at animFps; revolution: at the magnet
    animFps: 12,              // the clip's own frame rate (set when a clip or pattern loads)
    playbackRate: 1,          // speed multiplier, kept across clips
    revsPerFrame: 1,
    maxFrames: 48,            // frames kept when importing a GIF/video
    videoFps: 12,             // sampling rate for video clips
    // Water (fluid sim)
    waterFill: 0.4,           // fraction of the disc
    waterGrid: 24,            // cells across the disc
    waterHz: 30,              // simulation steps per second
    waterIters: 20,           // pressure-solve iterations
    fluid: 'Water',
    waterFlip: 0.97,          // FLIP/PIC blend
    waterViscosity: 0,
    waterSeparation: 1,
    rimFriction: 0.05,        // spinning rim drags the water; ~0.2+ carries it round into a ring
    accelSmoothMs: 50,        // low-pass on the firmware's acceleration estimate (it is already held per revolution)
    waterGain: 2,             // firmware exaggerates the sensed acceleration so the slosh reads at POV refresh rates
    // Bouncing smiley (rigid body): a disc three quarters the wheel's size loose inside it
    smileyBounce: 0.9,        // restitution against the wall
    smileyGrip: 0.45,         // friction with the turning wall: just short of flipping the smiley (from about 0.5 it does)
    smileyGain: 2,            // exaggerates the sensed acceleration, like the water's slosh
    // Tumble dryer (ribbons): cloth ribbons tumbling in the drum, lifted by three paddles
    dryerRibbons: 6,          // how many ribbons (3–10)
    dryerDrumTurn: 0.25,      // the drum's spin as a share of the wheel's: at ×1 the ribbons pin to the rim
    dryerGrip: 0.4,           // share of the slip against the drum wall removed at each contact
    dryerGain: 2,             // exaggerates the sensed acceleration, like the water's slosh
    dryerShuffle: 0.5,        // depth swaps per second between neighbouring ribbons (0 = a fixed order)
    pattern: 'Water (fluid sim)' as PatternName,
    text: 'HELLO',
    mapping: 'polar' as 'polar' | 'columns',
    fit: 'disc' as 'disc' | 'annulus',
    pictureFill: 'crop' as 'crop' | 'whole', // a non-square picture: crop it to fill the wheel, or letterbox the whole of it
    pictureZoom: 1,           // scales a picture about the wheel's centre (1 = as filled)
    pictureX: 0,              // moves it right, as a share of the wheel's width (negative = left)
    pictureY: 0,              // moves it up, as a share of the wheel's height (negative = down)
    pictureEdges: 'mirror' as 'dark' | 'mirror', // where a picture doesn't reach: dark, or a blurred mirror tiling of it
    imageRotationDeg: 0,
    gamma: 2.2,
    colorBits: 8,
    radialCompensation: false,
    showBuffer: false,

    // Camera / exposure. The main view follows the bike; the strip watches from the roadside.
    // `view` and `trackLengthM` are set per render (see main.ts), not by the user.
    view: 'chase' as 'chase' | 'ride-by',
    strip: 'above' as 'above' | 'below' | 'off',
    stripShutter: '1/8 s',    // the roadside strip mimics a basic phone camera at night, no flash or night mode
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

// Every saved value belongs to one of two groups. Preset keys are the look, which the rider
// switches between on the bike, so each named preset has its own; device keys describe the
// physical build and its firmware, including how hard the water simulation works, how much
// animation it stores and display corrections like gamma. Together they make up the
// setup file (and, later, what gets flashed to the controller). Everything else only drives the
// simulation: riding, camera, exposure and rendering.
export const PRESET_KEYS = [
  'pattern', 'useMedia', 'text', 'displayMode', 'tileGapM', 'bannerLower', 'bannerUpper', 'spinSeconds', 'backSide', 'mapping', 'fit', 'pictureFill',
  'pictureZoom', 'pictureX', 'pictureY', 'pictureEdges', 'imageRotationDeg', 'globalBrightness',
  'waterFill', 'fluid', 'waterFlip', 'waterViscosity', 'waterSeparation', 'rimFriction', 'waterGain',
  'smileyBounce', 'smileyGrip', 'smileyGain',
  'dryerRibbons', 'dryerDrumTurn', 'dryerGrip', 'dryerGain', 'dryerShuffle',
  'frameAdvance', 'playbackRate', 'revsPerFrame',
] as const satisfies readonly (keyof Params)[];
export type PresetKey = (typeof PRESET_KEYS)[number];

export const DEVICE_KEYS = [
  'setupName',
  'wheelPreset', 'bsdMm', 'tireMm', 'rimDepthMm', 'spokes',
  'stripCount', 'ledDensity', 'ledPackage', 'dieMm', 'diffusionMm', 'stripStartMm', 'autoLength',
  'stripLengthMm', 'doubleSided', 'backData', 'radialStagger',
  'clockMHz', 'overheadUs', 'pwmHz', 'gbPwmHz', 'batteryMah', 'cells', 'cellMah', 'ledCapA', 'hubShellMm',
  'syncMode', 'columnsPerRev', 'minLinesPerSec', 'hallPollMs', 'debounceMs', 'hallPerStrip',
  'overflow', 'predictMotion', 'nextOnDark', 'brightnessLevel', 'freeRunColsPerSec', 'gamma', 'colorBits', 'radialCompensation',
  'waterGrid', 'waterHz', 'waterIters', 'accelSmoothMs', 'maxFrames', 'videoFps',
  'panelMaterial', 'panelBoreMm', 'panelTipRadiusMm', 'panelTipSlot', 'panelStripWidthMm', 'panelStripThickMm',
  'panelTieWidthMm', 'panelTieClearMm', 'panelStripMinMm', 'panelHolesEvery', 'panelEdgeMm', 'panelCornerMm',
  'panelBladeWidthMm', 'panelDiscCross', 'panelTieSpanMm', 'panelTipTieMm', 'panelTabMaxMm', 'spokeCrosses', 'hubFlangePcdMm', 'hubFlangeOffsetMm',
  'hubOldMm', 'forkCrownRadiusMm', 'forkCrownHalfMm',
] as const satisfies readonly (keyof Params)[];
export type DeviceKey = (typeof DEVICE_KEYS)[number];

/** Short names for the pattern menu; the values stay the internal pattern names. */
export const PATTERN_LABELS: Record<PatternName, string> = {
  'Water (fluid sim)': 'Water', 'Smiley': 'Smiley', 'Polar test grid': 'Test grid', 'Clock face': 'Clock face',
  'Color wheel': 'Color wheel', 'Rainbow spiral': 'Rainbow spiral', 'Checkerboard': 'Checkerboard',
  'Text': 'Text', 'Wide text': 'Wide text', 'Bouncing ball (animated)': 'Bouncing ball',
  'Beating heart (animated)': 'Beating heart', 'Counter (animated)': 'Counter', 'Bouncing smiley': 'Bouncing smiley',
  'Tumble dryer': 'Tumble dryer',
};

// Allowed values for the string settings that pick from a list.
const CHOICES: Partial<Record<keyof Params, readonly string[]>> = {
  pattern: PATTERNS, bannerLower: BANNER_LOWER, bannerUpper: ['road', 'bike'], fluid: Object.keys(FLUIDS), displayMode: ['wheel', 'banner'], mapping: ['polar', 'columns'],
  fit: ['disc', 'annulus'], pictureFill: ['crop', 'whole'], pictureEdges: ['dark', 'mirror'], backSide: ['reads', 'mirror'], frameAdvance: ['timed', 'revolution'], wheelPreset: Object.keys(WHEELS),
  ledPackage: Object.keys(PACKAGES), backData: ['same', 'independent'], syncMode: ['hall', 'ideal', 'free'],
  overflow: ['wrap', 'blank'],
  panelMaterial: Object.keys(MATERIALS), panelTipSlot: ['auto', 'none'],
};

// Limits for the number settings that have them: a value from storage or a setup file is brought inside.
const LIMITS: Partial<Record<keyof Params, [number, number]>> = { stripCount: [1, 4], cells: [1, 4], brightnessLevel: [0, 3] };

export function pick<K extends keyof Params>(p: Params, keys: readonly K[]): Pick<Params, K> {
  const out = {} as Pick<Params, K>;
  for (const k of keys) out[k] = p[k];
  return out;
}

/**
 * Keep only the listed keys whose values have the right type (and, for menus, a known choice).
 * Used on anything read back from storage or a setup file.
 */
export function sanitize<K extends keyof Params>(raw: unknown, keys: readonly K[]): Partial<Pick<Params, K>> {
  const out: Partial<Pick<Params, K>> = {};
  if (!raw || typeof raw !== 'object') return out;
  const d = defaultParams();
  for (const k of keys) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v !== typeof d[k]) continue;
    if (typeof v === 'number' && !Number.isFinite(v)) continue;
    if (typeof v === 'string' && CHOICES[k] && !CHOICES[k]!.includes(v)) continue;
    const lim = LIMITS[k];
    out[k] = (lim && typeof v === 'number' ? Math.min(lim[1], Math.max(lim[0], v)) : v) as Params[K];
  }
  return out;
}

/** Frames per second the firmware aims for in timed playback. */
export function playbackFps(p: Params): number {
  return p.animFps * p.playbackRate;
}

export function speedMps(p: Params): number {
  return p.speedUnit === 'mph' ? p.speed * MPH : p.speed / 3.6;
}

/**
 * The look settings that place an uploaded image or video. A preset that switches from a pattern
 * to a picture starts them afresh, so a picture always begins the same way, whatever the preset
 * showed before: cropped to fill the wheel and turning with it.
 */
export const PICTURE_KEYS = ['displayMode', 'tileGapM', 'bannerUpper', 'spinSeconds', 'backSide', 'mapping', 'fit', 'pictureFill',
  'pictureZoom', 'pictureX', 'pictureY', 'pictureEdges', 'imageRotationDeg',
  'frameAdvance', 'playbackRate', 'revsPerFrame'] as const satisfies readonly PresetKey[];

/** Show the preset's image or video instead of its pattern, with the picture settings at their defaults. */
export function showPicture(p: Params) {
  if (!p.useMedia) Object.assign(p, pick(defaultParams(), PICTURE_KEYS));
  p.useMedia = true;
}

/** What fills a banner's lower half. An image or video always fills the full height, unchanged. */
export function bannerLowerOf(p: Params): BannerLower {
  return p.useMedia ? 'picture' : p.bannerLower;
}

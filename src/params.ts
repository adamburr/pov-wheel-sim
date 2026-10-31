// Single source of truth for every tunable value. The UI writes here, the sim and renderer read.
// Preset tables only seed these values; every seeded value stays editable afterwards.
import { MATERIALS } from './panels/materials';

/** A wheel size with typical values for the rest of the wheel: a tire, a spoke count and its lacing. */
export interface WheelPreset { bsdMm: number; tireMm: number; spokes: number; crosses: number }
export const WHEELS: Record<string, WheelPreset> = {
  '700c (622)':        { bsdMm: 622, tireMm: 28, spokes: 32, crosses: 3 },
  '29" MTB (622)':     { bsdMm: 622, tireMm: 57, spokes: 32, crosses: 3 },
  '27.5" / 650b (584)': { bsdMm: 584, tireMm: 55, spokes: 32, crosses: 3 },
  '26" (559)':         { bsdMm: 559, tireMm: 50, spokes: 32, crosses: 3 },
  '24" (507)':         { bsdMm: 507, tireMm: 45, spokes: 32, crosses: 3 },
  '20" (406)':         { bsdMm: 406, tireMm: 50, spokes: 28, crosses: 3 },
  '16" (305)':         { bsdMm: 305, tireMm: 47, spokes: 28, crosses: 2 },
  '12" (203)':         { bsdMm: 203, tireMm: 50, spokes: 16, crosses: 1 },
};

/** Front hubs, with typical values: measure yours. 'Custom' is whatever was typed in. */
export interface HubPreset { oldMm: number; pcdMm: number; c2fMm: number }
export const HUBS: Record<string, HubPreset> = {
  'Front, 100 mm': { oldMm: 100, pcdMm: 44, c2fMm: 35 },
  'Boost front, 110 mm': { oldMm: 110, pcdMm: 58, c2fMm: 40 },
};
export const CUSTOM_HUB = 'Custom';

/** The most crosses a wheel with this many spokes can lace: past N/8 a spoke would leave its flange beyond the tangent. */
export const maxCrosses = (spokes: number) => Math.floor(spokes / 8);

export interface ChipPreset {
  name: string;
  cpuMHz: number;
  maxLanes: number;      // parallel data lines on a shared clock (PIO)
  ramKB: number;
  psramKB: number;       // QSPI PSRAM on the board, for animation frames that don't fit in RAM
  psramMBps: number;     // sustained PSRAM reads with the code also running from flash on the same bus (rough)
  overheadUs: number;    // per-column firmware overhead, compiled C
  mflops: number;        // sustained single-precision MFLOP/s on one core (rough)
}
// The one electronics platform: an Adafruit Feather RP2350 (with PSRAM) driving Adafruit DotStar
// strips. PIO on GPIO0–7 (header pins) sends every strip its own data on a shared clock per
// side (see src/electronics). Figures are approximate; mflops assumes ~0.4 flop/cycle on the M33's FPU,
// psramMBps about half the QSPI bus's peak at 75 MHz.
export const CHIP: ChipPreset = {
  name: 'RP2350', cpuMHz: 150, maxLanes: 8, ramKB: 520, psramKB: 8192, psramMBps: 20, overheadUs: 3, mflops: 60,
};

export interface LedPreset {
  name: string;
  perM: number;         // LEDs per metre of strip
  dieMm: number;        // emitter footprint
  pwmHz: number;
}
// The one strip: Adafruit DotStar 144/m (product 2328), SK9822 LEDs in 5050 packages. Their 5-bit
// global brightness sets the current, so it adds no slower PWM. The PWM rate disagrees between
// datasheets; treat it as an editable starting point.
export const LED: LedPreset = { name: 'DotStar (SK9822)', perM: 144, dieMm: 5.0, pwmHz: 4700 };

export type SyncMode = 'hall' | 'ideal';

/**
 * Adafruit's CircuitPython POV firmware (its bike-wheel guide), for comparison: what it does
 * differently from the standard build's own firmware. The simulator's Compare switch sets these;
 * they're never saved. The 4 ms hall poll is an assumed loop time.
 */
export const ADAFRUIT_FIRMWARE = {
  mapping: 'columns',       // the picture's columns are angles, not a polar picture
  minLinesPerSec: 400,      // a floor on the column rate: below it the image squeezes and repeats
  backData: 'same',         // each back strip wired in parallel with its front strip: a mirror image
  clockMHz: 4,
  hallPollMs: 4,            // the magnet polled in the main loop, not on an interrupt
  predictMotion: false,
} as const;
const FIRMWARE_KEYS = Object.keys(ADAFRUIT_FIRMWARE) as (keyof typeof ADAFRUIT_FIRMWARE)[];

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
    spokeCrosses: wheel.crosses, // lacing
    hubPreset: 'Front, 100 mm', // not saved: whichever type the hub's values match (normalizeDevice)
    hubOldMm: 100,            // over-locknut width
    hubFlangePcdMm: 44,       // flange spoke-hole circle (typical; must be larger than the bore)
    hubFlangeOffsetMm: 35,    // hub centre to each flange (typical)
    hubShellMm: 30,           // hub shell diameter between the flanges (typical; measure)
    panelBoreMm: 38.1,        // the hub body at the panels, outboard of the flange (measured 1.5"): the panels' bore is never smaller
    forkCrownRadiusMm: 340,   // where the fork legs meet the crown, from the axle (typical)
    forkCrownHalfMm: 22,      // half the inside width at the crown (typical)

    // Strips & LEDs: the standard strip on both sides of the wheel, each strip on its own data lane
    stripCount: 3,            // strips per side
    diffusionMm: 1.5,         // silicone sleeve / diffuser spread
    panelTipRadiusMm: 298.45, // radius of the blade tips, where the strips end (measured 11.75"); 0 = automatic, just inside the nipples
    panelStripMinMm: 30,      // the strips, laid from the tips in, stop at least this far from the axle (the fork is close by the hub)

    // Panels: the flat-cut LED supports, tied to the spokes (see src/panels). The wheel, the strips
    // and where the LEDs sit come from the settings above.
    panelMaterial: 'pp_08',   // polypropylene sheet, 0.8 mm
    panelTipSlot: 'auto' as 'auto' | 'none', // a nipple under a tip: slot the tip round it, or stop the blades short of the nipples
    panelTieWidthMm: 3.6,     // zip tie strap; holes are square, tie width + clearance
    panelTieClearMm: 1,
    panelHolesEvery: 2,       // strip ties every N pixels
    panelEdgeMm: 4,           // minimum material from a hole to the edge, and between ties
    panelCornerMm: 2,         // radius on every outline corner
    panelBladeWidthMm: 0,     // blade width; 0 = the narrowest that holds the strip ties
    panelDiscCross: 0,        // the disc reaches this spoke cross (1 = nearest the hub; 0 = the outermost, interlaced one) and is tied at each crossing there
    panelTieSpanMm: 80,       // longest stretch of blade between spoke ties
    panelTipTieMm: 30,        // a spoke tie within this of each tip
    panelTabMaxMm: 0,         // farthest a tab reaches beyond the blade's edge to a spoke; 0 = the gap between one side's spokes

    // Ride
    speedUnit: 'mph' as 'mph' | 'km/h',
    speed: 10,
    pedalSurgePct: 60,        // each pedal stroke pulses the rider's push by ±this much
    cadenceRpm: 80,           // two surges per crank revolution
    speedRampG: 0.3,          // how quickly speed changes reach the target (0 = instantly)
    brakeG: 0.5,
    braking: false,           // set by the Brake button; braking uses brakeG
    resumeSpeed: 10,
    cityMode: true,           // Auto: stop-and-go riding, and the wheel's next preset each time the lights go out
    citySpeed: 12,            // cruise speed between lights (same units as speed)

    // Electronics
    pwmHz: LED.pwmHz,
    globalBrightness: 31,     // 0..31
    cells: 2,                 // 18650 cells in parallel (1S)
    cellMah: 3000,
    ledCapA: 3.5,             // firmware limit on the strips' total current (the boost gives about 4 A)

    // Firmware: a hall sensor per strip, each on an interrupt
    syncMode: 'hall' as SyncMode,
    columnsPerRev: 256,
    debounceMs: 20,
    brightnessLevel: 0,       // the wheel's brightness button: a step of BRIGHTNESS_STEPS, kept when switched off
    switchedOff: false,       // its double click switches the wheel off, and on again (not saved)
    // Set only by the simulator's Compare switch (ADAFRUIT_FIRMWARE); the standard build's values here
    compareAdafruit: false,
    mapping: 'polar' as 'polar' | 'columns',
    minLinesPerSec: 0,
    backData: 'independent' as 'same' | 'independent', // own data: each side has its own strips and data
    clockMHz: 12,             // LED clock: 12 MHz is comfortable through the level shifters, wiring and the connector
    hallPollMs: 0,            // 0: an interrupt on each sensor's pin
    predictMotion: true,      // banner mode: compute each update for mid-display time, not send time

    // Image
    useMedia: false,          // show the preset's uploaded image/clip instead of the pattern
    displayMode: 'wheel' as 'wheel' | 'banner', // banner: image pinned to the world, tiled along the road
    tileGapM: 0,
    bannerLower: 'arches' as BannerLower, // banner: the lower half is a picture or a pattern drawn around the voids
    bannerUpper: 'road' as 'road' | 'bike', // banner: the picture is pinned to the road or rides with the bike
    spinSeconds: 0,           // wheel-locked: the firmware turns the picture once every this many seconds (0 = still; positive turns it against the wheel, negative with it)
    backSide: 'reads' as 'reads' | 'mirror', // the back strips: redraw the picture to read right, or show the drive side's pixels (a mirror image)
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
    fit: 'disc' as 'disc' | 'annulus',
    pictureFill: 'crop' as 'crop' | 'whole', // a non-square picture: crop it to fill the wheel, or letterbox the whole of it
    pictureZoom: 1,           // scales a picture about the wheel's centre (1 = as filled)
    pictureX: 0,              // moves it right, as a share of the wheel's width (negative = left)
    pictureY: 0,              // moves it up, as a share of the wheel's height (negative = down)
    pictureEdges: 'mirror' as 'dark' | 'mirror', // where a picture doesn't reach: dark, or a blurred mirror tiling of it
    imageRotationDeg: 0,
    gamma: 2.2,
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
  'pattern', 'useMedia', 'text', 'displayMode', 'tileGapM', 'bannerLower', 'bannerUpper', 'spinSeconds', 'backSide', 'fit', 'pictureFill',
  'pictureZoom', 'pictureX', 'pictureY', 'pictureEdges', 'imageRotationDeg', 'globalBrightness',
  'waterFill', 'fluid', 'waterFlip', 'waterViscosity', 'waterSeparation', 'rimFriction', 'waterGain',
  'smileyBounce', 'smileyGrip', 'smileyGain',
  'dryerRibbons', 'dryerDrumTurn', 'dryerGrip', 'dryerGain', 'dryerShuffle',
  'frameAdvance', 'playbackRate', 'revsPerFrame',
] as const satisfies readonly (keyof Params)[];
export type PresetKey = (typeof PRESET_KEYS)[number];

export const DEVICE_KEYS = [
  'setupName',
  'wheelPreset', 'bsdMm', 'tireMm', 'rimDepthMm', 'spokes', 'spokeCrosses',
  'hubOldMm', 'hubFlangePcdMm', 'hubFlangeOffsetMm', 'hubShellMm', 'panelBoreMm', 'forkCrownRadiusMm', 'forkCrownHalfMm',
  'stripCount', 'diffusionMm', 'panelTipRadiusMm', 'panelStripMinMm', 'gamma', 'radialCompensation',
  'pwmHz', 'cells', 'cellMah', 'ledCapA',
  'syncMode', 'columnsPerRev', 'debounceMs', 'brightnessLevel',
  'waterGrid', 'waterHz', 'waterIters', 'accelSmoothMs', 'maxFrames', 'videoFps',
  'panelMaterial', 'panelTipSlot', 'panelTieWidthMm', 'panelTieClearMm', 'panelHolesEvery', 'panelEdgeMm', 'panelCornerMm',
  'panelBladeWidthMm', 'panelDiscCross', 'panelTieSpanMm', 'panelTipTieMm', 'panelTabMaxMm',
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
  pattern: PATTERNS, bannerLower: BANNER_LOWER, bannerUpper: ['road', 'bike'], fluid: Object.keys(FLUIDS), displayMode: ['wheel', 'banner'],
  fit: ['disc', 'annulus'], pictureFill: ['crop', 'whole'], pictureEdges: ['dark', 'mirror'], backSide: ['reads', 'mirror'], frameAdvance: ['timed', 'revolution'],
  wheelPreset: Object.keys(WHEELS), hubPreset: [...Object.keys(HUBS), CUSTOM_HUB], syncMode: ['hall', 'ideal'],
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

/**
 * Pick a wheel size: its rim, tire, spokes and lacing, a fork crown just over the tire, and the
 * blade tips back to just inside the new rim (a measured tip radius belongs to the old wheel).
 */
export function applyWheelSize(p: Params, key: string) {
  const w = WHEELS[key];
  if (!w) return;
  Object.assign(p, { wheelPreset: key, bsdMm: w.bsdMm, tireMm: w.tireMm, spokes: w.spokes, spokeCrosses: w.crosses });
  p.forkCrownRadiusMm = Math.round(w.bsdMm / 2 + w.tireMm + 1); // 340 mm on a 700 × 28c
  p.panelTipRadiusMm = 0;
}

/** Pick a hub type: its typical width and flanges. */
export function applyHub(p: Params, key: string) {
  const h = HUBS[key];
  if (!h) return;
  Object.assign(p, { hubPreset: key, hubOldMm: h.oldMm, hubFlangePcdMm: h.pcdMm, hubFlangeOffsetMm: h.c2fMm });
}

/** The hub type the hub's values match, or Custom once one is typed in. */
export function hubPresetOf(p: Params): string {
  return Object.keys(HUBS).find((k) => {
    const h = HUBS[k];
    return h.oldMm === p.hubOldMm && h.pcdMm === p.hubFlangePcdMm && h.c2fMm === p.hubFlangeOffsetMm;
  }) ?? CUSTOM_HUB;
}

/**
 * Make the hardware settings agree with each other, after an edit or a load (storage, a setup
 * file): the hub type its values match, and no more crosses than the spokes can lace.
 */
export function normalizeDevice(p: Params) {
  p.hubPreset = hubPresetOf(p);
  p.spokeCrosses = Math.min(p.spokeCrosses, maxCrosses(p.spokes));
}

/** Turn the comparison with Adafruit's CircuitPython firmware on or off (p.compareAdafruit). */
export function applyFirmware(p: Params) {
  Object.assign(p, p.compareAdafruit ? ADAFRUIT_FIRMWARE : pick(defaultParams(), FIRMWARE_KEYS));
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
export const PICTURE_KEYS = ['displayMode', 'tileGapM', 'bannerUpper', 'spinSeconds', 'backSide', 'fit', 'pictureFill',
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

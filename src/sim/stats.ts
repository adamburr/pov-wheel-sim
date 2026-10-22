import { CHIPS, LEDS, type Params, playbackFps, SHUTTERS } from '../params';
import type { Derived } from './timing';

export interface StatLine { label: string; value: string }
export interface Stats { lines: StatLine[]; warnings: string[] }

const fmt = (x: number, digits = 1) => (Number.isFinite(x) ? x.toFixed(digits) : '—');
const fmtTime = (s: number) => (s >= 1e-3 ? `${fmt(s * 1e3, 2)} ms` : `${fmt(s * 1e6, 0)} µs`);

export function exposureSeconds(p: Params): number {
  return p.exposureModel === 'eye' ? (p.eyeTauMs / 1000) * 5 : SHUTTERS[p.shutter];
}

export interface BannerInfo { width: number; height: number; tileM: number }

/** meanDuty: average PWM duty over all LEDs and columns of the current image (0..1 per channel sum / 3). */
export interface WaterInfo {
  grid: number;
  particles: number;
  flopsPerStep: number;
  ramBytes: number;     // lookup table + simulation state the firmware keeps
  aEstimate: number;    // firmware's filtered acceleration estimate (m/s²)
  wallSpeed: number;    // rim speed the firmware drags the water with (m/s)
  aTrue: number;
}

/** Another physics look the firmware runs (the tumble dryer): what it costs. */
export interface PhysicsInfo { label: string; detail: string; flopsPerStep: number; ramBytes: number }

export function computeStats(p: Params, d: Derived, meanDuty: number, banner?: BannerInfo, frames = 1, water?: WaterInfo,
  physics?: PhysicsInfo): Stats {
  const chip = CHIPS[p.chip];
  const led = LEDS[p.ledType];
  const C = p.columnsPerRev;
  const rps = d.revPerSec;
  const warnings: string[] = [];

  const required = C * rps;
  const achievedCols = rps > 0 ? Math.min(C, d.maxColumnRate / rps) : C;
  const arcAtRim = (2 * Math.PI * d.rEnd) / C;
  const refreshHz = rps * p.stripCount;
  const T = p.exposureModel === 'eye' ? p.eyeTauMs / 1000 : SHUTTERS[p.shutter];
  const coverage = Math.min(1, rps * T * p.stripCount);

  const totalLeds = d.ledsPerStrip * p.stripCount * (p.doubleSided ? 2 : 1);
  const gbScale = led.gbMode === 'none' ? 1 : p.globalBrightness / 31;
  const avgmA = totalLeds * (1 + 60 * meanDuty * gbScale);
  const peakmA = totalLeds * 61;
  const lanes = Math.max(1, Math.min(p.lanes, d.stripUnits));
  const frameBytes = banner ? banner.width * banner.height * 3 : C * lanes * (d.ledsPerLane + 2) * 4;
  // Water mode renders each column on the fly from the simulation, so it stores no frames.
  const imageBytes = water ? water.ramBytes : physics ? physics.ramBytes : frameBytes * frames;
  const targetFps = playbackFps(p);
  const playFps = p.frameAdvance === 'timed' ? targetFps : (rps * p.playbackRate) / Math.max(1, p.revsPerFrame);
  const usableRam = chip.ramKB * 1024 * (p.python ? 0.45 : 0.8);

  const lines: StatLine[] = [
    { label: 'Wheel', value: `${fmt(rps * 60, 0)} rpm · ${fmt(rps, 2)} rev/s` },
    { label: 'LEDs', value: `${d.ledsPerStrip}/strip · ${totalLeds} total · pitch ${fmt(d.pitch * 1000, 2)} mm` },
    { label: 'Column send', value: `${fmtTime(d.transferS)} + ${fmt(p.overheadUs, 0)} µs overhead` },
    { label: 'Column rate', value: `need ${fmt(required, 0)}/s · max ${fmt(d.maxColumnRate, 0)}/s` },
    { label: 'Columns/rev', value: `${fmt(achievedCols, 0)} of ${C} target` },
    { label: 'Pixel at rim', value: `${fmt(arcAtRim * 1000, 1)} mm arc × ${fmt(d.pitch * 1000, 1)} mm radial` },
    { label: 'Point refresh', value: `${fmt(refreshHz, 1)} Hz (${p.stripCount} strips)` },
    { label: 'Exposure sweep', value: `${fmt(coverage * 100, 0)}% of the disc per ${p.exposureModel === 'eye' ? 'τ' : 'shot'}` },
    ...(banner ? [{ label: 'Banner', value: `${banner.width}×${banner.height} px · repeats every ${fmt(banner.tileM, 2)} m` }] : []),
    ...(frames > 1 ? [{
      label: 'Animation',
      value: `${frames} frames · ${fmt(playFps, 1)} fps ${p.frameAdvance === 'timed' ? 'timed' : `(every ${p.revsPerFrame} rev)`}`,
    }] : []),
    ...(water ? [
      { label: 'Water', value: `${p.fluid} · ${water.grid}² grid · ${water.particles} particles · ${p.waterHz} Hz` },
      { label: 'Rim drag', value: `${fmt(water.wallSpeed, 1)} m/s rim · friction ${fmt(p.rimFriction, 2)}` },
      { label: 'Water CPU', value: `${fmt(physicsMflops(p, water.flopsPerStep), 1)} MFLOP/s ≈ ${fmt(corePct(p, water.flopsPerStep), 0)}% of one ${p.chip} core` },
      { label: 'Acceleration', value: `${gees(water.aEstimate)} firmware${p.waterGain !== 1 ? ` (×${p.waterGain} slosh)` : ''} · ${gees(water.aTrue)} true (− = braking)` },
    ] : []),
    ...(physics ? [
      { label: physics.label, value: `${physics.detail} · ${p.waterHz} Hz` },
      { label: `${physics.label} CPU`, value: `${fmt(physicsMflops(p, physics.flopsPerStep), 2)} MFLOP/s ≈ ${fmt(corePct(p, physics.flopsPerStep), 1)}% of one ${p.chip} core` },
    ] : []),
    { label: water || physics ? 'Firmware RAM' : 'Image buffer', value: `${fmt(imageBytes / 1024, 1)} KB of ${chip.ramKB} KB RAM` },
    { label: 'Current', value: `${fmt(avgmA, 0)} mA avg · ${fmt(peakmA / 1000, 1)} A peak` },
    { label: 'Battery', value: `${fmt(p.batteryMah / Math.max(avgmA, 1), 1)} h on ${p.batteryMah} mAh` },
  ];

  if (rps > 0 && required > d.maxColumnRate) {
    warnings.push(`Chip/LED bus can't keep up: only ${fmt(achievedCols, 0)} columns fit per revolution, so the image stretches past 360° and is cut off.`);
  }
  if (!banner && p.syncMode === 'hall' && p.minLinesPerSec > 0 && rps > 0 && required < p.minLinesPerSec) {
    const deg = (C / p.minLinesPerSec) * rps * 360;
    warnings.push(`Below the ${p.minLinesPerSec} lines/s floor: the image squeezes into ${fmt(deg, 0)}° and repeats (Adafruit: "incomplete or broken up").`);
  }
  if (p.syncMode === 'hall' && p.debounceMs > 0 && rps > 1000 / p.debounceMs) {
    warnings.push(`Faster than the ${p.debounceMs} ms hall debounce allows (${fmt(60000 / p.debounceMs, 0)} rpm): every other pass is dropped.`);
  }
  if (p.syncMode === 'hall' && rps > 0 && rps < 1 / 1.5) {
    warnings.push('Too slow to arm: the firmware needs two magnet passes within 1.5 s.');
  }
  if (refreshHz > 0 && refreshHz < 50) {
    warnings.push(`Each point refreshes at ${fmt(refreshHz, 1)} Hz, so the image will flicker to the eye (fusion ≈ 50–60 Hz). Add strips or ride faster.`);
  }
  if (banner && rps > 0) {
    const v = rps * d.circumference;
    const revealed = v * T + 2 * d.rEnd;
    if (p.syncMode === 'free') warnings.push('Banner mode needs a position estimate, so free-running firmware falls back to hall-sensor timing.');
    if (p.exposureModel === 'eye') {
      warnings.push(`A bystander only sees about the last ${fmt(revealed, 2)} m painted (eye persistence). The whole banner appears in a long-exposure photo.`);
    } else if (revealed < banner.tileM) {
      warnings.push(`This exposure reveals ${fmt(revealed, 2)} m of the ${fmt(banner.tileM, 2)} m banner. Try ≥ ${fmt((banner.tileM - 2 * d.rEnd) / v, 2)} s.`);
    }
  } else if (p.exposureModel === 'camera' && coverage < 1 && rps > 0) {
    warnings.push(`At this shutter each strip sweeps only ${fmt(rps * T * 360, 0)}°, so the photo shows wedges. Try ≥ ${fmt(1 / (rps * p.stripCount), 2)} s.`);
  }
  if (imageBytes > usableRam) {
    const fit = Math.floor(usableRam / frameBytes);
    warnings.push(frames > 1
      ? `${frames} frames need ${fmt(imageBytes / 1024, 0)} KB, but only ${fit} fit in ${p.chip} RAM${p.python ? ' under CircuitPython' : ''}. Stream frames from flash/PSRAM, use fewer frames, or lower columns/rev.`
      : `The prepacked image (${fmt(imageBytes / 1024, 1)} KB) won't fit in ${p.chip} RAM${p.python ? ' under CircuitPython' : ''}.`);
  }
  if (water) {
    const pct = corePct(p, water.flopsPerStep);
    if (p.python) warnings.push('A fluid simulation needs compiled C/C++: CircuitPython is roughly 100× too slow for it.');
    else if (pct > 60) warnings.push(`The water simulation needs about ${fmt(pct, 0)}% of one ${p.chip} core. Lower the grid, sim rate or pressure iterations.`);
    if (p.syncMode === 'free') warnings.push('Free-running firmware has no speed sensor, so the water can\'t react to braking.');
    if (p.displayMode === 'banner') warnings.push('Water always uses the wheel-locked display.');
  }
  if (physics && p.python) warnings.push(`CircuitPython runs the ${physics.label.toLowerCase()} roughly 100× slower: about ${fmt(corePct(p, physics.flopsPerStep), 0)}% of one core.`);
  if (frames > 1 && rps > 0) {
    if (p.frameAdvance === 'timed' && targetFps > rps) {
      warnings.push(`Frames change ${fmt(targetFps / rps, 1)}× per revolution, so each strip paints different frames in different sectors (seams). Sync frames to revolutions to avoid it.`);
    } else if (p.frameAdvance === 'revolution' && playFps < targetFps * 0.8) {
      warnings.push(`Synced to the wheel, the animation plays at ${fmt(playFps, 1)} fps instead of ${fmt(targetFps, 1)} fps. It speeds up and slows down with the bike.`);
    }
  }
  if (p.python && chip.overheadUsPy === 0) warnings.push(`CircuitPython doesn't run on ${p.chip}.`);
  if (led.gbMode === 'pwm' && p.globalBrightness < 31) {
    warnings.push(`APA102 global brightness < 31 adds a slow ~${p.gbPwmHz} Hz PWM, which shows as dashed arcs. Dim through the color values instead, or use SK9822/HD107S.`);
  }
  if (led.protocol === 'single-wire' && p.pwmHz < 2000) {
    warnings.push(`${p.ledType} PWM ≈ ${p.pwmHz} Hz breaks each arc into dashes at POV speeds.`);
  }
  if (p.doubleSided && p.backData === 'same') {
    warnings.push('Back strips share the front data, so the image is mirrored on the non-drive side.');
  }
  if (d.ledsPerStrip < 8) warnings.push('Very few LEDs per strip. Check the strip start radius and the wheel size.');
  return { lines, warnings };
}

/** Signed acceleration in g, without a "-0.00" at rest. */
function gees(a: number): string {
  const g = a / 9.81;
  return `${Math.abs(g) < 0.005 ? '0.00' : (g > 0 ? '+' : '−') + Math.abs(g).toFixed(2)} g`;
}

function physicsMflops(p: Params, flopsPerStep: number): number {
  return (flopsPerStep * p.waterHz) / 1e6;
}

/** Share of one core the simulation needs (CircuitPython runs it ~100× slower). */
function corePct(p: Params, flopsPerStep: number): number {
  const mflops = CHIPS[p.chip].mflops / (p.python ? 100 : 1);
  return (100 * physicsMflops(p, flopsPerStep)) / Math.max(mflops, 1e-6);
}

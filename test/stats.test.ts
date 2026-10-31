import { describe, expect, it } from 'vitest';
import { defaultParams, type Params } from '../src/params';
import { derive } from '../src/sim/timing';
import { computeStats, exposureSeconds } from '../src/sim/stats';

const stats = (over: Partial<Params> = {}, meanDuty = 0, ...rest: Parameters<typeof computeStats> extends [any, any, any, ...infer R] ? R : never) => {
  const p = { ...defaultParams(), stripCount: 4, ...over }; // the figures below are for four strips a side
  return computeStats(p, derive(p), meanDuty, ...rest);
};
const value = (s: ReturnType<typeof computeStats>, label: string) => s.lines.find((l) => l.label === label)?.value;
const warned = (s: ReturnType<typeof computeStats>, text: string) => s.warnings.some((w) => w.includes(text));

describe('build stats', () => {
  it('times a camera by its shutter and the eye by five persistence time constants', () => {
    expect(exposureSeconds({ ...defaultParams(), exposureModel: 'camera', shutter: '1/8 s' })).toBe(1 / 8);
    expect(exposureSeconds({ ...defaultParams(), exposureModel: 'eye', eyeTauMs: 60 })).toBeCloseTo(0.3, 9);
  });

  it('reports the wheel speed, and has nothing to warn about at the defaults', () => {
    const p = { ...defaultParams(), stripCount: 4 }, d = derive(p);
    const s = stats();
    expect(value(s, 'Wheel')).toBe(`${(d.revPerSec * 60).toFixed(0)} rpm · ${d.revPerSec.toFixed(2)} rev/s`);
    expect(s.warnings).toEqual([]);
  });

  it('draws 1 mA an LED when dark and 61 mA at full white, and runs the battery down to match', () => {
    const p = { ...defaultParams(), stripCount: 4 }, d = derive(p);
    const leds = d.ledsPerStrip * p.stripCount * 2;
    expect(value(stats({}, 0), 'Current')).toBe(`${leds} mA avg · ${(leds * 61 / 1000).toFixed(1)} A peak`);
    expect(value(stats({}, 1), 'Current')).toMatch(new RegExp(`^${leds * 61} mA avg`));
    expect(value(stats({ cells: 2, cellMah: 3000 }, 0), 'Battery')).toBe(`${(6000 / leds).toFixed(1)} h on 6000 mAh`); // cells × capacity
  });

  it('scales the current with the brightness button', () => {
    const p = { ...defaultParams(), stripCount: 4 }, d = derive(p);
    const leds = d.ledsPerStrip * p.stripCount * 2;
    expect(value(stats({ brightnessLevel: 1 }, 1), 'Current')).toMatch(new RegExp(`^${leds * 31} mA avg`));
  });

  it('warns when the LED bus can\'t send the columns fast enough', () => {
    const s = stats({ columnsPerRev: 4000, speed: 30 });
    expect(warned(s, 'can\'t keep up')).toBe(true);
  });

  it('warns below the lines/s floor, only with the hall sensor and only on the wheel', () => {
    expect(warned(stats({ minLinesPerSec: 400, columnsPerRev: 64, speed: 5 }), 'lines/s floor')).toBe(true);
    expect(warned(stats({ minLinesPerSec: 400, columnsPerRev: 64, speed: 5, syncMode: 'ideal' }), 'lines/s floor')).toBe(false);
    expect(warned(stats({ minLinesPerSec: 0, columnsPerRev: 64, speed: 5 }), 'lines/s floor')).toBe(false);
  });

  it('says whether each point refreshes fast enough for the eye to fuse, without a warning', () => {
    const slow = stats({ stripCount: 4, speed: 10 }); // ~8 Hz, as every POV wheel at riding speeds
    expect(value(slow, 'Point refresh')).toMatch(/^8\.4 Hz \(4 strips\) · flickers to the eye/);
    expect(warned(slow, 'flicker')).toBe(false);
    expect(value(stats({ stripCount: 4, speed: 70 }), 'Point refresh')).toMatch(/steady to the eye$/); // ~59 Hz
  });

  it('warns that a short shutter shows wedges, and says how long a shutter fills the disc', () => {
    const p = { ...defaultParams(), exposureModel: 'camera' as const, shutter: '1/125 s' };
    const rps = derive(p).revPerSec;
    const s = stats(p);
    expect(warned(s, 'wedges')).toBe(true);
    expect(warned(s, `Try ≥ ${(1 / (rps * p.stripCount)).toFixed(2)} s`)).toBe(true);
    expect(warned(stats({ exposureModel: 'camera', shutter: '1 s' }), 'wedges')).toBe(false);
  });

  it('keeps a picture in RAM, and an animation too big for it in PSRAM', () => {
    expect(value(stats({}, 0, undefined, 1), 'Image buffer')).toBe('320.0 KB of 520 KB RAM');
    const two = stats({}, 0, undefined, 2);
    expect(value(two, 'Image buffer')).toBe('0.63 MB of 8 MB PSRAM · streams 0.7 MB/s');
    expect(warned(two, 'RAM')).toBe(false);
  });

  it('warns when the frames won\'t fit even in PSRAM, and says how many do', () => {
    // 320 KB a frame: 23 fit in 90% of 8 MB
    expect(warned(stats({}, 0, undefined, 23), 'frames need')).toBe(false);
    expect(warned(stats({}, 0, undefined, 24), 'but only 23 fit in the 8 MB PSRAM')).toBe(true);
  });

  it('warns when streaming the frames from PSRAM needs more than it reads', () => {
    // Wheel-locked frames stream as fast as the LED bus sends them; with more columns than it can send,
    // that's its limit: 8 lanes at 12 MHz is ~12 MB/s, at 24 MHz ~22 MB/s.
    const fast = { speed: 30, columnsPerRev: 4000 };
    expect(warned(stats({ ...fast, clockMHz: 12 }, 0, undefined, 2), 'Streaming the frames')).toBe(false);
    expect(warned(stats({ ...fast, clockMHz: 24 }, 0, undefined, 2), 'Streaming the frames')).toBe(true);
    // A banner reads a scattered pixel, a whole cache line, for every LED at each update.
    const banner = { width: 2000, height: 100, tileM: 3 }; // 600 KB a frame
    expect(warned(stats({ ...fast, displayMode: 'banner' }, 0, banner, 1), 'Streaming the frames')).toBe(true);
  });

  it('warns of sector seams when timed frames change within a revolution', () => {
    expect(warned(stats({ frameAdvance: 'timed', animFps: 30, speed: 5 }, 0, undefined, 4), 'seams')).toBe(true);
    expect(warned(stats({ frameAdvance: 'revolution', animFps: 30, speed: 5 }, 0, undefined, 4), 'seams')).toBe(false);
  });

  it('warns that back strips sharing the front data show a mirror image', () => {
    expect(warned(stats({ backData: 'same' }), 'mirrored')).toBe(true);
  });

  it('counts a physics look\'s CPU, and warns when the water needs most of a core', () => {
    const water = { grid: 32, particles: 2000, ramBytes: 50_000, aEstimate: 0, aTrue: 0, wallSpeed: 0 };
    const light = stats({}, 0, undefined, 1, { ...water, flopsPerStep: 1e5 });
    expect(value(light, 'Water CPU')).toMatch(/^3\.0 MFLOP\/s ≈ 5% of one RP2350 core$/);
    expect(warned(light, 'core')).toBe(false);
    expect(value(light, 'Firmware RAM')).toMatch(/^48\.8 KB/);
    expect(warned(stats({}, 0, undefined, 1, { ...water, flopsPerStep: 2e6 }), 'core')).toBe(true);
    const big = stats({}, 0, undefined, 1, { ...water, flopsPerStep: 1e5, ramBytes: 600_000 });
    expect(value(big, 'Firmware RAM')).toMatch(/^585\.9 KB of 520 KB RAM$/); // physics state can't go to PSRAM
    expect(warned(big, 'The water simulation needs 586 KB')).toBe(true);
  });

  it('warns that a banner a bystander sees is only the last stretch painted', () => {
    const s = stats({ displayMode: 'banner' }, 0, { width: 400, height: 100, tileM: 3 });
    expect(value(s, 'Banner')).toBe('400×100 px · repeats every 3.00 m');
    expect(warned(s, 'bystander only sees')).toBe(true);
  });
});

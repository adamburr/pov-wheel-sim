import { describe, expect, it } from 'vitest';
import { defaultParams, DEVICE_KEYS, PRESET_KEYS } from '../src/params';
import { BUILT_IN_PRESETS, type KeyValueStorage, PresetStore } from '../src/presets';
import { loadDevice, parseSetup, saveDevice, serializeSetup, setupFileName } from '../src/setupFile';

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } };
}

describe('setting groups', () => {
  it('splits preset and device keys without overlap, all real params', () => {
    const all = Object.keys(defaultParams());
    const preset = new Set<string>(PRESET_KEYS), device = new Set<string>(DEVICE_KEYS);
    for (const k of [...preset, ...device]) expect(all).toContain(k);
    for (const k of preset) expect(device.has(k)).toBe(false);
  });
});

describe('preset store', () => {
  it('seeds 5–8 built-in presets on first load, with Water first', () => {
    const s = new PresetStore(memoryStorage());
    expect(s.presets.length).toBe(BUILT_IN_PRESETS.length);
    expect(s.presets.length).toBeGreaterThanOrEqual(5);
    expect(s.presets.length).toBeLessThanOrEqual(8);
    expect(s.active.name).toBe('Water');
    expect(new Set(s.presets.map((x) => x.name)).size).toBe(s.presets.length);
  });

  it('steps through presets with one button, wrapping round', () => {
    const s = new PresetStore();
    const names = s.presets.map(() => s.next().name);
    expect(names.at(-1)).toBe('Water');
    expect(names[0]).toBe(s.presets[1].name);
  });

  it('adds a copy after the active preset, deletes, and moves', () => {
    const s = new PresetStore();
    s.select(2);
    const copy = s.add();
    expect(s.activeIndex).toBe(3);
    expect(copy.name).toBe(`${s.presets[2].name} copy`);
    expect(s.add().name).toBe(`${s.presets[2].name} copy 2`);
    s.move(4, -1);
    expect(s.active.name).toBe(`${s.presets[2].name} copy 2`); // the same preset stays active
    expect(s.activeIndex).toBe(3);
    expect(s.remove()?.name).toBe(`${s.presets[2].name} copy 2`);
    expect(s.presets.length).toBe(BUILT_IN_PRESETS.length + 1);
  });

  it('refuses to delete the last preset', () => {
    const s = new PresetStore();
    while (s.presets.length > 1) s.remove();
    expect(s.remove()).toBeUndefined();
    expect(s.presets.length).toBe(1);
  });

  it('saves and loads, and falls back to the built-ins on bad data', () => {
    const st = memoryStorage();
    const a = new PresetStore(st);
    a.select(4);
    a.rename('Mine');
    const b = new PresetStore(st);
    expect(b.activeIndex).toBe(4);
    expect(b.active.name).toBe('Mine');
    st.data.set([...st.data.keys()][0], '{not json');
    expect(new PresetStore(st).presets.map((x) => x.name)).toEqual(BUILT_IN_PRESETS.map((x) => x.name));
  });

  it('captures and applies only preset values', () => {
    const s = new PresetStore();
    const p = { ...defaultParams(), pattern: 'Smiley' as const, text: 'HI', speed: 25, chip: 'ESP32' };
    s.capture(p);
    expect(s.active.settings).not.toHaveProperty('speed');
    expect(s.active.settings).not.toHaveProperty('chip');
    const q = { ...defaultParams(), speed: 3 };
    s.apply(q);
    expect(q.pattern).toBe('Smiley');
    expect(q.text).toBe('HI');
    expect(q.speed).toBe(3);
    expect(q.chip).toBe('RP2350');
  });

  it('never turns media on for a preset without media', () => {
    const s = new PresetStore();
    s.capture({ ...defaultParams(), useMedia: true });
    expect(s.active.settings.useMedia).toBe(false);
  });
});

describe('setup file', () => {
  it('round-trips the hardware, presets and embedded media', () => {
    const s = new PresetStore();
    s.select(1);
    s.active.media = { id: 'm1', name: 'cat.gif', type: 'image/gif' };
    s.capture({ ...defaultParams(), useMedia: true });
    const p = { ...defaultParams(), chip: 'ESP32-S3', stripCount: 5, setupName: 'Test rig' };
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    const text = serializeSetup(p, s, { m1: { name: 'cat.gif', type: 'image/gif', bytes }, unused: { name: 'x', type: 'image/png', bytes } });
    const back = parseSetup(text);
    expect(back.device.chip).toBe('ESP32-S3');
    expect(back.device.stripCount).toBe(5);
    expect(back.device.setupName).toBe('Test rig');
    expect(back.device).not.toHaveProperty('speed');
    expect(back.presets.map((x) => x.name)).toEqual(s.presets.map((x) => x.name));
    expect(back.activePreset).toBe(1);
    expect(back.presets[1].settings.useMedia).toBe(true);
    expect([...back.media.m1.bytes]).toEqual([...bytes]);
    expect(back.media).not.toHaveProperty('unused');
  });

  it('rejects files that are not setups', () => {
    expect(() => parseSetup('junk')).toThrow(/JSON/);
    expect(() => parseSetup('{"format":"other"}')).toThrow(/not a POV wheel setup/);
    expect(() => parseSetup('{"format":"pov-wheel-setup","version":99}')).toThrow(/version/);
    expect(() => parseSetup('{"format":"pov-wheel-setup","version":1,"presets":[]}')).toThrow(/no presets/);
  });

  it('drops unknown keys, bad values and missing media', () => {
    const back = parseSetup(JSON.stringify({
      format: 'pov-wheel-setup', version: 1,
      device: { chip: 'Z80', stripCount: 4, speed: 99, evil: 1 },
      presets: [{ name: 'A', settings: { pattern: 'Nope', text: 7, waterFill: 0.6, view: 'ride-by', bannerLower: 'zigzag' }, media: { id: 'gone', name: 'a.png', type: 'image/png' } }],
    }));
    expect(back.device).toEqual({ stripCount: 4 });
    const a = back.presets[0];
    expect(a.settings.pattern).toBe(defaultParams().pattern);
    expect(a.settings.text).toBe(defaultParams().text);
    expect(a.settings.waterFill).toBe(0.6);
    expect(a.settings.bannerLower).toBe(defaultParams().bannerLower);
    expect(a.settings).not.toHaveProperty('view');
    expect(a.media).toBeUndefined();
  });

  it('names the file after the setup', () => {
    expect(setupFileName('My 700c wheel!')).toBe('my-700c-wheel.json');
    expect(setupFileName('')).toBe('pov-wheel-setup.json');
  });

  it('keeps the hardware build in storage', () => {
    const st = memoryStorage();
    saveDevice(st, { ...defaultParams(), stripCount: 6, speed: 30 });
    const d = loadDevice(st);
    expect(d.stripCount).toBe(6);
    expect(d).not.toHaveProperty('speed');
  });
});

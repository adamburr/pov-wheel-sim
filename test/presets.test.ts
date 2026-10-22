import { describe, expect, it } from 'vitest';
import { bannerLowerOf, defaultParams, DEVICE_KEYS, PRESET_KEYS, showPicture } from '../src/params';
import raw from '../default-setup.json';
import { readFileSync } from 'node:fs';
import { DEFAULT_MEDIA_URLS, DEFAULT_SETUP, defaultBuiltIns, defaultDevice, DEFAULTS_ID, fingerprint } from '../src/defaults';
import { type BuiltIns, type KeyValueStorage, newId, presetDefaults, PresetStore } from '../src/presets';
import { loadDevice, parseSetup, saveDevice, serializeSetup, setupFileName } from '../src/setupFile';

// The store tests use their own built-ins, so they don't depend on what default-setup.json holds.
const TEST_NAMES = ['Water', 'Smiley', 'Spiral', 'Clock', 'Heart', 'Banner', 'Ball'];
const testBuiltIns = (): BuiltIns => ({
  presets: TEST_NAMES.map((name) => ({ id: newId(), name, settings: presetDefaults() })),
  active: TEST_NAMES.length - 1,
});
const store = (st?: KeyValueStorage) => new PresetStore(st, testBuiltIns);

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
  it('seeds the built-in presets on first load and selects the chosen one', () => {
    const s = store(memoryStorage());
    expect(s.presets.map((x) => x.name)).toEqual(TEST_NAMES);
    expect(s.active.name).toBe('Ball');
  });

  it('steps through presets with one button, wrapping round', () => {
    const s = store();
    s.select(0);
    const names = s.presets.map(() => s.next().name);
    expect(names.at(-1)).toBe('Water');
    expect(names[0]).toBe(s.presets[1].name);
  });

  it('adds a copy after the active preset, deletes, and moves', () => {
    const s = store();
    s.select(2);
    const copy = s.add();
    expect(s.activeIndex).toBe(3);
    expect(copy.name).toBe(`${s.presets[2].name} copy`);
    expect(s.add().name).toBe(`${s.presets[2].name} copy 2`);
    s.move(4, -1);
    expect(s.active.name).toBe(`${s.presets[2].name} copy 2`); // the same preset stays active
    expect(s.activeIndex).toBe(3);
    expect(s.remove()?.name).toBe(`${s.presets[2].name} copy 2`);
    expect(s.presets.length).toBe(TEST_NAMES.length + 1);
  });

  it('refuses to delete the last preset', () => {
    const s = store();
    while (s.presets.length > 1) s.remove();
    expect(s.remove()).toBeUndefined();
    expect(s.presets.length).toBe(1);
  });

  it('saves and loads, and falls back to the built-ins on bad data', () => {
    const st = memoryStorage();
    const a = store(st);
    a.select(4);
    a.rename('Mine');
    const b = store(st);
    expect(b.activeIndex).toBe(4);
    expect(b.active.name).toBe('Mine');
    st.data.set([...st.data.keys()][0], '{not json');
    expect(store(st).presets.map((x) => x.name)).toEqual(TEST_NAMES);
  });

  it('captures and applies only preset values', () => {
    const s = store();
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

  it('keeps image mode on a preset with no file yet (it shows dark until one is chosen)', () => {
    const s = store();
    s.capture({ ...defaultParams(), useMedia: true });
    expect(s.active.settings.useMedia).toBe(true);
  });
});

describe('pictures', () => {
  it('start the same way whatever the preset showed before: cropped to fill the wheel, turning with it', () => {
    const p = { ...defaultParams(), pattern: 'Bouncing ball (animated)' as const, displayMode: 'banner' as const,
      bannerUpper: 'bike' as const, bannerLower: 'bridge' as const, spinSeconds: 16, fit: 'annulus' as const, pictureFill: 'whole' as const };
    showPicture(p);
    expect(p.useMedia).toBe(true);
    expect(p).toMatchObject({ displayMode: 'wheel', bannerUpper: 'road', spinSeconds: 0, fit: 'disc', pictureFill: 'crop', mapping: 'polar' });
    // Already showing a picture: its settings stay as the rider set them.
    p.displayMode = 'banner'; p.spinSeconds = 8;
    showPicture(p);
    expect(p).toMatchObject({ displayMode: 'banner', spinSeconds: 8 });
  });

  it('fill a banner\'s full height, unchanged, while patterns keep their lower-half decoration', () => {
    const p = { ...defaultParams(), bannerLower: 'bridge' as const };
    expect(bannerLowerOf(p)).toBe('bridge');
    expect(bannerLowerOf({ ...p, useMedia: true })).toBe('picture');
  });
});

describe('default setup file', () => {
  it('is a valid setup the app can start from', () => {
    expect(DEFAULT_SETUP.presets.length).toBeGreaterThan(0);
    expect(DEFAULT_SETUP.activePreset).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_SETUP.activePreset).toBeLessThan(DEFAULT_SETUP.presets.length);
    // Every hardware value in the file is valid (none dropped), and every preset's media is there:
    // embedded, or read from the file in media/ its "path" names.
    expect(Object.keys(DEFAULT_SETUP.device).sort()).toEqual(Object.keys(raw.device).sort());
    for (const pr of DEFAULT_SETUP.presets) if (pr.media) expect(DEFAULT_SETUP.media).toHaveProperty(pr.media.id);
  });

  it('has a fingerprint that changes with its contents, so browsers notice new defaults', () => {
    expect(DEFAULTS_ID).toBe(fingerprint(raw));
    expect(fingerprint(structuredClone(raw))).toBe(DEFAULTS_ID); // the same contents, the same id
    const renamed = structuredClone(raw);
    renamed.presets[0].name += ' 2';
    expect(fingerprint(renamed)).not.toBe(DEFAULTS_ID);
  });

  it('finds the media it names by path in media/', () => {
    for (const [id, m] of Object.entries<{ path?: string; type: string }>(raw.media ?? {})) {
      if (!m.path) continue;
      expect(DEFAULT_MEDIA_URLS[id], m.path).toBeDefined(); // served with the app
      if (m.type === 'image/jpeg') expect([...readFileSync(m.path).slice(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    }
    // The presets keep their media, to be fetched at startup.
    for (const pr of DEFAULT_SETUP.presets) if (pr.media) expect(DEFAULT_SETUP.media).toHaveProperty(pr.media.id);
  });

  it('seeds the presets, starting on the first, with fresh copies each time', () => {
    const s = new PresetStore(memoryStorage(), defaultBuiltIns);
    expect(s.presets.map((x) => x.name)).toEqual(DEFAULT_SETUP.presets.map((x) => x.name));
    expect(s.activeIndex).toBe(0);
    s.rename('Changed');
    expect(defaultBuiltIns().presets[s.activeIndex].name).toBe(DEFAULT_SETUP.presets[s.activeIndex].name);
  });

  it('supplies the default hardware', () => {
    expect(defaultDevice()).toMatchObject(DEFAULT_SETUP.device);
  });
});

describe('setup file', () => {
  it('round-trips the hardware, presets and embedded media', () => {
    const s = store();
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
    expect(a.settings.useMedia).toBe(false);
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

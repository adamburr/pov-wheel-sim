// Named presets: what the wheel shows. The real wheel steps through them in order with one
// button; the app adds, edits, reorders and deletes them. No DOM here, so it can be tested.
import { defaultParams, FLUIDS, type Params, pick, PRESET_KEYS, type PresetKey, sanitize } from './params';

export type PresetSettings = Partial<Pick<Params, PresetKey>>;
/** An uploaded image or clip; the bytes live in the media store under `id`. */
export interface MediaRef { id: string; name: string; type: string }
export interface Preset { id: string; name: string; settings: PresetSettings; media?: MediaRef }

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = 'pov-wheel-sim.presets.v1';

export const BUILT_IN_PRESETS: { name: string; settings: PresetSettings }[] = [
  { name: 'Water', settings: { pattern: 'Water (fluid sim)' } },
  {
    name: 'Splashy water',
    settings: {
      pattern: 'Water (fluid sim)', fluid: 'Splashy', waterFill: 0.5, waterFlip: FLUIDS.Splashy.flip,
      waterViscosity: FLUIDS.Splashy.viscosity, waterSeparation: FLUIDS.Splashy.separation,
    },
  },
  { name: 'Smiley', settings: { pattern: 'Smiley' } },
  { name: 'Rainbow spiral', settings: { pattern: 'Rainbow spiral' } },
  { name: 'Clock face', settings: { pattern: 'Clock face' } },
  { name: 'Beating heart', settings: { pattern: 'Beating heart (animated)' } },
  { name: 'HELLO banner', settings: { pattern: 'Wide text', text: 'HELLO', displayMode: 'banner', bannerLower: 'rainbow' } },
  { name: 'Flip-book ball', settings: { pattern: 'Bouncing ball (animated)', displayMode: 'banner', bannerLower: 'beads' } },
];

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/** Preset values at their defaults, so every stored preset is complete. */
export function presetDefaults(): Pick<Params, PresetKey> {
  return pick(defaultParams(), PRESET_KEYS);
}

export function builtInPresets(): Preset[] {
  return BUILT_IN_PRESETS.map((b) => ({ id: newId(), name: b.name, settings: { ...presetDefaults(), ...b.settings } }));
}

/** Validate presets read from storage or a file; undefined if there are none worth keeping. */
export function sanitizePresets(raw: unknown): Preset[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: Preset[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const name = typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 40) : `Preset ${out.length + 1}`;
    const preset: Preset = {
      id: typeof r.id === 'string' && r.id ? r.id : newId(),
      name,
      settings: { ...presetDefaults(), ...sanitize(r.settings, PRESET_KEYS) },
    };
    const m = r.media;
    if (m && typeof m.id === 'string' && typeof m.name === 'string' && typeof m.type === 'string') {
      preset.media = { id: m.id, name: m.name, type: m.type };
    }
    if (!preset.media) preset.settings.useMedia = false;
    out.push(preset);
  }
  return out.length ? out : undefined;
}

export class PresetStore {
  presets: Preset[] = [];
  activeIndex = 0;

  constructor(private storage?: KeyValueStorage) {
    this.load();
  }

  get active(): Preset {
    return this.presets[this.activeIndex];
  }

  /** Read saved presets; the built-ins on first run or if the saved data is unusable. */
  load() {
    let raw: { presets?: unknown; active?: unknown } | undefined;
    try {
      const text = this.storage?.getItem(STORAGE_KEY);
      raw = text ? JSON.parse(text) : undefined;
    } catch { raw = undefined; }
    const presets = sanitizePresets(raw?.presets);
    if (presets) this.replaceAll(presets, Number(raw?.active) || 0, false);
    else this.restoreBuiltIns();
  }

  save() {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify({ presets: this.presets, active: this.activeIndex }));
    } catch { /* storage full or blocked: keep working in memory */ }
  }

  replaceAll(presets: Preset[], active = 0, save = true) {
    this.presets = presets;
    this.activeIndex = Math.min(Math.max(0, Math.floor(active)), presets.length - 1);
    if (save) this.save();
  }

  restoreBuiltIns() {
    this.replaceAll(builtInPresets());
  }

  select(i: number) {
    this.activeIndex = Math.min(Math.max(0, i), this.presets.length - 1);
    this.save();
  }

  /** What the wheel's button does: the next preset, wrapping back to the first. */
  next(): Preset {
    this.select((this.activeIndex + 1) % this.presets.length);
    return this.active;
  }

  /** Copy the active preset, insert the copy after it and select it. */
  add(): Preset {
    const src = this.active;
    const names = new Set(this.presets.map((x) => x.name));
    const base = src.name.replace(/ copy( \d+)?$/, ''); // a copy of a copy is "X copy 2", not "X copy copy"
    let name = `${base} copy`;
    for (let n = 2; names.has(name); n++) name = `${base} copy ${n}`;
    const copy: Preset = { id: newId(), name: name.slice(0, 40), settings: { ...src.settings }, media: src.media && { ...src.media } };
    this.presets.splice(this.activeIndex + 1, 0, copy);
    this.select(this.activeIndex + 1);
    return copy;
  }

  /** Delete a preset. The last one can't be deleted. */
  remove(i = this.activeIndex): Preset | undefined {
    if (this.presets.length <= 1 || i < 0 || i >= this.presets.length) return undefined;
    const [gone] = this.presets.splice(i, 1);
    if (i < this.activeIndex || this.activeIndex >= this.presets.length) this.activeIndex--;
    this.save();
    return gone;
  }

  rename(name: string) {
    const n = name.trim().slice(0, 40);
    if (n) { this.active.name = n; this.save(); }
  }

  /** Move preset i up (-1) or down (+1); the same preset stays active. */
  move(i: number, delta: -1 | 1) {
    const j = i + delta;
    if (j < 0 || j >= this.presets.length) return;
    const active = this.active;
    [this.presets[i], this.presets[j]] = [this.presets[j], this.presets[i]];
    this.activeIndex = this.presets.indexOf(active);
    this.save();
  }

  /** Copy the preset values of p into the active preset. */
  capture(p: Params) {
    this.active.settings = pick(p, PRESET_KEYS);
    if (!this.active.media) this.active.settings.useMedia = false;
    this.save();
  }

  /** Load the active preset into p; only preset values change. */
  apply(p: Params) {
    Object.assign(p, presetDefaults(), this.active.settings);
    if (!this.active.media) p.useMedia = false;
  }

  /** Media ids still used by some preset. */
  mediaIds(): Set<string> {
    return new Set(this.presets.flatMap((x) => (x.media ? [x.media.id] : [])));
  }
}

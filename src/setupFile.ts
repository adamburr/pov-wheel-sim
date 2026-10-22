// The setup file: the hardware build plus every preset (with uploaded media embedded), saved
// as one JSON file. It is also the bundle that will later be flashed to the controller.
import { DEVICE_KEYS, type DeviceKey, type Params, pick, sanitize } from './params';
import { type KeyValueStorage, type Preset, PresetStore, sanitizePresets } from './presets';

export const SETUP_FORMAT = 'pov-wheel-setup';
export const SETUP_VERSION = 1;
const DEVICE_STORAGE_KEY = 'pov-wheel-sim.device.v1';

export type DeviceSettings = Partial<Pick<Params, DeviceKey>>;
export interface MediaBytes { name: string; type: string; bytes: Uint8Array }
export interface Setup {
  device: DeviceSettings;
  presets: Preset[];
  activePreset: number;
  media: Record<string, MediaBytes>;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** A file name from the setup name, e.g. "My 700c" → "my-700c.json". */
export function setupFileName(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${slug || 'pov-wheel-setup'}.json`;
}

export function serializeSetup(p: Params, store: PresetStore, media: Record<string, MediaBytes>): string {
  const used = store.mediaIds();
  const embedded: Record<string, { name: string; type: string; data: string }> = {};
  for (const [id, m] of Object.entries(media)) {
    if (used.has(id)) embedded[id] = { name: m.name, type: m.type, data: bytesToBase64(m.bytes) };
  }
  return JSON.stringify({
    format: SETUP_FORMAT,
    version: SETUP_VERSION,
    name: p.setupName,
    device: pick(p, DEVICE_KEYS),
    presets: store.presets,
    activePreset: store.activeIndex,
    media: embedded,
  }, null, 1);
}

/** Read a setup file. Throws with a readable message if it isn't one. */
export function parseSetup(text: string): Setup {
  let raw: any;
  try { raw = JSON.parse(text); } catch { throw new Error('This file is not valid JSON.'); }
  if (!raw || raw.format !== SETUP_FORMAT) throw new Error('This is not a POV wheel setup file.');
  if (raw.version !== SETUP_VERSION) throw new Error(`Unsupported setup file version ${raw.version}.`);
  const presets = sanitizePresets(raw.presets);
  if (!presets) throw new Error('The setup file has no presets.');
  const media: Record<string, MediaBytes> = {};
  for (const [id, m] of Object.entries<any>(raw.media && typeof raw.media === 'object' ? raw.media : {})) {
    if (!m || typeof m.data !== 'string' || typeof m.type !== 'string') continue;
    try {
      media[id] = { name: String(m.name ?? 'media'), type: m.type, bytes: base64ToBytes(m.data) };
    } catch { /* skip unreadable media; its presets fall back to their pattern */ }
  }
  for (const pr of presets) {
    if (pr.media && !media[pr.media.id]) { delete pr.media; pr.settings.useMedia = false; }
  }
  const device = { ...sanitize(raw.device, DEVICE_KEYS) };
  if (typeof raw.name === 'string' && !device.setupName) device.setupName = raw.name.slice(0, 60);
  return { device, presets, activePreset: Number(raw.activePreset) || 0, media };
}

export function saveDevice(storage: KeyValueStorage | undefined, p: Params) {
  try { storage?.setItem(DEVICE_STORAGE_KEY, JSON.stringify(pick(p, DEVICE_KEYS))); } catch { /* keep going */ }
}

export function loadDevice(storage: KeyValueStorage | undefined): DeviceSettings {
  try {
    const text = storage?.getItem(DEVICE_STORAGE_KEY);
    return text ? sanitize(JSON.parse(text), DEVICE_KEYS) : {};
  } catch { return {}; }
}

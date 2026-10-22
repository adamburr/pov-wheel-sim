// The defaults the app starts from (the hardware and the presets) come from default-setup.json
// in the repo: a setup file exactly as the app's Save writes it.
// To change them, set things up in the app, press Save, and replace that file with the download.
// Simulator settings (camera, units, the roadside strip) aren't part of a setup; their defaults
// stay in params.ts.
// A saved file embeds its images. In the repo they can live in media/ instead: a media entry with
// a "path" (such as "media/cat.jpg") in place of "data" is served with the app and fetched at startup.
import raw from '../default-setup.json';
import { defaultParams, DEVICE_KEYS, type DeviceKey, type Params, pick } from './params';
import { type BuiltIns, plainBuiltIns } from './presets';
import { parseSetup, type Setup } from './setupFile';

// Where the files in media/ are served, keyed "../media/name".
const FILES = import.meta.glob('../media/*', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** Where to fetch each media file default-setup.json names by path, by media id. */
export const DEFAULT_MEDIA_URLS: Record<string, string> = {};

/** The setup file with its media paths resolved: each such entry gets empty data, and its URL is noted. */
function withPaths(file: typeof raw): unknown {
  const media: Record<string, unknown> = {};
  for (const [id, m] of Object.entries<Record<string, unknown>>(file.media ?? {})) {
    const url = typeof m.path === 'string' && m.data === undefined ? FILES[`../${m.path}`] : undefined;
    if (url) DEFAULT_MEDIA_URLS[id] = url;
    media[id] = url ? { ...m, data: '' } : m;
  }
  return { ...file, media };
}

function load(): Setup {
  try {
    return parseSetup(JSON.stringify(withPaths(raw)));
  } catch (err) {
    // A broken file shouldn't stop the app; test/presets.test.ts catches it before it ships.
    console.error(`default-setup.json: ${(err as Error).message} Using the built-in defaults.`);
    return { device: {}, presets: [], activePreset: 0, media: {} };
  }
}

export const DEFAULT_SETUP = load();

/** The default hardware: the code's defaults with default-setup.json's values on top. */
export function defaultDevice(): Pick<Params, DeviceKey> {
  return { ...pick(defaultParams(), DEVICE_KEYS), ...DEFAULT_SETUP.device };
}

/**
 * Fresh copies of the default presets. A new setup always starts on the first preset, whichever
 * one was selected when the file was saved; reorder the presets to choose the starting look.
 */
export function defaultBuiltIns(): BuiltIns {
  if (!DEFAULT_SETUP.presets.length) return plainBuiltIns();
  return { presets: structuredClone(DEFAULT_SETUP.presets), active: 0 };
}

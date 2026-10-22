// The defaults the app starts from (the hardware, the presets and which preset is selected)
// come from default-setup.json in the repo: a setup file exactly as the app's Save writes it.
// To change them, set things up in the app, press Save, and replace that file with the download.
// Simulator settings (camera, units, the roadside strip) aren't part of a setup; their defaults
// stay in params.ts.
import raw from '../default-setup.json';
import { defaultParams, DEVICE_KEYS, type DeviceKey, type Params, pick } from './params';
import { type BuiltIns, plainBuiltIns } from './presets';
import { parseSetup, type Setup } from './setupFile';

function load(): Setup {
  try {
    return parseSetup(JSON.stringify(raw));
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

/** Fresh copies of the default presets and the one to select. */
export function defaultBuiltIns(): BuiltIns {
  if (!DEFAULT_SETUP.presets.length) return plainBuiltIns();
  return { presets: structuredClone(DEFAULT_SETUP.presets), active: DEFAULT_SETUP.activePreset };
}

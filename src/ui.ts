import GUI, { type Controller } from 'lil-gui';
import {
  CHIPS, defaultParams, DEVICE_KEYS, FIRMWARE, FLUIDS, LEDS, PACKAGES, type Params, PATTERN_LABELS, type PatternName,
  PATTERNS, PRESET_KEYS, SHUTTERS, WHEELS,
} from './params';
import type { PresetStore } from './presets';

export type Tab = 'presets' | 'hardware' | 'simulator' | 'stats';

export interface UiHooks {
  store: PresetStore;
  /** The active preset changed (picked, stepped, added, deleted or restored). */
  onPresetSelected: () => void;
  /** A value of the active preset changed in p; `key` is the property that changed. */
  onPresetEdit: (key: string) => void;
  onDeviceEdit: () => void;
  onViewChange: () => void;
  onUpload: (file: File) => void;
  onNewSetup: () => void;
  onOpenSetup: (file: File) => void;
  onSaveSetup: () => void;
  /** The screen layout changed: the settings panel opened, closed or resized, or the strip moved. */
  onLayout: () => void;
  isAnimated: () => boolean;
}

export interface Ui {
  refresh: () => void;
  statsEl: HTMLElement;
  statsVisible: () => boolean;
  /** Size of the open panel (ignoring its slide-in animation), or undefined while closed. */
  panelSize: () => { w: number; h: number } | undefined;
  isSheet: () => boolean;
  openTab: (tab: Tab) => void;
  pickMedia: () => void;
  guis: GUI[];
}

const MEDIA = '__media__';
// Simulator values the reset button leaves alone: the ride in progress and the units.
const KEEP_ON_SIM_RESET = new Set(['speed', 'braking', 'resumeSpeed', 'cityMode', 'citySpeed', 'animFps', 'speedUnit']);

/** Seed electronics values from the selected chip, LED and firmware presets. */
function applyElectronics(p: Params) {
  const chip = CHIPS[p.chip];
  const led = LEDS[p.ledType];
  const fw = FIRMWARE[p.firmware];
  p.clockMHz = led.protocol === 'clocked' ? Math.min(chip.maxClockMHz, led.maxClockMHz, fw.clockMHz ?? Infinity) : led.maxClockMHz;
  p.lanes = Math.min(chip.maxLanes, p.stripCount);
  p.overheadUs = p.python && chip.overheadUsPy ? chip.overheadUsPy : chip.overheadUsC;
  p.pwmHz = led.pwmHz;
  p.gbPwmHz = led.gbPwmHz;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

function fileInput(accept: string, onFile: (f: File) => void) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.style.display = 'none';
  input.onchange = () => { if (input.files?.[0]) onFile(input.files[0]); input.value = ''; };
  document.body.appendChild(input);
  return input;
}

/** A lil-gui without its own title bar, placed in one of the panel's tabs. */
function tabGui(pane: string) {
  return new GUI({ container: document.querySelector<HTMLElement>(`[data-pane="${pane}"] .gui`)!, autoPlace: false });
}

export function buildUi(p: Params, hooks: UiHooks): Ui {
  const { store } = hooks;
  const mediaInput = fileInput('image/*,video/*', hooks.onUpload);
  const setupInput = fileInput('.json,application/json', hooks.onOpenSetup);

  // ---------- Presets tab: the list, then the active preset's settings ----------
  const pg = tabGui('presets');
  const nameObj = {
    get name() { return store.active.name; },
    set name(v: string) { store.rename(v); renderPresets(); },
  };
  pg.add(nameObj, 'name').name('Name');
  const content = {
    get show() { return p.useMedia ? MEDIA : p.pattern; },
    set show(v: string) {
      if (v !== MEDIA) { p.useMedia = false; p.pattern = v as PatternName; }
      else if (store.active.media) p.useMedia = true;
      else mediaInput.click();
    },
  };
  let mediaLabel = '';
  const showOptions = () => {
    const opts: Record<string, string> = {};
    for (const name of PATTERNS) opts[PATTERN_LABELS[name]] = name;
    opts[mediaLabel] = MEDIA;
    return opts;
  };
  const currentMediaLabel = () => (store.active.media ? `🖼 ${store.active.media.name}` : '📂 Your image / video…');
  mediaLabel = currentMediaLabel();
  const showCtl = pg.add(content, 'show', showOptions()).name('Show');
  const uploadCtl = pg.add({ upload: () => mediaInput.click() }, 'upload').name('📂 Upload image / GIF / video…');
  const textCtl = pg.add(p, 'text').name('Text');
  pg.add(p, 'displayMode', { 'Turns with wheel': 'wheel', 'Banner on the road': 'banner' }).name('Mode');
  const gapCtl = pg.add(p, 'tileGapM', 0, 3, 0.05).name('Banner gap (m)');
  const lowerCtl = pg.add(p, 'bannerLower', {
    'Arches': 'arches', 'Rainbow arches': 'rainbow', 'Scallops': 'scallops', 'Beads': 'beads', 'Truss bridge': 'bridge',
    'Picture (full height)': 'picture',
  }).name('Lower half');
  pg.add(p, 'globalBrightness', 1, 31, 1).name('Brightness');

  const water = pg.addFolder('Water');
  water.add(p, 'fluid', Object.keys(FLUIDS)).name('Fluid').onChange((k: string) => {
    const f = FLUIDS[k];
    p.waterFlip = f.flip; p.waterViscosity = f.viscosity; p.waterSeparation = f.separation;
  });
  water.add(p, 'waterFill', 0.05, 0.9, 0.05).name('Fill');
  water.add(p, 'rimFriction', 0, 0.5, 0.01).name('Rim drag');
  water.add(p, 'waterGain', 0, 5, 0.1).name('Slosh ×');
  const waterMore = water.addFolder('Details').close();
  waterMore.add(p, 'waterFlip', 0, 1, 0.01).name('Liveliness (FLIP)');
  waterMore.add(p, 'waterViscosity', 0, 1, 0.05).name('Viscosity');
  waterMore.add(p, 'waterSeparation', 0, 1, 0.05).name('Particle spacing');
  waterMore.add(p, 'waterGrid', 12, 64, 2).name('Grid (cells across)');
  waterMore.add(p, 'waterHz', 10, 60, 5).name('Sim rate (Hz)');
  waterMore.add(p, 'waterIters', 5, 60, 1).name('Pressure iterations');
  waterMore.add(p, 'accelSmoothMs', 0, 1000, 10).name('Accel smoothing (ms)');

  const anim = pg.addFolder('Animation');
  anim.add(p, 'playbackRate', 0.1, 4, 0.05).name('Speed ×');
  anim.add(p, 'frameAdvance', { 'Timed': 'timed', 'Every N turns': 'revolution' }).name('Advance');
  const revsCtl = anim.add(p, 'revsPerFrame', 1, 16, 1).name('Turns / frame');
  const animMore = anim.addFolder('Details').close();
  animMore.add(p, 'maxFrames', 1, 120, 1).name('Max frames (import)');
  animMore.add(p, 'videoFps', 1, 30, 1).name('Video sample fps');

  const picture = pg.addFolder('Picture details').close();
  picture.add(p, 'mapping', { 'Picture (polar)': 'polar', 'Adafruit columns': 'columns' }).name('Layout');
  picture.add(p, 'fit', { 'Whole disc': 'disc', 'LED ring only': 'annulus' }).name('Fit');
  picture.add(p, 'imageRotationDeg', -180, 180, 1).name('Rotation (°)');
  picture.add(p, 'radialCompensation').name('Dim inner LEDs');

  const pgMore = pg.addFolder('Manage presets').close();
  pgMore.add({
    restore: () => {
      if (!confirm('Replace all presets with the built-in ones? Your own presets will be deleted.')) return;
      store.restoreBuiltIns();
      hooks.onPresetSelected();
    },
  }, 'restore').name('↺ Restore built-in presets');

  // lil-gui calls the GUI-level handler before the control's own one (which may seed other
  // values), so report the change once both have run.
  pg.onChange((e) => queueMicrotask(() => { hooks.onPresetEdit(e.property); refresh(); }));

  // ---------- Hardware tab: the build, each section with its details tucked away ----------
  const hg = tabGui('hardware');
  hg.add(p, 'setupName').name('Setup name');

  const wheel = hg.addFolder('Wheel');
  wheel.add(p, 'wheelPreset', Object.keys(WHEELS)).name('Size').onChange((k: string) => {
    const w = WHEELS[k];
    p.bsdMm = w.bsdMm; p.tireMm = w.tireMm; p.spokes = w.spokes;
  });
  const wheelMore = wheel.addFolder('Details').close();
  wheelMore.add(p, 'bsdMm', 150, 700, 1).name('Rim BSD (mm)');
  wheelMore.add(p, 'tireMm', 18, 120, 1).name('Tire width (mm)');
  wheelMore.add(p, 'rimDepthMm', 10, 60, 1).name('Rim depth (mm)');
  wheelMore.add(p, 'spokes', 12, 48, 2).name('Spokes');

  const leds = hg.addFolder('LEDs');
  leds.add(p, 'ledType', Object.keys(LEDS)).name('Type').onChange(() => applyElectronics(p));
  leds.add(p, 'stripCount', 1, 8, 1).name('Strips').onChange(() => applyElectronics(p));
  const density = { get v() { return String(p.ledDensity); }, set v(s: string) { p.ledDensity = Number(s); } };
  leds.add(density, 'v', ['30', '60', '96', '144', '200']).name('LEDs / m');
  leds.add(p, 'doubleSided').name('Both sides');
  const ledMore = leds.addFolder('Details').close();
  ledMore.add(p, 'ledDensity', 10, 250, 1).name('LEDs / m (custom)');
  ledMore.add(p, 'ledPackage', Object.keys(PACKAGES)).name('Package').onChange((k: string) => { p.dieMm = PACKAGES[k]; });
  ledMore.add(p, 'dieMm', 0.5, 6, 0.1).name('Emitter size (mm)');
  ledMore.add(p, 'diffusionMm', 0, 6, 0.1).name('Diffuser spread (mm)');
  ledMore.add(p, 'stripStartMm', 15, 150, 1).name('Start radius (mm)');
  ledMore.add(p, 'autoLength').name('Fill to rim');
  const lengthCtl = ledMore.add(p, 'stripLengthMm', 20, 400, 1).name('Strip length (mm)');
  const backCtl = ledMore.add(p, 'backData', { 'Own data (reads right)': 'independent', 'Shared (mirrored)': 'same' }).name('Back strips');
  ledMore.add(p, 'radialStagger').name('Radial stagger');
  ledMore.add(p, 'gamma', 1, 3, 0.05).name('Gamma');
  ledMore.add(p, 'colorBits', 1, 8, 1).name('Bits / channel');

  const ctl = hg.addFolder('Controller');
  ctl.add(p, 'chip', Object.keys(CHIPS)).name('Chip').onChange(() => applyElectronics(p));
  ctl.add(p, 'firmware', Object.keys(FIRMWARE)).name('Firmware').onChange((k: string) => {
    const f = FIRMWARE[k];
    Object.assign(p, {
      python: f.python, syncMode: f.syncMode, hallPollMs: f.hallPollMs, debounceMs: f.debounceMs,
      minLinesPerSec: f.minLinesPerSec, columnsPerRev: f.columnsPerRev,
    });
    applyElectronics(p);
  });
  ctl.add(p, 'batteryMah', 500, 20000, 100).name('Battery (mAh)');
  const elecMore = ctl.addFolder('Electronics details').close();
  const clockCtl = elecMore.add(p, 'clockMHz', 0.1, 40, 0.1).name('LED clock (MHz)');
  elecMore.add(p, 'lanes', 1, 8, 1).name('Parallel lanes');
  elecMore.add(p, 'overheadUs', 0, 2000, 1).name('Overhead / column (µs)');
  elecMore.add(p, 'pwmHz', 100, 40000, 10).name('LED PWM (Hz)');
  const gbCtl = elecMore.add(p, 'gbPwmHz', 0, 5000, 10).name('Brightness PWM (Hz)');
  const fwMore = ctl.addFolder('Firmware details').close();
  fwMore.add(p, 'python').name('CircuitPython').onChange(() => applyElectronics(p));
  fwMore.add(p, 'syncMode', { 'Hall sensor': 'hall', 'Ideal (encoder)': 'ideal', 'Free-running': 'free' }).name('Sync');
  fwMore.add(p, 'columnsPerRev', 16, 1024, 1).name('Columns / turn');
  fwMore.add(p, 'minLinesPerSec', 0, 1000, 10).name('Min lines/s (0 = off)');
  const pollCtl = fwMore.add(p, 'hallPollMs', 0, 20, 0.5).name('Hall poll (ms)');
  const debounceCtl = fwMore.add(p, 'debounceMs', 0, 300, 5).name('Hall debounce (ms)');
  fwMore.add(p, 'overflow', { 'Wrap around': 'wrap', 'Blank': 'blank' }).name('After last column');
  fwMore.add(p, 'predictMotion').name('Banner: predict motion');
  const freeCtl = fwMore.add(p, 'freeRunColsPerSec', 50, 20000, 10).name('Free-run cols/s');

  hg.add({
    reset: () => {
      if (!confirm('Reset the hardware to the defaults?')) return;
      const d = defaultParams();
      for (const k of DEVICE_KEYS) (p as Record<string, unknown>)[k] = d[k];
      hooks.onDeviceEdit();
      refresh();
      hooks.onViewChange();
    },
  }, 'reset').name('↺ Reset hardware');
  hg.onChange(() => queueMicrotask(() => { hooks.onDeviceEdit(); refresh(); }));

  // ---------- Simulator tab: how the simulation looks and rides (never sent to the wheel) ----------
  const sg = tabGui('simulator');
  // The main view follows the bike; the strip watches the same moment from the roadside.
  const cam = sg.addFolder('Camera');
  cam.add(p, 'side', { 'Drive side': 'drive', 'Non-drive side': 'non-drive' }).name('Side').onChange(hooks.onViewChange);
  cam.add(p, 'exposureModel', { 'Human eye': 'eye', 'Camera': 'camera' }).name('Seen by');
  const shutterCtl = cam.add(p, 'shutter', Object.keys(SHUTTERS)).name('Shutter');
  cam.add(p, 'strip', { 'Above': 'above', 'Below': 'below', 'Hidden': 'off' }).name('Roadside strip').onChange(hooks.onLayout);
  const stripShutters: Record<string, string> = { 'Same as main view': 'same' };
  for (const k of Object.keys(SHUTTERS)) stripShutters[k] = k;
  const stripShutterCtl = cam.add(p, 'stripShutter', stripShutters).name('Strip exposure');
  const camMore = cam.addFolder('Details').close();
  const eyeCtl = camMore.add(p, 'eyeTauMs', 10, 200, 1).name('Eye persistence (ms)');
  camMore.add(p, 'autoExposure').name('Auto exposure');
  camMore.add(p, 'ev', -6, 6, 0.1).name('Exposure (EV)');

  const ride = sg.addFolder('Ride');
  ride.add(p, 'speedUnit', ['mph', 'km/h']).name('Units').onChange((u: string) => {
    const k = u === 'mph' ? 1 / 1.609344 : 1.609344;
    p.speed *= k; p.citySpeed *= k; p.resumeSpeed *= k;
  });
  ride.add(p, 'pedalSurgePct', 0, 100, 5).name('Pedal surge %');
  const rideMore = ride.addFolder('Details').close();
  rideMore.add(p, 'cadenceRpm', 30, 130, 1).name('Cadence (rpm)');
  rideMore.add(p, 'speedRampG', 0, 1, 0.05).name('Acceleration (g)');
  rideMore.add(p, 'brakeG', 0.1, 1, 0.05).name('Braking (g)');

  const render = sg.addFolder('Render').close();
  render.add(p, 'ambient', 0, 1, 0.01).name('Daylight');
  render.add(p, 'bloom', 0, 2, 0.01).name('Glow');
  render.add(p, 'showWheel').name('Show wheel');
  render.add(p, 'showBuffer').name('Show column buffer');
  render.add(p, 'quality', 4, 128, 1).name('Max slices');
  render.add(p, 'timeScale', 0.001, 1, 0.001).name('Time scale');
  render.add(p, 'paused').name('Paused');
  render.add({
    reset: () => {
      const d = defaultParams() as Record<string, unknown>;
      const saved = new Set<string>([...PRESET_KEYS, ...DEVICE_KEYS, ...KEEP_ON_SIM_RESET]);
      for (const k of Object.keys(d)) if (!saved.has(k)) (p as Record<string, unknown>)[k] = d[k];
      refresh();
      hooks.onLayout();
    },
  }, 'reset').name('↺ Reset simulator settings');
  sg.onChange(() => queueMicrotask(refresh));

  const guis = [pg, hg, sg];

  /** Show only the controls that matter for the current choices. */
  function syncVisibility() {
    const isWater = !p.useMedia && p.pattern === 'Water (fluid sim)';
    const animated = hooks.isAnimated();
    textCtl.show(!p.useMedia && (p.pattern === 'Text' || p.pattern === 'Wide text'));
    uploadCtl.show(p.useMedia);
    gapCtl.show(p.displayMode === 'banner');
    lowerCtl.show(p.displayMode === 'banner');
    water.show(isWater);
    anim.show(!isWater && animated);
    revsCtl.show(p.frameAdvance === 'revolution');
    picture.show(!isWater);
    lengthCtl.show(!p.autoLength);
    backCtl.show(p.doubleSided);
    clockCtl.show(LEDS[p.ledType].protocol === 'clocked');
    gbCtl.show(LEDS[p.ledType].gbMode === 'pwm');
    pollCtl.show(p.syncMode === 'hall');
    debounceCtl.show(p.syncMode === 'hall');
    freeCtl.show(p.syncMode === 'free');
    shutterCtl.show(p.exposureModel === 'camera');
    stripShutterCtl.show(p.strip !== 'off');
    eyeCtl.show(p.exposureModel === 'eye');
  }

  // ---------- Preset list and the preset bar on the ride panel ----------
  const list = $('preset-list');
  const presetName = $('preset-name');
  const presetCount = $('preset-count');
  function select(i: number) {
    store.select(i);
    hooks.onPresetSelected();
  }
  let listKey = '';
  function renderPresets() {
    // Rebuild only when something shown changed, so a refresh never swaps a button mid-tap.
    const key = JSON.stringify([store.activeIndex, store.presets.map((x) => [x.name, !!x.media])]);
    if (key === listKey) return;
    listKey = key;
    list.replaceChildren(...store.presets.map((preset, i) => {
      const li = document.createElement('li');
      li.classList.toggle('active', i === store.activeIndex);
      const pick = document.createElement('button');
      pick.type = 'button';
      pick.className = 'pick';
      pick.innerHTML = `<span class="num">${i + 1}</span>`;
      pick.append(preset.name + (preset.media ? ' 🖼' : ''));
      pick.onclick = () => select(i);
      const up = document.createElement('button');
      up.type = 'button'; up.textContent = '↑'; up.ariaLabel = `Move ${preset.name} up`; up.disabled = i === 0;
      up.onclick = () => { store.move(i, -1); renderPresets(); };
      const down = document.createElement('button');
      down.type = 'button'; down.textContent = '↓'; down.ariaLabel = `Move ${preset.name} down`;
      down.disabled = i === store.presets.length - 1;
      down.onclick = () => { store.move(i, 1); renderPresets(); };
      li.append(pick, up, down);
      return li;
    }));
    presetName.textContent = store.active.name;
    presetCount.textContent = `${store.activeIndex + 1}/${store.presets.length}`;
    ($('preset-delete') as HTMLButtonElement).disabled = store.presets.length <= 1;
  }
  $('preset-add').onclick = () => { store.add(); hooks.onPresetSelected(); };
  $('preset-delete').onclick = () => {
    if (!confirm(`Delete the preset “${store.active.name}”?`)) return;
    if (store.remove()) hooks.onPresetSelected();
  };
  $('preset-next').onclick = () => { store.next(); hooks.onPresetSelected(); };
  presetName.onclick = () => openTab('presets');
  window.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (e.key.toLowerCase() !== 'n' || e.metaKey || e.ctrlKey || e.altKey || t.matches('input, textarea, select')) return;
    store.next();
    hooks.onPresetSelected();
  });

  // ---------- Panel shell: toggle, tabs, setup file buttons ----------
  const panel = $('panel');
  const sheetQuery = matchMedia('(max-width: 699px)');
  let tab: Tab = 'presets';
  const isOpen = () => document.body.classList.contains('panel-open');
  function setOpen(open: boolean) {
    document.body.classList.toggle('panel-open', open);
    $('panel-toggle').setAttribute('aria-expanded', String(open));
    hooks.onLayout();
  }
  function openTab(t: Tab) {
    tab = t;
    for (const b of document.querySelectorAll<HTMLElement>('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === t));
    for (const pane of document.querySelectorAll<HTMLElement>('[data-pane]')) pane.hidden = pane.dataset.pane !== t;
    if (!isOpen()) setOpen(true);
  }
  for (const b of document.querySelectorAll<HTMLElement>('[data-tab]')) b.onclick = () => openTab(b.dataset.tab as Tab);
  $('panel-toggle').onclick = () => setOpen(!isOpen());
  $('panel-close').onclick = () => setOpen(false);
  $('setup-new').onclick = hooks.onNewSetup;
  $('setup-open').onclick = () => setupInput.click();
  $('setup-save').onclick = hooks.onSaveSetup;
  sheetQuery.addEventListener('change', hooks.onLayout);
  openTab('presets');
  setOpen(false);

  function refresh() {
    const label = currentMediaLabel();
    if (label !== mediaLabel) { mediaLabel = label; showCtl.options(showOptions()); }
    for (const g of guis) {
      for (const c of g.controllersRecursive() as Controller[]) {
        // Don't overwrite a field while someone is typing in it.
        if (!c.domElement.contains(document.activeElement)) c.updateDisplay();
      }
    }
    syncVisibility();
    renderPresets();
  }
  refresh();

  return {
    refresh,
    statsEl: $('stats'),
    statsVisible: () => isOpen() && tab === 'stats',
    panelSize: () => (isOpen() ? { w: panel.offsetWidth, h: panel.offsetHeight } : undefined),
    isSheet: () => sheetQuery.matches,
    openTab,
    pickMedia: () => mediaInput.click(),
    guis,
  };
}

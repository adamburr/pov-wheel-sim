import GUI, { type Controller } from 'lil-gui';
import {
  applyFirmware, applyHub, applyWheelSize, BRIGHTNESS_STEPS, CUSTOM_HUB, defaultParams, DEVICE_KEYS, FLUIDS, HUBS, normalizeDevice,
  type Params, PATTERN_LABELS, type PatternName, PATTERNS, PRESET_KEYS, SHUTTERS, showPicture, WHEELS,
} from './params';
import type { PresetStore } from './presets';
import { defaultDevice } from './defaults';
import { buildPanelsTab, type PanelsTab } from './panels/panelsTab';
import { buildElectronicsTab, type ElectronicsTab } from './electronics/electronicsTab';

export type Tab = 'presets' | 'hardware' | 'simulator' | 'stats' | 'panels' | 'electronics';

export interface UiHooks {
  store: PresetStore;
  /** The active preset changed (picked, stepped, added, deleted or restored). */
  onPresetSelected: () => void;
  /** A value of the active preset changed in p; `key` is the property that changed. */
  onPresetEdit: (key: string) => void;
  /** A hardware value changed in p; `key` is the property, when known. */
  onDeviceEdit: (key?: string) => void;
  onViewChange: () => void;
  /** The main area switched between the ride and the panels' drawing. */
  onShowPanels: (shown: boolean) => void;
  /** The main area switched between the ride and the electronics drawings. */
  onShowElectronics: (shown: boolean) => void;
  onUpload: (file: File) => void;
  onResetSetup: () => void;
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
  /** Show a tab; `open` also opens the settings panel. */
  openTab: (tab: Tab, open?: boolean) => void;
  /** The Panels tab is selected: the main area shows the panels' drawing instead of the ride. */
  panelsShown: () => boolean;
  panels: PanelsTab;
  /** The Electronics tab is selected: the main area shows its drawings. */
  electronicsShown: () => boolean;
  electronics: ElectronicsTab;
  pickMedia: () => void;
  /** Show a short message on the page (instead of alert(), which some browsers never show). */
  notify: (message: string) => void;
  guis: GUI[];
}

const MEDIA = '__media__';
// Simulator values the reset button leaves alone: the ride in progress and the units.
const KEEP_ON_SIM_RESET = new Set(['speed', 'braking', 'resumeSpeed', 'cityMode', 'citySpeed', 'animFps', 'speedUnit']);


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

/**
 * Confirm a destructive action with a second click instead of a confirm() dialog. Some embedded
 * browsers never show dialogs, so confirm() returns false and the action silently does nothing.
 * The first click arms it for 4 s (show() relabels the button); a second click carries it out.
 */
function twoStep(show: (armed: boolean) => void, action: () => void): () => void {
  let timer = 0;
  return () => {
    if (!timer) {
      show(true);
      timer = window.setTimeout(() => { timer = 0; show(false); }, 4000);
      return;
    }
    clearTimeout(timer);
    timer = 0;
    show(false);
    action();
  };
}

function confirmButton(el: HTMLElement, armedText: string, action: () => void) {
  const text = el.textContent;
  el.onclick = twoStep((armed) => { el.textContent = armed ? armedText : text; el.classList.toggle('armed', armed); }, action);
}

function confirmController(ctl: Controller, armedText: string, action: () => void) {
  const text = ctl._name;
  return twoStep((armed) => { ctl.name(armed ? armedText : text); ctl.domElement.classList.toggle('armed', armed); }, action);
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
      if (v === MEDIA) showPicture(p);
      else { p.useMedia = false; p.pattern = v as PatternName; }
    },
  };
  const showOptions: Record<string, string> = {};
  for (const name of PATTERNS) showOptions[PATTERN_LABELS[name]] = name;
  showOptions['Image / video'] = MEDIA;
  pg.add(content, 'show', showOptions).name('Show');
  // Choosing a file is separate from the Show menu: it stores the file in this preset and shows it.
  const fileLabel = () => (store.active.media ? `📂 ${store.active.media.name}` : '📂 Choose image / GIF / video…');
  const fileCtl = pg.add({ file: () => mediaInput.click() }, 'file').name(fileLabel());
  const textCtl = pg.add(p, 'text').name('Text');
  pg.add(p, 'displayMode', { 'Turns with wheel': 'wheel', 'Banner on the road': 'banner' }).name('Mode');
  const upperCtl = pg.add(p, 'bannerUpper', { 'Pinned to the road': 'road', 'Rides with the bike': 'bike' }).name('Picture');
  const gapCtl = pg.add(p, 'tileGapM', 0, 3, 0.05).name('Banner gap (m)');
  const lowerCtl = pg.add(p, 'bannerLower', {
    'Arches': 'arches', 'Rainbow arches': 'rainbow', 'Scallops': 'scallops', 'Beads': 'beads', 'Truss bridge': 'bridge',
    'Picture (full height)': 'picture',
  }).name('Lower half');
  const spinCtl = pg.add(p, 'spinSeconds', -60, 60, 0.1).name('Spin (s/turn, 0 = still)');
  pg.add(p, 'globalBrightness', 1, 31, 1).name('Brightness');

  const smiley = pg.addFolder('Bouncing smiley');
  smiley.add(p, 'smileyBounce', 0, 0.95, 0.05).name('Bounce');
  smiley.add(p, 'smileyGrip', 0, 2, 0.05).name('Wall grip');
  smiley.add(p, 'smileyGain', 0, 5, 0.1).name('Push ×');

  const dryer = pg.addFolder('Tumble dryer');
  dryer.add(p, 'dryerRibbons', 3, 10, 1).name('Ribbons');
  dryer.add(p, 'dryerDrumTurn', 0, 1, 0.05).name('Drum turn (× wheel)');
  dryer.add(p, 'dryerGrip', 0, 1, 0.05).name('Drum grip');
  dryer.add(p, 'dryerGain', 0, 5, 0.1).name('Push ×');
  dryer.add(p, 'dryerShuffle', 0, 3, 0.1).name('Layer shuffle (/s)');

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

  const anim = pg.addFolder('Animation');
  anim.add(p, 'playbackRate', 0.1, 4, 0.05).name('Speed ×');
  anim.add(p, 'frameAdvance', { 'Timed': 'timed', 'Every N turns': 'revolution' }).name('Advance');
  const revsCtl = anim.add(p, 'revsPerFrame', 0.01, 16, 0.01).name('Turns / frame');

  const picture = pg.addFolder('Picture details').close();
  const fillCtl = picture.add(p, 'pictureFill', { 'Crop to fill': 'crop', 'Whole picture': 'whole' }).name('Fill');
  const zoomCtl = picture.add(p, 'pictureZoom', 0.25, 4, 0.05).name('Zoom');
  const moveXCtl = picture.add(p, 'pictureX', -1, 1, 0.01).name('Move right');
  const moveYCtl = picture.add(p, 'pictureY', -1, 1, 0.01).name('Move up');
  const edgesCtl = picture.add(p, 'pictureEdges', { 'Blurred mirror': 'mirror', 'Dark': 'dark' }).name('Edges');
  picture.add(p, 'fit', { 'Whole disc': 'disc', 'LED ring only': 'annulus' }).name('Fit');
  picture.add(p, 'imageRotationDeg', -180, 180, 1).name('Rotation (°)');
  const backSideCtl = picture.add(p, 'backSide', { 'Reads right': 'reads', 'Mirror of drive side': 'mirror' }).name('Non-drive side');

  // lil-gui calls the GUI-level handler before the control's own one (which may seed other
  // values), so report the change once both have run.
  pg.onChange((e) => queueMicrotask(() => { hooks.onPresetEdit(e.property); refresh(); }));

  // ---------- Hardware tab: the build, each section with its details tucked away ----------
  const hg = tabGui('hardware');
  // the one setting with only a few values, so it keeps its slider
  hg.add(p, 'stripCount', 1, 4, 1).name('Strips per side').domElement.classList.add('keep-slider');

  // Everything about the wheel itself. A size brings typical values for the rest of it: measure yours.
  const wheel = hg.addFolder('Wheel');
  wheel.add(p, 'wheelPreset', Object.keys(WHEELS)).name('Size').onChange((k: string) => applyWheelSize(p, k));
  const rim = wheel.addFolder('Rim').close();
  rim.add(p, 'bsdMm', 150, 700, 1).name('Rim BSD (mm)');
  rim.add(p, 'tireMm', 18, 120, 1).name('Tire width (mm)');
  rim.add(p, 'rimDepthMm', 5, 60, 1).name('Rim depth (mm)');
  rim.add(p, 'spokes', 12, 48, 2).name('Spokes');
  rim.add(p, 'spokeCrosses', 0, 6, 1).name('Spoke crosses');
  const hub = wheel.addFolder('Hub').close();
  hub.add(p, 'hubPreset', [...Object.keys(HUBS), CUSTOM_HUB]).name('Type').onChange((k: string) => applyHub(p, k));
  hub.add(p, 'hubOldMm', 90, 150, 1).name('Over-locknut (mm)');
  hub.add(p, 'hubFlangePcdMm', 30, 80, 0.5).name('Flange holes Ø (mm)');
  hub.add(p, 'hubFlangeOffsetMm', 15, 50, 0.5).name('Centre to flange (mm)');
  hub.add(p, 'hubShellMm', 15, 60, 0.5).name('Shell Ø (mm)');
  hub.add(p, 'panelBoreMm', 10, 80, 0.1).name('Hub body Ø (mm)');
  const fork = wheel.addFolder('Fork').close();
  fork.add(p, 'forkCrownRadiusMm', 120, 450, 1).name('Crown radius (mm)');
  fork.add(p, 'forkCrownHalfMm', 10, 40, 0.5).name('Crown half-width (mm)');

  // The standard strip on both sides, each strip on its own data lane; where the LEDs sit follows the panels' rule.
  const leds = hg.addFolder('LEDs').close();
  leds.add(p, 'panelTipRadiusMm', 0, 400, 0.05).name('Tip radius (mm, 0 = auto)');
  leds.add(p, 'panelStripMinMm', 15, 120, 1).name('Min strip radius (mm)');
  leds.add(p, 'diffusionMm', 0, 6, 0.1).name('Diffuser (mm)');
  leds.add(p, 'pwmHz', 100, 40000, 10).name('LED PWM (Hz)'); // datasheets disagree
  leds.add(p, 'gamma', 1, 3, 0.05).name('Gamma');
  leds.add(p, 'radialCompensation').name('Dim inner LEDs');

  const ctl = hg.addFolder('Controller');
  const fwMore = ctl.addFolder('Firmware details').close();
  fwMore.add(p, 'syncMode', { 'Hall sensors': 'hall', 'Ideal (encoder)': 'ideal' }).name('Sync');
  fwMore.add(p, 'columnsPerRev', 16, 1024, 1).name('Columns / turn');
  const debounceCtl = fwMore.add(p, 'debounceMs', 0, 300, 5).name('Hall debounce (ms)');
  fwMore.add(p, 'maxFrames', 1, 120, 1).name('Max frames');
  fwMore.add(p, 'videoFps', 1, 30, 1).name('Video fps');
  // How hard the firmware's physics looks (water, bouncing smiley, tumble dryer) work: the same for every look.
  const waterSim = ctl.addFolder('Physics simulation').close();
  waterSim.add(p, 'waterGrid', 12, 64, 2).name('Water grid (cells)');
  waterSim.add(p, 'waterHz', 10, 60, 5).name('Sim rate (Hz)');
  waterSim.add(p, 'waterIters', 5, 60, 1).name('Water iterations');
  waterSim.add(p, 'accelSmoothMs', 0, 1000, 10).name('Accel smoothing (ms)');

  const reset = { click: () => {} };
  const resetCtl = hg.add(reset, 'click').name('↺ Reset hardware');
  reset.click = confirmController(resetCtl, 'Click again to reset the hardware', () => {
    Object.assign(p, defaultDevice());
    normalizeDevice(p);
    hooks.onDeviceEdit();
    refresh();
    hooks.onViewChange();
  });
  hg.onChange((e) => queueMicrotask(() => {
    normalizeDevice(p); // the hub type its values match; no more crosses than the spokes can lace
    hooks.onDeviceEdit(e.property);
    refresh();
  }));

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

  // Not the standard build: Adafruit's CircuitPython firmware from its bike-wheel guide, to compare against.
  const compare = sg.addFolder('Firmware').close();
  const compareCtl = compare.add(p, 'compareAdafruit').name('Compare with Adafruit').onChange(() => applyFirmware(p));
  compareCtl.domElement.title = 'The picture\'s columns as angles, a 400 lines/s floor, back strips sharing the front\'s data, a 4 MHz clock, '
    + 'the magnet polled every 4 ms (an assumed loop time) and no banner motion prediction. Not saved.';

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
      normalizeDevice(p); // the hub type follows the hub's saved values
      refresh();
      hooks.onLayout();
    },
  }, 'reset').name('↺ Reset simulator');
  sg.onChange(() => queueMicrotask(refresh));

  // ---------- Panels tab: the flat-cut LED supports, drawn in the main area while this tab is open ----------
  const panels = buildPanelsTab(p, document.querySelector<HTMLElement>('[data-pane="panels"]')!, (key) => {
    hooks.onDeviceEdit(key);
    refresh();
  });

  // ---------- Electronics tab: circuit, wiring, hub module and shopping list ----------
  const electronics = buildElectronicsTab(p, document.querySelector<HTMLElement>('[data-pane="electronics"]')!, (key) => {
    hooks.onDeviceEdit(key);
    refresh();
  });

  const guis = [pg, hg, sg, panels.gui, electronics.gui];

  /** Show only the controls that matter for the current choices. */
  function syncVisibility() {
    const isWater = !p.useMedia && p.pattern === 'Water (fluid sim)';
    const isSmiley = !p.useMedia && p.pattern === 'Bouncing smiley';
    const isDryer = !p.useMedia && p.pattern === 'Tumble dryer';
    const live = isWater || isSmiley || isDryer;
    const animated = hooks.isAnimated();
    textCtl.show(!p.useMedia && (p.pattern === 'Text' || p.pattern === 'Wide text'));
    upperCtl.show(p.displayMode === 'banner');
    spinCtl.show(p.displayMode === 'wheel' && !live);
    gapCtl.show(p.displayMode === 'banner' && p.bannerUpper === 'road');
    lowerCtl.show(p.displayMode === 'banner' && !p.useMedia); // a picture always fills the banner's full height
    for (const c of [fillCtl, zoomCtl, moveXCtl, moveYCtl, edgesCtl]) c.show(p.useMedia && p.mapping === 'polar');
    water.show(isWater);
    smiley.show(isSmiley);
    dryer.show(isDryer);
    anim.show(!live && animated);
    revsCtl.show(p.frameAdvance === 'revolution');
    picture.show(!live);
    backSideCtl.show(p.backData === 'independent');
    debounceCtl.show(p.syncMode === 'hall');
    shutterCtl.show(p.exposureModel === 'camera');
    stripShutterCtl.show(p.strip !== 'off');
    eyeCtl.show(p.exposureModel === 'eye');
  }

  // ---------- Preset list and the preset bar on the ride panel ----------
  const list = $('preset-list');
  const presetName = $('preset-name');
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
    ($('preset-delete') as HTMLButtonElement).disabled = store.presets.length <= 1;
  }
  $('preset-add').onclick = () => { store.add(); hooks.onPresetSelected(); };
  confirmButton($('preset-delete'), 'Click again to delete', () => {
    if (store.remove()) hooks.onPresetSelected();
  });
  // The wheel's preset button: a click goes to the next preset, a double click toggles Auto (on the
  // wheel: the next preset each time the lights go out). A click waits to see if a second follows.
  let clickTimer = 0;
  $('preset-next').onclick = () => {
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = 0;
      const auto = $<HTMLInputElement>('auto-next');
      if (p.switchedOff) return; // off, the preset button does nothing
      auto.checked = !auto.checked;
      auto.dispatchEvent(new Event('change'));
      return;
    }
    clickTimer = window.setTimeout(() => {
      clickTimer = 0;
      if (p.switchedOff) return;
      store.next();
      hooks.onPresetSelected();
    }, 300);
  };
  presetName.onclick = () => openTab('presets');
  // The wheel's second button: a click steps the brightness (remembered with the hardware), a double
  // click switches the wheel off or on (it is wired into the power latch). Off, a single click does nothing.
  const bright = $('bright');
  const stepBrightness = () => {
    if (p.switchedOff) return;
    p.brightnessLevel = (p.brightnessLevel + 1) % BRIGHTNESS_STEPS.length;
    hooks.onDeviceEdit('brightnessLevel');
    refresh();
  };
  let brightTimer = 0;
  bright.onclick = () => {
    if (brightTimer) { clearTimeout(brightTimer); brightTimer = 0; p.switchedOff = !p.switchedOff; refresh(); return; }
    brightTimer = window.setTimeout(() => { brightTimer = 0; stepBrightness(); }, 300);
  };
  window.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    const k = e.key.toLowerCase();
    if ((k !== 'n' && k !== 'b') || e.metaKey || e.ctrlKey || e.altKey || t.matches('input, textarea, select')) return;
    if (k === 'b') { stepBrightness(); return; }
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
  function openTab(t: Tab, open = true) {
    const wasPanels = tab === 'panels', wasElec = tab === 'electronics';
    tab = t;
    for (const b of document.querySelectorAll<HTMLElement>('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === t));
    for (const pane of document.querySelectorAll<HTMLElement>('[data-pane]')) pane.hidden = pane.dataset.pane !== t;
    if ((t === 'panels') !== wasPanels) {
      document.body.classList.toggle('view-panels', t === 'panels');
      hooks.onShowPanels(t === 'panels');
    }
    if ((t === 'electronics') !== wasElec) {
      document.body.classList.toggle('view-elec', t === 'electronics');
      hooks.onShowElectronics(t === 'electronics');
    }
    if (open && !isOpen()) setOpen(true);
  }
  for (const b of document.querySelectorAll<HTMLElement>('[data-tab]')) b.onclick = () => openTab(b.dataset.tab as Tab);
  $('panel-toggle').onclick = () => setOpen(!isOpen());
  $('panel-close').onclick = () => setOpen(false);
  confirmButton($('setup-reset'), 'Reset all?', hooks.onResetSetup);
  $('setup-open').onclick = () => setupInput.click();
  $('setup-save').onclick = hooks.onSaveSetup;
  // the setup's name, which names its file, beside the buttons that load and save it
  const setupName = $<HTMLInputElement>('setup-name');
  setupName.oninput = () => { p.setupName = setupName.value.slice(0, 60); hooks.onDeviceEdit('setupName'); };
  sheetQuery.addEventListener('change', hooks.onLayout);
  openTab('presets');
  setOpen(false);

  const toast = $('toast');
  let toastTimer = 0;
  function notify(message: string) {
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { toast.hidden = true; }, 6000);
  }

  function refresh() {
    fileCtl.name(fileLabel());
    if (document.activeElement !== setupName) setupName.value = p.setupName;
    for (const g of guis) {
      for (const c of g.controllersRecursive() as Controller[]) {
        // Don't overwrite a field while someone is typing in it.
        if (!c.domElement.contains(document.activeElement)) c.updateDisplay();
      }
    }
    syncVisibility();
    renderPresets();
    bright.textContent = p.switchedOff ? '⏻ Off' : `☀ ${Math.floor(BRIGHTNESS_STEPS[p.brightnessLevel] * 100)}%`;
    panels.refresh();
  }
  refresh();

  return {
    refresh,
    statsEl: $('stats'),
    statsVisible: () => isOpen() && tab === 'stats',
    panelSize: () => (isOpen() ? { w: panel.offsetWidth, h: panel.offsetHeight } : undefined),
    isSheet: () => sheetQuery.matches,
    openTab,
    panelsShown: () => tab === 'panels',
    panels,
    electronicsShown: () => tab === 'electronics',
    electronics,
    pickMedia: () => mediaInput.click(),
    notify,
    guis,
  };
}

import GUI from 'lil-gui';
import {
  CHIPS, defaultParams, FIRMWARE, FLUIDS, LEDS, PACKAGES, type Params, PATTERNS, SHUTTERS, WHEELS,
} from './params';

export interface UiHooks {
  onImageFile: (file: File) => void;
  onPattern: () => void;
  onViewChange: () => void;
  onBrake: () => void;
  onRide: () => void;
  onCity: (on: boolean) => void;
}

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

export function buildGui(p: Params, hooks: UiHooks): { gui: GUI; stats: GUI } {
  const gui = new GUI({ title: '⚙️ Settings & stats', width: 360 });
  const refresh = () => gui.controllersRecursive().forEach((c) => c.updateDisplay());

  // Build stats first: main.ts fills this folder with a live table.
  const stats = gui.addFolder('📊 Build stats');
  stats.close();

  const wheel = gui.addFolder('Wheel');
  wheel.add(p, 'wheelPreset', Object.keys(WHEELS)).name('size').onChange((k: string) => {
    const w = WHEELS[k];
    p.bsdMm = w.bsdMm; p.tireMm = w.tireMm; p.spokes = w.spokes;
    refresh();
  });
  wheel.add(p, 'bsdMm', 150, 700, 1).name('rim BSD (mm)');
  wheel.add(p, 'tireMm', 18, 120, 1).name('tire width (mm)');
  wheel.add(p, 'rimDepthMm', 10, 60, 1).name('rim depth (mm)');
  wheel.add(p, 'spokes', 12, 48, 2);
  wheel.close();

  const strips = gui.addFolder('Strips & LEDs');
  strips.add(p, 'stripCount', 1, 8, 1).name('strip count').onChange(() => { applyElectronics(p); refresh(); });
  const density = { preset: '144' };
  strips.add(density, 'preset', ['30', '60', '96', '144', '200']).name('density menu').onChange((v: string) => {
    p.ledDensity = Number(v); refresh();
  });
  strips.add(p, 'ledDensity', 10, 250, 1).name('LED / m');
  strips.add(p, 'ledPackage', Object.keys(PACKAGES)).name('LED package').onChange((k: string) => {
    p.dieMm = PACKAGES[k]; refresh();
  });
  strips.add(p, 'dieMm', 0.5, 6, 0.1).name('emitter size (mm)');
  strips.add(p, 'diffusionMm', 0, 6, 0.1).name('diffuser spread (mm)');
  strips.add(p, 'stripStartMm', 15, 150, 1).name('start radius (mm)');
  strips.add(p, 'autoLength').name('fill to rim');
  strips.add(p, 'stripLengthMm', 20, 400, 1).name('strip length (mm)');
  strips.add(p, 'doubleSided').name('double-sided');
  strips.add(p, 'backData', ['same', 'independent']).name('back strip data');
  strips.add(p, 'radialStagger').name('radial stagger');

  const ride = gui.addFolder('Ride');
  const speedCtl = ride.add(p, 'speed', 0, 40, 0.1).name('speed').onChange(() => { p.braking = false; });
  ride.add(p, 'speedUnit', ['mph', 'km/h']).name('units').onChange((u: string) => {
    const k = u === 'mph' ? 1 / 1.609344 : 1.609344;
    p.speed *= k; p.citySpeed *= k; p.resumeSpeed *= k;
    speedCtl.max(u === 'mph' ? 40 : 65);
    refresh();
  });
  ride.add(p, 'wobblePct', 0, 40, 1).name('pedal surge %');
  ride.add(p, 'cadenceRpm', 30, 130, 1).name('cadence (rpm)');
  ride.add(p, 'speedRampG', 0, 1, 0.05).name('speed change (g)');
  ride.add(p, 'accelSurgePct', 0, 90, 5).name('pedal surge speeding up %');
  ride.add(p, 'brakeG', 0.1, 1, 0.05).name('braking (g)');
  ride.add({ brake: hooks.onBrake }, 'brake').name('🛑 brake to a stop');
  ride.add({ go: hooks.onRide }, 'go').name('▶ ride');
  ride.add(p, 'cityMode').name('🚦 city stop-and-go').onChange((on: boolean) => hooks.onCity(on));
  ride.add(p, 'citySpeed', 1, 40, 0.5).name('city cruise speed');

  const elec = gui.addFolder('Electronics');
  elec.add(p, 'chip', Object.keys(CHIPS)).onChange(() => { applyElectronics(p); refresh(); });
  elec.add(p, 'ledType', Object.keys(LEDS)).name('LED type').onChange(() => { applyElectronics(p); refresh(); });
  elec.add(p, 'clockMHz', 0.1, 40, 0.1).name('LED clock (MHz)');
  elec.add(p, 'lanes', 1, 8, 1).name('parallel lanes');
  elec.add(p, 'overheadUs', 0, 2000, 1).name('overhead / column (µs)');
  elec.add(p, 'pwmHz', 100, 40000, 10).name('LED PWM (Hz)');
  elec.add(p, 'globalBrightness', 1, 31, 1).name('global brightness');
  elec.add(p, 'gbPwmHz', 0, 5000, 10).name('APA102 GB PWM (Hz)');
  elec.add(p, 'batteryMah', 500, 20000, 100).name('battery (mAh)');
  elec.close();

  const fw = gui.addFolder('Firmware');
  fw.add(p, 'firmware', Object.keys(FIRMWARE)).name('preset').onChange((k: string) => {
    const f = FIRMWARE[k];
    Object.assign(p, {
      python: f.python, syncMode: f.syncMode, hallPollMs: f.hallPollMs, debounceMs: f.debounceMs,
      minLinesPerSec: f.minLinesPerSec, columnsPerRev: f.columnsPerRev,
    });
    applyElectronics(p);
    refresh();
  });
  fw.add(p, 'python').name('CircuitPython').onChange(() => { applyElectronics(p); refresh(); });
  fw.add(p, 'syncMode', { 'hall sensor': 'hall', 'ideal (encoder)': 'ideal', 'free-running': 'free' }).name('sync');
  fw.add(p, 'columnsPerRev', 16, 1024, 1).name('columns / rev');
  fw.add(p, 'minLinesPerSec', 0, 1000, 10).name('min lines/s (0=off)');
  fw.add(p, 'hallPollMs', 0, 20, 0.5).name('hall poll (ms)');
  fw.add(p, 'debounceMs', 0, 300, 5).name('hall debounce (ms)');
  fw.add(p, 'overflow', ['wrap', 'blank']).name('after last column');
  fw.add(p, 'predictMotion').name('banner: predict motion');
  fw.add(p, 'freeRunColsPerSec', 50, 20000, 10).name('free-run cols/s');
  fw.close();

  const img = gui.addFolder('Image');
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*,video/*';
  input.style.display = 'none';
  input.onchange = () => { if (input.files?.[0]) hooks.onImageFile(input.files[0]); input.value = ''; };
  document.body.appendChild(input);
  img.add({ load: () => input.click() }, 'load').name('📂 load image / GIF / video…');
  img.add(p, 'displayMode', { 'wheel-locked': 'wheel', 'banner (world-locked)': 'banner' }).name('display mode').onChange((m: string) => {
    if (m === 'banner') {
      // The banner is pinned to the road, so watch from the roadside. A 1 s shutter reveals a
      // whole tile if you switch to the camera model.
      p.view = 'ride-by';
      p.shutter = '1 s';
    } else {
      // A wheel-locked image reads best with the camera riding along with the hub.
      p.view = 'chase';
    }
    refresh();
    hooks.onViewChange();
  });
  img.add(p, 'tileGapM', 0, 3, 0.05).name('banner gap (m)');
  img.add(p, 'pattern', PATTERNS as unknown as string[]).name('test pattern').onChange(hooks.onPattern);
  img.add(p, 'text').name('text').onFinishChange(() => {
    if (p.pattern !== 'Wide text') p.pattern = 'Text';
    refresh();
    hooks.onPattern();
  });
  img.add(p, 'mapping', { 'polar (picture)': 'polar', 'columns (Adafruit BMP)': 'columns' }).name('mapping');
  img.add(p, 'fit', { 'disc (keep shape)': 'disc', 'annulus (fill LEDs)': 'annulus' }).name('fit');
  img.add(p, 'imageRotationDeg', -180, 180, 1).name('rotation (°)');
  img.add(p, 'gamma', 1, 3, 0.05).name('LED gamma');
  img.add(p, 'colorBits', 1, 8, 1).name('bits / channel');
  img.add(p, 'radialCompensation').name('dim inner LEDs');
  img.add(p, 'showBuffer').name('show column buffer');

  const water = gui.addFolder('Water (fluid sim)');
  water.add({ show: () => { p.pattern = 'Water (fluid sim)'; p.displayMode = 'wheel'; refresh(); hooks.onViewChange(); } }, 'show').name('💧 show water');
  water.add(p, 'waterFill', 0.05, 0.9, 0.05).name('fill');
  water.add(p, 'waterGrid', 12, 64, 2).name('grid (cells across)');
  water.add(p, 'waterHz', 10, 60, 5).name('sim rate (Hz)');
  water.add(p, 'waterIters', 5, 60, 1).name('pressure iterations');
  water.add(p, 'fluid', Object.keys(FLUIDS)).name('fluid').onChange((k: string) => {
    const f = FLUIDS[k];
    p.waterFlip = f.flip; p.waterViscosity = f.viscosity; p.waterSeparation = f.separation;
    refresh();
  });
  water.add(p, 'rimFriction', 0, 0.5, 0.01).name('rim friction');
  water.add(p, 'waterFlip', 0, 1, 0.01).name('FLIP ratio (liveliness)');
  water.add(p, 'waterViscosity', 0, 1, 0.05).name('viscosity');
  water.add(p, 'waterSeparation', 0, 1, 0.05).name('particle separation');
  water.add(p, 'waterGain', 0, 5, 0.1).name('slosh gain ×');
  water.add(p, 'accelSmoothMs', 0, 1000, 10).name('accel smoothing (ms)');
  water.close();

  const anim = gui.addFolder('Animation');
  anim.add(p, 'frameAdvance', { 'timed (fps)': 'timed', 'every N revolutions': 'revolution' }).name('frame advance');
  anim.add(p, 'playbackRate', 0.1, 4, 0.05).name('playback rate ×');
  anim.add(p, 'animFps', 0.5, 60, 0.5).name('source fps');
  anim.add(p, 'revsPerFrame', 1, 16, 1).name('revolutions / frame');
  anim.add(p, 'maxFrames', 1, 120, 1).name('max frames (import)');
  anim.add(p, 'videoFps', 1, 30, 1).name('video sample fps');
  anim.close();

  const cam = gui.addFolder('Camera / exposure');
  cam.add(p, 'view', { 'chase (hub-locked)': 'chase', 'ride-by (roadside)': 'ride-by' }).onChange(hooks.onViewChange);
  cam.add(p, 'side', { 'drive side': 'drive', 'non-drive side': 'non-drive' }).onChange(hooks.onViewChange);
  cam.add(p, 'exposureModel', { 'camera shutter': 'camera', 'human eye': 'eye' }).name('exposure model');
  cam.add(p, 'shutter', Object.keys(SHUTTERS)).name('shutter');
  cam.add(p, 'eyeTauMs', 10, 200, 1).name('eye persistence τ (ms)');
  cam.add(p, 'autoExposure').name('auto exposure');
  cam.add(p, 'ev', -6, 6, 0.1).name('exposure EV');
  cam.add(p, 'timeScale', 0.001, 1, 0.001).name('time scale');
  cam.add(p, 'paused');

  const render = gui.addFolder('Render');
  render.add(p, 'ambient', 0, 1, 0.01).name('ambient light');
  render.add(p, 'bloom', 0, 2, 0.01).name('bloom');
  render.add(p, 'showWheel').name('show wheel');
  render.add(p, 'quality', 4, 128, 1).name('max slices');
  render.add(p, 'trackLengthM', 2, 12, 0.5).name('ride-by track (m)').onChange(hooks.onViewChange);
  render.add({ reset: () => { Object.assign(p, defaultParams()); refresh(); hooks.onPattern(); hooks.onViewChange(); } }, 'reset').name('reset all');
  render.close();

  // Start collapsed so the wheel has the screen; click the title to open the settings.
  gui.close();
  return { gui, stats };
}

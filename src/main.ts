import * as THREE from 'three';
import { bannerLowerOf, defaultParams, type Params, showPicture, speedMps } from './params';
import { buildUi, type Ui } from './ui';
import { newId, PresetStore } from './presets';
import { loadDevice, type MediaBytes, parseSetup, saveDevice, serializeSetup, setupFileName } from './setupFile';
import { DEFAULT_MEDIA_URLS, DEFAULT_SETUP, defaultBuiltIns, defaultDevice, DEFAULTS_ID } from './defaults';
import { getMedia, pruneMedia, putMedia } from './mediaStore';
import { derive, type Derived } from './sim/timing';
import { type AnimSpec, animSpecFor, buildSlices, WheelMotion } from './sim/firmware';
import { WaterSource } from './image/waterSource';
import { RibbonSource } from './image/ribbonSource';
import { SmileySource } from './image/smileySource';
import { CityRide } from './sim/city';
import { pedalSurge, riderPower } from './sim/rider';
import { computeStats, exposureSeconds } from './sim/stats';
import { type Animation, bannerTile, blankAnimation, loadMedia, makeAnimation, rawImageData, squareImageData } from './image/load';
import { bannerBitmap, bannerTileM, type FrameStack, polarize, stackFrames } from './image/polarize';
import { PovDisplay } from './render/povMaterial';
import { WheelModel } from './render/wheelGeometry';
import { createPost } from './render/post';
import { createCamera, createStripCamera, placeCamera, placeStripCamera, setFreeArea } from './render/camera';

// The saved setup: the hardware build and the presets (the active one is loaded into p).
// Reloading the page (plainly or forced) starts over from the defaults, like Reset; opening it
// afresh (a new tab, a link) restores the saved setup. So does a saved setup that began from
// other defaults: when default-setup.json changes (a new built-in preset, say), every browser
// starts over from the new defaults once, on its next visit.
const storage = (() => { try { return window.localStorage; } catch { return undefined; } })();
const DEFAULTS_KEY = 'pov-wheel-sim.defaults';
const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
const startOver = navigation?.type === 'reload' || (() => { try { return storage?.getItem(DEFAULTS_KEY) !== DEFAULTS_ID; } catch { return false; } })();
const p = defaultParams();
Object.assign(p, defaultDevice(), startOver ? {} : loadDevice(storage));
const store = new PresetStore(storage, defaultBuiltIns);
if (startOver) { saveDevice(storage, p); store.restoreBuiltIns(); }
try { storage?.setItem(DEFAULTS_KEY, DEFAULTS_ID); } catch { /* blocked storage: nothing was saved anyway */ }
// Media for the default presets, so they can find it: embedded in default-setup.json, or fetched
// from media/. Showing a preset's picture waits for this.
const defaultMedia = Promise.all(Object.entries(DEFAULT_SETUP.media).map(async ([id, m]) => {
  const url = DEFAULT_MEDIA_URLS[id];
  try {
    const bytes = url ? await (await fetch(url)).arrayBuffer() : m.bytes;
    await putMedia(id, new Blob([bytes as BlobPart], { type: m.type }));
  } catch { /* the preset shows dark, with a message, when it can't be found */ }
}));
/** Media to keep stored: what the presets use, plus the defaults' (for New and Restore). */
const keptMedia = () => new Set([...store.mediaIds(), ...Object.keys(DEFAULT_SETUP.media)]);
if (startOver) pruneMedia(keptMedia()); // uploads only the old presets used
store.apply(p);

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.getElementById('app')!.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const { camera, controls } = createCamera(renderer.domElement);
const hemi = new THREE.HemisphereLight(0xc8d8ff, 0x2a2420, 1);
const sun = new THREE.DirectionalLight(0xfff4e0, 1);
sun.position.set(2, 4, 3);
scene.add(hemi, sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({ color: 0x24262b, roughness: 0.95 }),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const laneMarks = new THREE.Group();
for (let i = -15; i <= 15; i++) {
  const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.08), new THREE.MeshStandardMaterial({ color: 0x8a8a70 }));
  mark.rotation.x = -Math.PI / 2;
  mark.position.set(i * 2, 0.001, -0.9);
  laneMarks.add(mark);
}
scene.add(laneMarks);

const wheel = new WheelModel();
const pov = new PovDisplay();
scene.add(wheel.group, pov.group);
// Two views of the same moment: the main one follows the bike, a narrow strip watches it ride
// past from the roadside.
const { composer, bloom } = createPost(renderer, scene, camera);
const stripCamera = createStripCamera();
const { composer: stripComposer, bloom: stripBloom } = createPost(renderer, scene, stripCamera);
const motion = new WheelMotion();

// ---- Image source and firmware column buffer ----
let source: Animation = makeAnimation(p.pattern, p.text, p.bannerUpper === 'bike');
let sourceVersion = 0;
let buffer: FrameStack | undefined;
let banner: (FrameStack & { pixelM: number }) | undefined;
let buildGen = 0;
// Physics looks: the firmware simulates them live instead of storing frames.
const water = new WaterSource();
const smiley = new SmileySource();
const dryer = new RibbonSource();
const isWater = () => !p.useMedia && p.pattern === 'Water (fluid sim)';
const isSmiley = () => !p.useMedia && p.pattern === 'Bouncing smiley';
const isDryer = () => !p.useMedia && p.pattern === 'Tumble dryer';
const liveSource = () => (isWater() ? water : isSmiley() ? smiley : isDryer() ? dryer : undefined);
let liveShown = false;
let imageKey = '';
let rebuildTimer = 0;

function imageKeyFor(d: Derived) {
  return [sourceVersion, bannerLowerOf(p) === 'picture', p.mapping, p.fit, p.pictureFill, p.pictureZoom, p.pictureX, p.pictureY, p.pictureEdges, p.useMedia, p.imageRotationDeg, p.gamma, p.colorBits, p.radialCompensation,
    p.columnsPerRev, p.stripCount, d.ledsPerStrip, d.rStart, d.pitch, p.doubleSided, p.backData, p.radialStagger].join('|');
}

const MAX_TEXTURE_BYTES = 128 * 1024 * 1024;

/**
 * Convert every animation frame into firmware buffers. Long clips are processed in chunks so
 * the page stays responsive; a newer rebuild cancels an older one.
 */
async function rebuildImage(d: Derived) {
  const gen = ++buildGen;
  const cols: ReturnType<typeof polarize>[] = [];
  const bans: ReturnType<typeof bannerBitmap>[] = [];
  let budgetEnd = performance.now() + 30;
  for (const [i, frame] of source.frames.entries()) {
    const wheelFrame = source.wheelFrames?.[i] ?? frame;
    // Zoom and move apply to your own pictures; patterns are drawn to fit the wheel already.
    const square = () => (p.useMedia
      ? squareImageData(wheelFrame, p.pictureFill === 'crop', p.pictureZoom, p.pictureX, p.pictureY, p.pictureEdges)
      : squareImageData(wheelFrame, p.pictureFill === 'crop'));
    const c = polarize(p.mapping === 'polar' ? square() : rawImageData(frame), p, d);
    cols.push(c);
    const bannerFrame = bannerLowerOf(p) === 'picture' ? frame : source.bannerFrames?.[i] ?? bannerTile(frame);
    bans.push(bannerBitmap(rawImageData(bannerFrame), p, d));
    if (cols.length * c.data.length > MAX_TEXTURE_BYTES) break;
    if (performance.now() > budgetEnd) {
      await new Promise((r) => setTimeout(r, 0));
      if (gen !== buildGen) return;
      budgetEnd = performance.now() + 30;
    }
  }
  if (gen !== buildGen) return;
  buffer = stackFrames(cols, cols[0].columns, cols[0].rows);
  pov.setColumns(buffer);
  banner = { ...stackFrames(bans, bans[0].width, bans[0].height), pixelM: bans[0].pixelM };
  pov.setBanner(banner, banner.pixelM);
  lastStats = 0;
  if (p.showBuffer) drawBuffer();
}

const bufferBox = document.getElementById('buffer')!;
const bufferCanvas = bufferBox.querySelector('canvas')!;
function drawBuffer() {
  bufferBox.style.display = p.showBuffer ? 'block' : 'none';
  if (!p.showBuffer || !buffer) return;
  // First frame only.
  bufferCanvas.width = buffer.width;
  bufferCanvas.height = buffer.height;
  const layer = buffer.width * buffer.height * 4;
  const img = new ImageData(new Uint8ClampedArray(buffer.data.subarray(0, layer)), buffer.width, buffer.height);
  bufferCanvas.getContext('2d')!.putImageData(img, 0, 0);
}

function setSource(src: Animation) {
  source = src;
  sourceVersion++;
  if (src.frames.length > 1) p.animFps = Math.round(src.fps * 10) / 10;
  refreshGui();
}

// ---- Presets and the setup file ----
let ui: Ui | undefined;
function refreshGui() { ui?.refresh(); }

/** Show the active preset's content: its pattern, or its uploaded image/clip (dark until one is chosen). */
let loadGen = 0;
async function loadSource() {
  const gen = ++loadGen;
  const media = store.active.media;
  if (!p.useMedia) { setSource(makeAnimation(p.pattern, p.text, p.bannerUpper === 'bike')); return; }
  if (!media) { setSource(blankAnimation()); return; }
  try {
    await defaultMedia;
    const blob = await getMedia(media.id);
    if (!blob) throw new Error('it is no longer stored in this browser');
    const anim = await loadMedia(new File([blob], media.name, { type: media.type }), p.maxFrames, p.videoFps);
    if (gen === loadGen) setSource(anim);
  } catch (err) {
    if (gen !== loadGen) return;
    ui?.notify(`Couldn't load ${media.name}: ${(err as Error).message}`);
    setSource(blankAnimation());
  }
}

let reloadTimer = 0;
async function readMedia(): Promise<Record<string, MediaBytes>> {
  const out: Record<string, MediaBytes> = {};
  for (const pr of store.presets) {
    const m = pr.media;
    if (!m || out[m.id]) continue;
    const blob = await getMedia(m.id);
    if (blob) out[m.id] = { name: m.name, type: m.type, bytes: new Uint8Array(await blob.arrayBuffer()) };
  }
  return out;
}

const hooks = {
  store,
  onPresetSelected: () => {
    store.apply(p);
    loadSource();
    refreshGui();
    pruneMedia(keptMedia());
  },
  onPresetEdit: (key: string) => {
    if (key === 'name') return; // renamed in the store already
    store.capture(p);
    if (key === 'show' || key === 'text' || key === 'bannerUpper') loadSource();
  },
  onDeviceEdit: (key?: string) => {
    saveDevice(storage, p);
    // The import limits decide how an uploaded clip is decoded, so decode it again.
    if ((key === 'maxFrames' || key === 'videoFps') && p.useMedia) {
      clearTimeout(reloadTimer);
      reloadTimer = window.setTimeout(loadSource, 400);
    }
  },
  onViewChange: () => placeCamera(camera, controls, p, derive(p)),
  onUpload: async (file: File) => {
    try {
      const anim = await loadMedia(file, p.maxFrames, p.videoFps);
      const id = newId();
      await putMedia(id, file);
      store.active.media = { id, name: file.name, type: file.type };
      showPicture(p);
      store.capture(p);
      loadGen++;
      setSource(anim);
      pruneMedia(keptMedia());
    } catch (err) {
      ui?.notify(`Couldn't load ${file.name}: ${(err as Error).message}`);
    }
  },
  onResetSetup: () => {
    Object.assign(p, defaultParams(), defaultDevice());
    saveDevice(storage, p);
    store.restoreBuiltIns();
    if (p.cityMode) city.start(simTime, p);
    hooks.onPresetSelected();
    hooks.onLayout();
  },
  onOpenSetup: async (file: File) => {
    try {
      const setup = parseSetup(await file.text());
      for (const [id, m] of Object.entries(setup.media)) await putMedia(id, new Blob([m.bytes as BlobPart], { type: m.type }));
      Object.assign(p, defaultDevice(), setup.device);
      saveDevice(storage, p);
      store.replaceAll(setup.presets, setup.activePreset);
      hooks.onPresetSelected();
      hooks.onViewChange();
    } catch (err) {
      ui?.notify(`Couldn't open ${file.name}: ${(err as Error).message}`);
    }
  },
  onSaveSetup: async () => {
    const text = serializeSetup(p, store, await readMedia());
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = setupFileName(p.setupName);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
  onLayout: () => {
    if (!ui) return; // buildUi reports its initial (closed) state before the page is set up
    resize();
    placeCamera(camera, controls, p, derive(p));
  },
  isAnimated: () => source.frames.length > 1,
};

// ---- Riding: stop-and-go automation and the large speed control ----
// A fresh seed each page load, so the trips (including the first) differ every visit.
const city = new CityRide(1 + Math.floor(Math.random() * 2147483645));
function setCity(on: boolean) {
  p.cityMode = on;
  if (on) {
    if (p.speed > 0) p.citySpeed = p.speed;
    city.start(simTime, p);
  } else {
    p.speed = p.citySpeed; p.braking = false;
  }
}
function brake() {
  if (p.cityMode) setCity(false);
  if (p.speed > 0) p.resumeSpeed = p.speed;
  p.speed = 0; p.braking = true;
}
function rideOn() {
  if (p.cityMode) setCity(false);
  p.speed = p.resumeSpeed || 10; p.braking = false;
}
const rideEl = document.getElementById('ride')!;
const rideSpeed = document.getElementById('ride-speed')!;
const rideUnit = document.getElementById('ride-unit')!;
const rideStatus = document.getElementById('ride-status')!;
const rideSlider = document.getElementById('ride-slider') as HTMLInputElement;
const rideCity = document.getElementById('ride-city') as HTMLInputElement;
document.getElementById('ride-brake')!.addEventListener('click', brake);
document.getElementById('ride-go')!.addEventListener('click', rideOn);
rideCity.addEventListener('change', () => setCity(rideCity.checked));
rideSlider.addEventListener('input', () => {
  const v = Number(rideSlider.value);
  if (p.cityMode) {
    p.citySpeed = v;
    if (city.phase === 'go' || city.phase === 'cruise') p.speed = v * city.fraction * city.share;
  } else {
    p.speed = v; p.braking = false;
  }
});
function updateRidePanel(actualMps: number) {
  const mph = p.speedUnit === 'mph';
  rideSpeed.textContent = (actualMps / (mph ? 0.44704 : 1 / 3.6)).toFixed(1);
  rideUnit.textContent = p.speedUnit;
  rideSlider.max = mph ? '40' : '65';
  // The slider sets the target: the cruise speed in stop-and-go, otherwise the riding speed.
  const target = p.cityMode ? p.citySpeed : p.speed;
  if (document.activeElement !== rideSlider) rideSlider.value = String(target);
  rideCity.checked = p.cityMode;
  rideStatus.textContent = `target ${target.toFixed(1)}`;
}
ui = buildUi(p, hooks);
loadSource();
// Exposed for scripting from the devtools console, e.g. povSim.p.speed = 20.
Object.assign(window, { povSim: { p, ui, store, hooks, camera, controls } });

// Drag-and-drop and paste: images and clips go into the active preset; a .json opens as a setup.
const drop = document.getElementById('drop')!;
window.addEventListener('dragover', (e) => { e.preventDefault(); drop.style.display = 'flex'; });
window.addEventListener('dragleave', () => { drop.style.display = 'none'; });
window.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.style.display = 'none';
  const f = e.dataTransfer?.files[0];
  if (!f) return;
  if (f.type === 'application/json' || f.name.endsWith('.json')) hooks.onOpenSetup(f);
  else if (f.type.startsWith('image/') || f.type.startsWith('video/')) hooks.onUpload(f);
});
window.addEventListener('paste', (e) => {
  const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
  const f = item?.getAsFile();
  if (f) hooks.onUpload(f);
});

// ---- Stats ----
// The live stats table lives in the settings panel's Stats tab; it only redraws while shown.
const statsEl = ui.statsEl;
let lastStats = 0;
function updateStats(d: Derived, now: number) {
  if (!ui!.statsVisible() || now - lastStats < 300) return;
  lastStats = now;
  const w = isWater() && water.sim ? water : undefined;
  const live = liveSource();
  const bannerMode = p.displayMode === 'banner' && banner && !live;
  const s = computeStats(p, d, (live ? live.meanDuty : bannerMode ? banner?.meanDuty : buffer?.meanDuty) ?? 0,
    bannerMode && banner ? { width: banner.width, height: banner.height, tileM: bannerTileM(banner, p.tileGapM) } : undefined,
    live ? 1 : buffer?.frames ?? 1,
    w && w.sim ? {
      grid: w.sim.n, particles: w.sim.count, flopsPerStep: w.sim.flopsPerStep(), ramBytes: w.ramBytes(),
      aEstimate: w.aEstimate, aTrue: w.aTrue, wallSpeed: w.wallSpeed,
    } : undefined,
    isDryer() && dryer.dryer ? {
      label: 'Ribbons', detail: `${dryer.dryer.count} × ${dryer.dryer.points} points · drum ×${p.dryerDrumTurn}`,
      flopsPerStep: dryer.dryer.flopsPerStep(), ramBytes: dryer.ramBytes(),
    } : undefined);
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const v = motion.speed(simTime);
  const lines = [{ label: 'Build', value: `${p.chip} · ${p.ledType}` }, ...s.lines];
  lines.splice(2, 0, { label: 'Rider power', value: `≈ ${Math.round(riderPower(v, motion.rampAccel(simTime)))} W` });
  statsEl.innerHTML = `<table>${
    lines.map((l) => `<tr><td>${esc(l.label)}</td><td>${esc(l.value)}</td></tr>`).join('')
  }</table>${s.warnings.length ? `<ul>${s.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}`;
}

// ---- Frame loop ----
interface Rect { x: number; y: number; w: number; h: number }
/** Where each view is drawn, in CSS pixels from the top-left. No strip when it is turned off. */
const layout: { main: Rect; strip?: Rect } = { main: { x: 0, y: 0, w: 1, h: 1 } };
const stripFrame = document.getElementById('strip-frame')!;
const stripLabel = stripFrame.querySelector('span')!;
let portrait = window.innerHeight > window.innerWidth;
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  // Keep the wheel clear of the speed panel and the settings: a side panel on wide screens, a
  // bottom sheet (which hides the speed panel) on phones.
  const panel = ui?.panelSize();
  let bottom = rideEl.getBoundingClientRect().top - 8, right = w;
  if (panel && ui!.isSheet()) bottom = h - panel.h - 8;
  else if (panel) right = w - panel.w;
  // The roadside strip takes a slice of the free height, at the top or just above the speed panel.
  let main: Rect = { x: 0, y: 0, w: right, h }, strip: Rect | undefined, freeBottom = bottom;
  if (p.strip !== 'off') {
    const sh = Math.round(Math.min(240, Math.max(70, bottom * 0.28)));
    if (p.strip === 'above') {
      strip = { x: 0, y: 0, w: right, h: sh };
      main = { x: 0, y: sh, w: right, h: h - sh };
    } else {
      strip = { x: 0, y: bottom - sh, w: right, h: sh };
      main = { x: 0, y: 0, w: right, h: bottom - sh };
    }
    freeBottom = bottom - sh;
  }
  layout.main = main;
  layout.strip = strip;
  composer.setSize(main.w, main.h);
  camera.aspect = main.w / main.h;
  setFreeArea(camera, main.w, main.h, 0, freeBottom);
  if (strip) stripComposer.setSize(strip.w, strip.h);
  stripFrame.hidden = !strip;
  document.body.style.setProperty('--view-top', `${main.y}px`); // the settings button sits on the follow view
  if (strip) Object.assign(stripFrame.style, { left: `${strip.x}px`, top: `${strip.y}px`, width: `${strip.w}px`, height: `${strip.h}px` });
  // Re-frame when a phone turns between portrait and landscape.
  if ((h > w) !== portrait) { portrait = h > w; placeCamera(camera, controls, p, derive(p)); }
}
window.addEventListener('resize', resize);
window.addEventListener('load', resize); // fonts can change the speed panel's height
resize();
placeCamera(camera, controls, p, derive(p));

const night = new THREE.Color(0x05070d), dusk = new THREE.Color(0x34405c), day = new THREE.Color(0x9db8d8);
const bg = new THREE.Color();
let simTime = 20; // start with history so the hall firmware is already armed
let last = performance.now();
let lastBufferFlag = p.showBuffer;

function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!p.paused) simTime += dt * p.timeScale;

  const d = derive(p);
  if (p.cityMode) city.update(simTime, p);
  const rampG = p.cityMode ? city.rampG : p.braking ? p.brakeG : p.speedRampG;
  // One pedal-surge setting: each stroke pulses the rider's push, which comes from the estimated
  // force needed (accelerating plus air drag and rolling resistance).
  const strokeHz = (p.cadenceRpm / 60) * 2, vTarget = speedMps(p);
  const surge = pedalSurge(p.pedalSurgePct / 100, motion.speed(simTime), vTarget, rampG * 9.81, 2 * Math.PI * strokeHz);
  motion.configure(vTarget, d.tireRadius, surge.cruise, strokeHz, simTime, rampG * 9.81, surge.ramp);

  // Content: live frames from a physics look (water, bouncing smiley, tumble dryer), or the converted image/animation.
  let anim = animSpecFor(p, buffer?.frames ?? 1);
  const live = liveSource();
  if (live) {
    const changed = live.sync(p, d, motion, simTime);
    pov.setLiveLayers(live.data, live.width, live.height, live.spec(p).frames, changed);
    anim = live.spec(p);
    liveShown = true;
  } else if (liveShown) {
    liveShown = false;
    if (buffer) pov.setColumns(buffer);
  }

  const key = imageKeyFor(d);
  if (key !== imageKey && !rebuildTimer) {
    rebuildTimer = window.setTimeout(() => { rebuildTimer = 0; imageKey = imageKeyFor(derive(p)); rebuildImage(derive(p)); }, buffer ? 120 : 0);
  }
  if (p.showBuffer !== lastBufferFlag) { lastBufferFlag = p.showBuffer; drawBuffer(); }

  ground.position.y = -d.tireRadius;
  laneMarks.position.y = -d.tireRadius;
  const a = p.ambient;
  bg.copy(night).lerp(dusk, Math.min(1, a * 2)).lerp(day, Math.max(0, a * 2 - 1));
  scene.background = bg;
  hemi.intensity = a * 2.5;
  sun.intensity = a * 2.5;
  bloom.strength = stripBloom.strength = p.bloom;
  renderer.toneMappingExposure = Math.pow(2, p.ev);
  wheel.build(p, d);
  wheel.group.visible = p.showWheel;
  const tileM = p.displayMode === 'banner' && !anim.live ? pov.bannerTile(p) : 0;

  // Clear the whole canvas (behind the panels), then draw each view into its own rectangle. Both
  // show the same moment, motion and animation; only the camera and exposure differ.
  renderer.setScissorTest(false);
  renderer.setRenderTarget(null);
  renderer.setClearColor(bg);
  renderer.clear();
  controls.update();
  drawView(p, d, anim, tileM, camera, composer, layout.main);
  if (layout.strip) {
    const s = layout.strip;
    const own = p.stripShutter !== 'same';
    const sp: Params = {
      ...p, view: 'ride-by', trackLengthM: placeStripCamera(stripCamera, p, d, s.w / s.h),
      ...(own ? { exposureModel: 'camera', shutter: p.stripShutter, autoExposure: true } : {}),
    };
    drawView(sp, d, anim, tileM, stripCamera, stripComposer, s);
    const label = `Roadside · ${own ? `${p.stripShutter} exposure` : p.exposureModel === 'eye' ? 'human eye' : p.shutter}`;
    if (stripLabel.textContent !== label) stripLabel.textContent = label;
  }
  renderer.setScissorTest(false);

  updateStats(d, now);
  updateRidePanel(motion.speed(simTime));
}
requestAnimationFrame(frame);

/** Render one view of the current moment into its rectangle of the canvas. */
function drawView(v: Params, d: Derived, anim: AnimSpec, tileM: number, cam: THREE.PerspectiveCamera, comp: typeof composer, r: Rect) {
  // Exposure window ends now.
  const T = exposureSeconds(v);
  const tB = simTime, tA = simTime - T;
  const rideBy = v.view === 'ride-by';
  const maxAngle = rideBy ? Math.PI / 8 : v.pedalSurgePct > 0 ? Math.PI / 2 : Math.PI * 2;
  const slices = buildSlices(v, d, motion, tA, tB, maxAngle, tileM, anim);

  const L = v.trackLengthM;
  const hubAt = (t: number) => {
    if (!rideBy) return 0;
    const s = motion.dist(t) + L / 2;
    return s - Math.floor(s / L) * L - L / 2;
  };

  // Mechanical wheel: blur copies spread over the (visually dominant part of the) exposure.
  const blurT = v.exposureModel === 'eye' ? (v.eyeTauMs / 1000) * 1.5 : T;
  const sweep = motion.phi(tB) - motion.phi(tB - blurT);
  const travel = motion.dist(tB) - motion.dist(tB - blurT);
  const copies = Math.max(1, Math.min(24, Math.ceil(Math.max(sweep / 0.07, rideBy ? travel / 0.01 : 0))));
  const times = Array.from({ length: copies }, (_, i) => tB - blurT * (copies > 1 ? (i + 0.5) / copies : 0));
  wheel.pose(times, (t) => motion.phi(t), hubAt);

  pov.update(v, d, slices, tB, cam, anim);

  // WebGL counts the viewport from the bottom of the canvas.
  const y = window.innerHeight - r.y - r.h;
  renderer.setViewport(r.x, y, r.w, r.h);
  renderer.setScissor(r.x, y, r.w, r.h);
  renderer.setScissorTest(true);
  comp.render();
}

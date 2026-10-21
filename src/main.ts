import * as THREE from 'three';
import { defaultParams, speedMps } from './params';
import { buildGui } from './ui';
import { derive, type Derived } from './sim/timing';
import { animSpecFor, buildSlices, WheelMotion } from './sim/firmware';
import { WaterSource } from './image/waterSource';
import { CityRide } from './sim/city';
import { computeStats, exposureSeconds } from './sim/stats';
import { type Animation, loadMedia, makeAnimation, rawImageData, squareImageData } from './image/load';
import { bannerBitmap, bannerTileM, type FrameStack, polarize, stackFrames } from './image/polarize';
import { PovDisplay } from './render/povMaterial';
import { WheelModel } from './render/wheelGeometry';
import { createPost } from './render/post';
import { createCamera, placeCamera } from './render/camera';

const p = defaultParams();

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
const { composer, bloom } = createPost(renderer, scene, camera);
const motion = new WheelMotion();

// ---- Image source and firmware column buffer ----
let source: Animation = makeAnimation(p.pattern, p.text);
let sourceVersion = 0;
let buffer: FrameStack | undefined;
let banner: (FrameStack & { pixelM: number }) | undefined;
let buildGen = 0;
const water = new WaterSource();
const isWater = () => p.pattern === 'Water (fluid sim)';
let waterShown = false;
let imageKey = '';
let rebuildTimer = 0;

function imageKeyFor(d: Derived) {
  return [sourceVersion, p.mapping, p.fit, p.imageRotationDeg, p.gamma, p.colorBits, p.radialCompensation,
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
    const c = polarize(p.mapping === 'polar' ? squareImageData(wheelFrame) : rawImageData(frame), p, d);
    cols.push(c);
    bans.push(bannerBitmap(rawImageData(frame), p, d));
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
  if (src.frames.length > 1) {
    p.animFps = Math.round(src.fps * 10) / 10;
    gui.controllersRecursive().forEach((c) => c.updateDisplay());
  }
}

const hooks = {
  onImageFile: async (file: File) => {
    try {
      setSource(await loadMedia(file, p.maxFrames, p.videoFps));
    } catch (err) {
      alert(`Couldn't load ${file.name}: ${(err as Error).message}`);
    }
  },
  onPattern: () => setSource(makeAnimation(p.pattern, p.text)),
  onViewChange: () => placeCamera(camera, controls, p, derive(p)),
  onBrake: () => {
    if (p.cityMode) setCity(false);
    if (p.speed > 0) p.resumeSpeed = p.speed;
    p.speed = 0; p.braking = true;
    refreshGui();
  },
  onRide: () => {
    if (p.cityMode) setCity(false);
    p.speed = p.resumeSpeed || 10; p.braking = false;
    refreshGui();
  },
  onCity: (on: boolean) => setCity(on),
};

// ---- Riding: stop-and-go automation and the large speed control ----
const city = new CityRide();
function refreshGui() { gui.controllersRecursive().forEach((c) => c.updateDisplay()); }
function setCity(on: boolean) {
  p.cityMode = on;
  if (on) {
    if (p.speed > 0) p.citySpeed = p.speed;
    city.start(simTime, p);
  } else {
    p.speed = p.citySpeed; p.braking = false;
  }
  refreshGui();
}
const rideSpeed = document.getElementById('ride-speed')!;
const rideUnit = document.getElementById('ride-unit')!;
const rideStatus = document.getElementById('ride-status')!;
const rideSlider = document.getElementById('ride-slider') as HTMLInputElement;
const rideCity = document.getElementById('ride-city') as HTMLInputElement;
document.getElementById('ride-brake')!.addEventListener('click', () => hooks.onBrake());
document.getElementById('ride-go')!.addEventListener('click', () => hooks.onRide());
rideCity.addEventListener('change', () => setCity(rideCity.checked));
rideSlider.addEventListener('input', () => {
  const v = Number(rideSlider.value);
  if (p.cityMode) {
    p.citySpeed = v;
    if (city.phase === 'go' || city.phase === 'cruise') p.speed = v;
  } else {
    p.speed = v; p.braking = false;
  }
  refreshGui();
});
function cityText(): string {
  switch (city.phase) {
    case 'go': return `🚦 pulling away at ${city.rampG.toFixed(2)} g`;
    case 'cruise': return '🚦 cruising';
    case 'brake': return `🚦 red light ${city.lightM.toFixed(0)} m ahead · braking ${city.rampG.toFixed(2)} g`;
    default: return '🚦 waiting at a light';
  }
}
function updateRidePanel(actualMps: number) {
  const mph = p.speedUnit === 'mph';
  rideSpeed.textContent = (actualMps / (mph ? 0.44704 : 1 / 3.6)).toFixed(1);
  rideUnit.textContent = p.speedUnit;
  rideSlider.max = mph ? '40' : '65';
  if (document.activeElement !== rideSlider) rideSlider.value = String(p.cityMode ? p.citySpeed : p.speed);
  rideCity.checked = p.cityMode;
  const target = p.cityMode ? p.citySpeed : p.speed;
  rideStatus.textContent = p.cityMode ? cityText() : p.braking ? 'braking' : `target ${target.toFixed(1)}`;
}
const gui = buildGui(p, hooks);
// Exposed for scripting from the devtools console, e.g. povSim.p.speed = 20.
Object.assign(window, { povSim: { p, gui, hooks, camera, controls } });

// Drag-and-drop and paste.
const drop = document.getElementById('drop')!;
window.addEventListener('dragover', (e) => { e.preventDefault(); drop.style.display = 'flex'; });
window.addEventListener('dragleave', () => { drop.style.display = 'none'; });
window.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.style.display = 'none';
  const f = e.dataTransfer?.files[0];
  if (f && (f.type.startsWith('image/') || f.type.startsWith('video/'))) hooks.onImageFile(f);
});
window.addEventListener('paste', (e) => {
  const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
  const f = item?.getAsFile();
  if (f) hooks.onImageFile(f);
});

// ---- Stats panel ----
const statsEl = document.getElementById('stats')!;
let statsCollapsed = true; // start closed; click the heading to open
statsEl.classList.toggle('collapsed', statsCollapsed);
statsEl.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).tagName === 'H1') { statsCollapsed = !statsCollapsed; statsEl.classList.toggle('collapsed', statsCollapsed); }
});
let lastStats = 0;
function updateStats(d: Derived, now: number) {
  if (now - lastStats < 300) return;
  lastStats = now;
  const w = isWater() && water.sim ? water : undefined;
  const bannerMode = p.displayMode === 'banner' && banner && !w;
  const s = computeStats(p, d, (w ? w.meanDuty : bannerMode ? banner?.meanDuty : buffer?.meanDuty) ?? 0,
    bannerMode && banner ? { width: banner.width, height: banner.height, tileM: bannerTileM(banner, p.tileGapM) } : undefined,
    w ? 1 : buffer?.frames ?? 1,
    w && w.sim ? {
      grid: w.sim.n, particles: w.sim.count, flopsPerStep: w.sim.flopsPerStep(), ramBytes: w.ramBytes(),
      aEstimate: w.aEstimate, aTrue: w.aTrue, wallSpeed: w.wallSpeed,
    } : undefined);
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const lines = [{ label: 'Build', value: `${p.chip} · ${p.ledType}` }, ...s.lines];
  statsEl.innerHTML = `<h1>${statsCollapsed ? '▸' : '▾'} 📊 Build stats</h1><table>${
    lines.map((l) => `<tr><td>${esc(l.label)}</td><td>${esc(l.value)}</td></tr>`).join('')
  }</table>${s.warnings.length ? `<ul>${s.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}`;
}

// ---- Frame loop ----
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
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
  if (p.cityMode && city.update(simTime, p)) refreshGui();
  const rampG = p.cityMode ? city.rampG : p.braking ? p.brakeG : p.speedRampG;
  motion.configure(speedMps(p), d.tireRadius, p.wobblePct / 100, (p.cadenceRpm / 60) * 2, simTime, rampG * 9.81, p.accelSurgePct / 100);

  // Content: live water frames, or the converted image/animation.
  let anim = animSpecFor(p, buffer?.frames ?? 1);
  if (isWater()) {
    const changed = water.sync(p, d, motion, simTime);
    pov.setLiveLayers(water.data, water.width, water.height, water.spec(p).frames, changed);
    anim = water.spec(p);
    waterShown = true;
  } else if (waterShown) {
    waterShown = false;
    if (buffer) pov.setColumns(buffer);
  }

  const key = imageKeyFor(d);
  if (key !== imageKey && !rebuildTimer) {
    rebuildTimer = window.setTimeout(() => { rebuildTimer = 0; imageKey = imageKeyFor(derive(p)); rebuildImage(derive(p)); }, buffer ? 120 : 0);
  }
  if (p.showBuffer !== lastBufferFlag) { lastBufferFlag = p.showBuffer; drawBuffer(); }

  // Exposure window ends now.
  const T = exposureSeconds(p);
  const tB = simTime, tA = simTime - T;
  const rideBy = p.view === 'ride-by';
  const maxAngle = rideBy ? Math.PI / 8 : p.wobblePct > 0 ? Math.PI / 2 : Math.PI * 2;
  const slices = buildSlices(p, d, motion, tA, tB, maxAngle, p.displayMode === 'banner' && !anim.live ? pov.bannerTile(p) : 0, anim);

  const L = p.trackLengthM;
  const hubAt = (t: number) => {
    if (!rideBy) return 0;
    const s = motion.dist(t) + L / 2;
    return s - Math.floor(s / L) * L - L / 2;
  };

  // Mechanical wheel: blur copies spread over the (visually dominant part of the) exposure.
  wheel.build(p, d);
  wheel.group.visible = p.showWheel;
  const blurT = p.exposureModel === 'eye' ? (p.eyeTauMs / 1000) * 1.5 : T;
  const sweep = motion.phi(tB) - motion.phi(tB - blurT);
  const travel = motion.dist(tB) - motion.dist(tB - blurT);
  const copies = Math.max(1, Math.min(24, Math.ceil(Math.max(sweep / 0.07, rideBy ? travel / 0.01 : 0))));
  const times = Array.from({ length: copies }, (_, i) => tB - blurT * (copies > 1 ? (i + 0.5) / copies : 0));
  wheel.pose(times, (t) => motion.phi(t), hubAt);

  pov.update(p, d, slices, tB, camera, anim);

  ground.position.y = -d.tireRadius;
  laneMarks.position.y = -d.tireRadius;
  const a = p.ambient;
  bg.copy(night).lerp(dusk, Math.min(1, a * 2)).lerp(day, Math.max(0, a * 2 - 1));
  scene.background = bg;
  hemi.intensity = a * 2.5;
  sun.intensity = a * 2.5;
  bloom.strength = p.bloom;
  renderer.toneMappingExposure = Math.pow(2, p.ev);

  controls.update();
  composer.render();
  updateStats(d, now);
  updateRidePanel(motion.speed(simTime));
}
requestAnimationFrame(frame);

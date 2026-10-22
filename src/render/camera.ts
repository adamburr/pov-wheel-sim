import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Params } from '../params';
import type { Derived } from '../sim/timing';

export function createCamera(dom: HTMLElement) {
  const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 200);
  const controls = new OrbitControls(camera, dom);
  controls.enableDamping = true;
  return { camera, controls };
}

/** The part of the screen the wheel can use, clear of the speed panel and settings (fractions of height/width). */
const free = { top: 0, bottom: 1, right: 1 };

/**
 * Centre the view in the free area: shift the projection so the hub, which sits at the middle of
 * the 3D view, appears midway between topPx and bottomPx (and left of rightPx, where the settings
 * panel starts) instead of behind the panels.
 */
export function setFreeArea(camera: THREE.PerspectiveCamera, w: number, h: number, topPx: number, bottomPx: number, rightPx = w) {
  free.top = topPx / h;
  free.bottom = bottomPx / h;
  free.right = rightPx / w;
  const shiftY = Math.round(h / 2 - (topPx + bottomPx) / 2);
  const shiftX = Math.round(w / 2 - rightPx / 2);
  if (shiftX === 0 && shiftY === 0) camera.clearViewOffset();
  else camera.setViewOffset(w, h, shiftX, shiftY, w, h);
  camera.updateProjectionMatrix();
}

/** The follow view: the camera rides along with the hub. */
export function placeCamera(camera: THREE.PerspectiveCamera, controls: OrbitControls, p: Params, d: Derived) {
  const z = p.side === 'drive' ? 1 : -1;
  // Back off only as far as needed for the whole wheel (and fork crown) to fit the free height
  // and width; narrow portrait phones are width-limited.
  const half = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const extent = d.tireRadius + 0.06;
  const fitHeight = extent / (half * Math.max(0.2, free.bottom - free.top));
  const fitWidth = extent / (half * camera.aspect * free.right * 0.94);
  camera.position.set(0, 0.04, z * Math.max(d.tireRadius * 5.4, fitHeight, fitWidth));
  controls.target.set(0, 0, 0);
  controls.update();
}

/** A fixed roadside camera for the strip view: a long, narrow lens framing the wheel's height. */
export function createStripCamera() {
  return new THREE.PerspectiveCamera(16, 4, 0.05, 200);
}

/**
 * Frame the strip so the wheel, ground to top, fills its height. Returns the track length: the
 * visible road plus a wheel on each side, so the bike rolls fully in and out before it loops,
 * rounded up to whole wheel turns. Then the wheel reaches each spot at the same angle every lap, so
 * a long exposure spanning several laps looks like one pass (patterns tied to the wheel angle,
 * like the banner's lower half, would otherwise land in a different place each lap).
 */
export function placeStripCamera(camera: THREE.PerspectiveCamera, p: Params, d: Derived, aspect: number): number {
  const z = p.side === 'drive' ? 1 : -1;
  const halfH = d.tireRadius * 1.15;
  const dist = halfH / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  camera.aspect = aspect;
  camera.position.set(0, 0, z * dist);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  const turn = 2 * Math.PI * d.tireRadius;
  return Math.ceil((2 * halfH * aspect + 2 * d.tireRadius) / turn) * turn;
}

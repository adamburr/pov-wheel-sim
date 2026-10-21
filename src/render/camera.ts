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

/** The part of the screen the wheel can use, between the menu bar and the speed panel (fractions of height). */
const free = { top: 0, bottom: 1 };

/**
 * Centre the view in the free area: shift the projection so the hub, which sits at the middle of
 * the 3D view, appears midway between topPx and bottomPx instead of behind the speed panel.
 */
export function setFreeArea(camera: THREE.PerspectiveCamera, w: number, h: number, topPx: number, bottomPx: number) {
  free.top = topPx / h;
  free.bottom = bottomPx / h;
  const shift = Math.round(h / 2 - (topPx + bottomPx) / 2);
  if (shift === 0) camera.clearViewOffset();
  else camera.setViewOffset(w, h, 0, shift, w, h);
  camera.updateProjectionMatrix();
}

/** Chase: camera rides along with the hub. Ride-by: fixed roadside camera while the bike passes. */
export function placeCamera(camera: THREE.PerspectiveCamera, controls: OrbitControls, p: Params, d: Derived) {
  const z = p.side === 'drive' ? 1 : -1;
  if (p.view === 'chase') {
    // Back off only as far as needed for the whole wheel (and fork crown) to fit the free height
    // and the screen width; narrow portrait phones are width-limited.
    const half = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const extent = d.tireRadius + 0.06;
    const fitHeight = extent / (half * Math.max(0.2, free.bottom - free.top));
    const fitWidth = extent / (half * camera.aspect * 0.94);
    camera.position.set(0, 0.04, z * Math.max(d.tireRadius * 5.4, fitHeight, fitWidth));
    controls.target.set(0, 0, 0);
  } else {
    camera.position.set(0, 0.2, z * (p.trackLengthM * 0.55 + 0.4));
    controls.target.set(0, 0, 0);
  }
  controls.update();
}

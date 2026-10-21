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

/** Chase: camera rides along with the hub. Ride-by: fixed roadside camera while the bike passes. */
export function placeCamera(camera: THREE.PerspectiveCamera, controls: OrbitControls, p: Params, d: Derived) {
  const z = p.side === 'drive' ? 1 : -1;
  if (p.view === 'chase') {
    camera.position.set(0, 0.04, z * d.tireRadius * 5.4);
    controls.target.set(0, 0, 0);
  } else {
    camera.position.set(0, 0.2, z * (p.trackLengthM * 0.55 + 0.4));
    controls.target.set(0, 0, 0);
  }
  controls.update();
}

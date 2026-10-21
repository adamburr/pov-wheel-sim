import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Params } from '../params';
import type { Derived } from '../sim/timing';
import { ledRadius } from '../image/polarize';
import { LED_Z } from './povMaterial';

const MAX_COPIES = 24;

function colored(geo: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const c = new THREE.Color(hex);
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** A stick between two points, as a thin cylinder. */
function rod(a: THREE.Vector3, b: THREE.Vector3, radius: number, segments = 5, capped = false): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(radius, radius, len, segments, 1, !capped);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyQuaternion(q);
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

/**
 * The physical wheel. Rotating parts are drawn as several instanced copies spread over the
 * exposure, which gives spokes and strips the same motion blur a camera would record.
 */
export class WheelModel {
  readonly group = new THREE.Group();
  private material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2 });
  // The fork has its own material so it can stay solid (and hide the LEDs behind it) while
  // the spinning parts are drawn as see-through blur copies.
  private forkMaterial = this.material.clone();
  private rotating?: THREE.InstancedMesh;
  private fixed?: THREE.InstancedMesh;
  private key = '';
  private m = new THREE.Matrix4();

  build(p: Params, d: Derived) {
    const key = [p.bsdMm, p.tireMm, p.rimDepthMm, p.spokes, p.stripCount, d.ledsPerStrip, p.doubleSided,
      p.dieMm, p.stripStartMm, p.ledDensity, p.radialStagger].join('|');
    if (key === this.key) return;
    this.key = key;
    for (const mesh of [this.rotating, this.fixed]) {
      if (!mesh) continue;
      this.group.remove(mesh);
      mesh.geometry.dispose();
      mesh.dispose();
    }

    const parts: THREE.BufferGeometry[] = [];
    const tireTube = p.tireMm / 2000;
    parts.push(colored(new THREE.TorusGeometry(d.rimRadius + tireTube, tireTube, 14, 96), 0x1b1b1d));
    // Tread blocks so tire rotation is visible in daylight.
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const b = new THREE.BoxGeometry(0.012, 0.004, p.tireMm / 1000 * 0.7);
      b.translate(0, d.tireRadius - 0.001, 0);
      b.rotateZ(a);
      parts.push(colored(b, 0x2c2c30));
    }
    const rimInner = d.rimRadius - p.rimDepthMm / 1000;
    const rimShape = new THREE.Shape();
    rimShape.absarc(0, 0, d.rimRadius, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absarc(0, 0, rimInner, 0, Math.PI * 2, true);
    rimShape.holes.push(hole);
    const rim = new THREE.ExtrudeGeometry(rimShape, { depth: 0.02, bevelEnabled: false, curveSegments: 96 });
    rim.translate(0, 0, -0.01);
    parts.push(colored(rim, 0x8a8f98));
    // Valve stem marks the wheel's angle.
    const valve = new THREE.CylinderGeometry(0.003, 0.003, 0.03, 6);
    valve.translate(0, rimInner - 0.012, 0);
    parts.push(colored(valve, 0xc0a060));

    const hub = new THREE.CylinderGeometry(0.018, 0.018, 0.1, 20);
    hub.rotateX(Math.PI / 2);
    parts.push(colored(hub, 0x9aa0a8));
    for (const z of [-0.035, 0.035]) {
      const flange = new THREE.CylinderGeometry(0.03, 0.03, 0.004, 24);
      flange.rotateX(Math.PI / 2);
      flange.translate(0, 0, z);
      parts.push(colored(flange, 0x9aa0a8));
    }
    for (let i = 0; i < p.spokes; i++) {
      const a = (i / p.spokes) * Math.PI * 2;
      const z = i % 2 ? 0.035 : -0.035;
      const ha = a + (i % 4 < 2 ? 0.25 : -0.25); // tangential lacing
      const from = new THREE.Vector3(Math.cos(ha) * 0.028, Math.sin(ha) * 0.028, z);
      const to = new THREE.Vector3(Math.cos(a) * rimInner, Math.sin(a) * rimInner, 0);
      parts.push(colored(rod(from, to, 0.001), 0xb8bcc4));
    }

    // LED strips: strip s points at clockwise angle 2πs/N (matching the shader's convention).
    const sides = p.doubleSided ? [1, -1] : [1];
    for (let s = 0; s < p.stripCount; s++) {
      const a = -(s / p.stripCount) * Math.PI * 2;
      for (const side of sides) {
        const len = d.rEnd - d.rStart + 0.01;
        const strip = new THREE.BoxGeometry(len, 0.012, 0.003);
        strip.translate(d.rStart + len / 2 - 0.005, 0, side * (LED_Z - 0.003));
        strip.rotateZ(a);
        parts.push(colored(strip, 0x111114));
        for (let k = 0; k < d.ledsPerStrip; k++) {
          const die = new THREE.BoxGeometry(p.dieMm / 1000, p.dieMm / 1000, 0.0015);
          die.translate(ledRadius(p, d, s, k), 0, side * (LED_Z - 0.001));
          die.rotateZ(a);
          parts.push(colored(die, 0xe8e4d8));
        }
      }
    }
    const rotGeo = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
    this.rotating = new THREE.InstancedMesh(rotGeo, this.material, MAX_COPIES);

    // Fork: it translates with the bike but does not spin. The hall magnet sits hidden behind it
    // and the electronics behind the spokes, so neither is drawn.
    // Typical road geometry: the steering axis leans back at 73° from horizontal and passes 45 mm
    // behind the axle (fork offset). The crown sits on that axis at the axle-to-crown length.
    const forkParts: THREE.BufferGeometry[] = [];
    const head = (73 * Math.PI) / 180, offset = 0.045, axleToCrown = d.tireRadius + 0.03;
    const up = new THREE.Vector2(-Math.cos(head), Math.sin(head));     // along the steering axis
    const fwd = new THREE.Vector2(Math.sin(head), Math.cos(head));     // perpendicular, forward
    const onAxis = fwd.clone().multiplyScalar(-offset);                // axis point nearest the axle
    const along = -onAxis.dot(up) + Math.sqrt(onAxis.dot(up) ** 2 - onAxis.lengthSq() + axleToCrown ** 2);
    const crown = onAxis.clone().addScaledVector(up, along);
    // Crown: a solid block square to the steering axis, spanning both legs, with its underside at
    // the axle-to-crown point. The legs run up into it so the joint is closed from every angle.
    const crownH = 0.028, crownW = 0.04, crownD = 0.12;
    const crownBox = new THREE.BoxGeometry(crownW, crownH, crownD);
    crownBox.rotateZ(Math.PI / 2 - head);
    const crownMid = crown.clone().addScaledVector(up, crownH / 2);
    crownBox.translate(crownMid.x, crownMid.y, 0);
    forkParts.push(colored(crownBox, 0x3a5a8a));
    const legTop = crown.clone().addScaledVector(up, crownH * 0.75);
    for (const z of [-0.055, 0.055]) {
      forkParts.push(colored(rod(new THREE.Vector3(0, 0, z), new THREE.Vector3(legTop.x, legTop.y, z * 0.8), 0.008, 12, true), 0x3a5a8a));
    }
    const forkGeo = mergeGeometries(forkParts.map((g) => (g.index ? g.toNonIndexed() : g)));
    this.fixed = new THREE.InstancedMesh(forkGeo, this.forkMaterial, MAX_COPIES);
    this.group.add(this.rotating, this.fixed);
  }

  /** Lay out blur copies at evenly spaced times across the exposure. */
  pose(times: number[], angleAt: (t: number) => number, hubAt: (t: number) => number) {
    if (!this.rotating || !this.fixed) return;
    const k = Math.min(times.length, MAX_COPIES);
    const pos = new THREE.Vector3(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
    const z = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i < k; i++) {
      pos.set(hubAt(times[i]), 0, 0);
      q.setFromAxisAngle(z, -angleAt(times[i]));
      this.rotating.setMatrixAt(i, this.m.compose(pos, q, one));
      q.identity();
      this.fixed.setMatrixAt(i, this.m.compose(pos, q, one));
    }
    // The fork only needs blur copies when it moves during the exposure (ride-by). Otherwise one
    // solid copy is exact, and it writes depth so the LED light behind it is hidden.
    const hub0 = hubAt(times[0]);
    const forkMoves = times.slice(0, k).some((t) => Math.abs(hubAt(t) - hub0) > 1e-4);
    const forkCopies = forkMoves ? k : 1;
    this.rotating.count = k;
    this.fixed.count = forkCopies;
    this.rotating.instanceMatrix.needsUpdate = this.fixed.instanceMatrix.needsUpdate = true;
    setBlur(this.material, k);
    setBlur(this.forkMaterial, forkCopies);
  }
}

/**
 * k overlapping copies at alpha a stack to 1-(1-a)^k; pick a so full overlap is ~opaque.
 * Blurred copies can't write depth, or they would hide each other.
 */
function setBlur(material: THREE.Material, k: number) {
  const blur = k > 1;
  if (material.transparent !== blur) {
    material.transparent = blur;
    material.depthWrite = !blur;
    material.needsUpdate = true;
  }
  material.opacity = blur ? 1 - Math.pow(0.03, 1 / k) : 1;
}

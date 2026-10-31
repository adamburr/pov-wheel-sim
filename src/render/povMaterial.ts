import * as THREE from 'three';
import fragmentShader from './pov.frag.glsl?raw';
import { BANNER_LOWER, bannerLowerOf, brightnessScale, type Params, SHUTTERS, speedMps } from '../params';
import { type Derived, lanesFor } from '../sim/timing';
import { animSpecFor, type AnimSpec, MAX_SLICES, type Slice } from '../sim/firmware';
import { bannerTileM, type FrameStack } from '../image/polarize';

const vertexShader = /* glsl */ `
out vec3 vLocal;
void main() {
  vLocal = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

function layered(data: Uint8Array<ArrayBuffer>, w: number, h: number, depth: number) {
  const t = new THREE.DataArrayTexture(data, w, h, depth);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

// Front hub: flanges ±35 mm from the centre plane; spokes leave them at 28 mm radius and run in
// to the rim's centre plane. The strips lie radially on top of the spokes, so they tilt the same way.
export const FLANGE_Z = 0.035;
export const FLANGE_R = 0.028;
export const SPOKE_R = 0.001;
export const STRIP_T = 0.003;
export const DIE_T = 0.0015;
const RIM_SPOKE_END = 0.003; // the spokes meet the centre plane this far outside the rim's inner wall

/** Height of the spoke line above the centre plane at radius r (drive side; mirror for the other). */
export function spokeZ(d: Derived, r: number): number {
  const rimInner = d.rimWallR + RIM_SPOKE_END;
  return FLANGE_Z * Math.min(1, Math.max(0, (rimInner - r) / (rimInner - FLANGE_R)));
}

/** Tilt of the strips (and spokes) out of the wheel plane, in radians. */
export function stripTilt(d: Derived): number {
  return Math.atan(FLANGE_Z / (d.rimWallR + RIM_SPOKE_END - FLANGE_R));
}

/** Height of the LED faces at radius r: die on strip on spoke. */
export function ledFaceZ(d: Derived, r: number): number {
  return spokeZ(d, Math.max(r, d.rStart)) + SPOKE_R + STRIP_T + DIE_T;
}

/**
 * The LED light planes. Front faces the drive side (+z); the back plane carries the other
 * side's strips. Both share every uniform except the side.
 */
export class PovDisplay {
  readonly group = new THREE.Group();
  private sliceData = new Float32Array(MAX_SLICES * 3 * 4);
  private sliceTex = new THREE.DataTexture(this.sliceData, MAX_SLICES, 3, THREE.RGBAFormat, THREE.FloatType);
  private colTex = layered(new Uint8Array(4), 1, 1, 1);
  private bannerTex = layered(new Uint8Array(4), 1, 1, 1);
  private banner?: { width: number; height: number; pixelM: number };
  private frames = 1;
  private shared: Record<string, THREE.IUniform>;
  private front: THREE.Mesh;
  private back: THREE.Mesh;
  // Light-surface geometry per view (hub-locked cone, ride-by plane): both views render every frame.
  private planes = new Map<string, [THREE.BufferGeometry, THREE.BufferGeometry]>();

  constructor() {
    this.sliceTex.minFilter = this.sliceTex.magFilter = THREE.NearestFilter;
    this.shared = {
      uSlices: { value: this.sliceTex }, uSliceCount: { value: 0 },
      uCols: { value: this.colTex }, uC: { value: 1 },
      uStrips: { value: 1 }, uLeds: { value: 1 }, uRStart: { value: 0 }, uPitch: { value: 0.007 },
      uHalfW: { value: 0.003 }, uBackRow: { value: 0 }, uBackChain: { value: 0 },
      uLanes: { value: 1 }, uLatchBase: { value: 0 }, uLatchPerLed: { value: 0 },
      uPwmPeriod: { value: 0 }, uPwmPhase: { value: 0 }, uCurrentScale: { value: 1 },
      uT: { value: 0.25 }, uTau: { value: 0 }, uGain: { value: 1 },
      uRideBy: { value: 0 }, uRRoll: { value: 0.34 }, uFalloff: { value: 0.5 },
      uFrames: { value: 1 }, uFrameTimed: { value: 1 }, uFps: { value: 12 },
      uBanner: { value: 0 }, uBannerTex: { value: this.bannerTex }, uBannerW: { value: 1 },
      uBannerTile: { value: 1 }, uBannerHalfH: { value: 0.3 }, uBannerMirror: { value: 0 }, uPredict: { value: 1 },
      uLower: { value: 0 }, uBannerRide: { value: 0 }, uSpinRate: { value: 0 }, uSpinPhase: { value: 0 },
    };
    const make = (side: number) => new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader, fragmentShader,
      uniforms: { ...this.shared, uSide: { value: side }, uCamLocal: { value: new THREE.Vector3() } },
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    this.front = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), make(1));
    this.back = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), make(-1));
    this.front.renderOrder = this.back.renderOrder = 10;
    this.front.frustumCulled = this.back.frustumCulled = false;
    this.group.add(this.front, this.back);
  }

  /** Firmware column buffers, one array-texture layer per animation frame. */
  setColumns(stack: FrameStack) {
    this.colTex.dispose();
    this.colTex = layered(stack.data, stack.width, stack.height, stack.frames);
    this.shared.uCols.value = this.colTex;
    this.frames = stack.frames;
  }

  setBanner(stack: FrameStack, pixelM: number) {
    this.banner = { width: stack.width, height: stack.height, pixelM };
    this.bannerTex.dispose();
    this.bannerTex = layered(stack.data, stack.width, stack.height, stack.frames);
    this.shared.uBannerTex.value = this.bannerTex;
  }

  /** Distance between banner tiles along the road, or 0 when there is no banner yet. */
  bannerTile(p: Params): number {
    return this.banner ? bannerTileM(this.banner, p.tileGapM) : 0;
  }

  /**
   * The light surface sits just in front of the LED faces. Hub-locked, that is a shallow cone
   * following the strips' tilt; ride-by sweeps the whole track, so it uses a flat plane at the
   * mid-strip height.
   */
  private ensurePlane(p: Params, d: Derived) {
    const R = d.rEnd + 0.02;
    const rideBy = p.view === 'ride-by';
    const key = `${p.view}|${R}|${rideBy ? p.trackLengthM : 0}|${d.rStart}|${d.rimWallR}`;
    let pair = this.planes.get(key);
    if (!pair) {
      // Settings or the window changed: drop stale shapes (the other view rebuilds its own).
      if (this.planes.size >= 4) {
        for (const [g1, g2] of this.planes.values()) { g1.dispose(); g2.dispose(); }
        this.planes.clear();
      }
      const w = rideBy ? p.trackLengthM + 2 * R : 2 * R;
      const midZ = ledFaceZ(d, 0.5 * (d.rStart + d.rEnd));
      const make = (side: number) => {
        const g = rideBy ? new THREE.PlaneGeometry(w, 2 * R) : new THREE.PlaneGeometry(w, 2 * R, 96, 96);
        const pos = g.getAttribute('position');
        for (let i = 0; i < pos.count; i++) {
          const z = rideBy ? midZ : ledFaceZ(d, Math.hypot(pos.getX(i), pos.getY(i)));
          pos.setZ(i, side * (z + 0.0005));
        }
        return g;
      };
      pair = [make(1), make(-1)];
      this.planes.set(key, pair);
    }
    this.front.geometry = pair[0];
    this.back.geometry = pair[1];
  }

  /**
   * Live frames (water): a ring of `frames` layers that are rewritten in place. Only the
   * layers listed are uploaded.
   */
  setLiveLayers(data: Uint8Array<ArrayBuffer>, width: number, height: number, frames: number, changed: number[]) {
    const img = this.colTex.image as { width: number; height: number; depth: number; data: Uint8Array };
    if (img.width !== width || img.height !== height || img.depth !== frames || img.data !== data) {
      this.colTex.dispose();
      this.colTex = layered(data, width, height, frames);
      this.shared.uCols.value = this.colTex;
    } else {
      for (const l of changed) this.colTex.addLayerUpdate(l);
      this.colTex.needsUpdate = true;
    }
    this.frames = frames;
  }

  update(p: Params, d: Derived, slices: Slice[], tRef: number, camera: THREE.Camera, anim?: AnimSpec) {
    this.ensurePlane(p, d);
    const u = this.shared;
    const n = Math.min(slices.length, MAX_SLICES);
    for (let i = 0; i < n; i++) {
      const s = slices[i];
      const o = i * 4, o2 = (MAX_SLICES + i) * 4, o3 = (2 * MAX_SLICES + i) * 4;
      this.sliceData[o] = s.t0 - tRef;
      this.sliceData[o + 1] = s.t1 - tRef;
      this.sliceData[o + 2] = s.phi0;
      this.sliceData[o + 3] = s.omega;
      this.sliceData[o2] = s.P < 0 ? s.m : s.m - tRef;
      this.sliceData[o2 + 1] = s.P;
      this.sliceData[o2 + 2] = s.enabled ? 1 : 0;
      this.sliceData[o2 + 3] = s.hubX0;
      this.sliceData[o3] = s.delta0;
      this.sliceData[o3 + 1] = s.deltaRate;
      this.sliceData[o3 + 2] = s.hubWorld0;
      this.sliceData[o3 + 3] = s.frame0;
    }
    this.sliceTex.needsUpdate = true;
    u.uSliceCount.value = n;

    const independent = p.backData === 'independent';
    u.uC.value = p.columnsPerRev;
    u.uStrips.value = p.stripCount;
    u.uLeds.value = d.ledsPerStrip;
    u.uRStart.value = d.rStart;
    u.uPitch.value = d.pitch;
    u.uHalfW.value = d.halfWidth;
    u.uBackRow.value = independent ? p.stripCount * d.ledsPerStrip : 0;
    u.uBackChain.value = independent ? p.stripCount : 0;
    u.uLanes.value = lanesFor(d.stripUnits);
    u.uLatchBase.value = d.latchBaseS;
    u.uLatchPerLed.value = d.latchPerLedS;

    const pwmP = p.pwmHz > 0 ? 1 / p.pwmHz : 0;
    u.uPwmPeriod.value = pwmP;
    u.uPwmPhase.value = pwmP ? tRef % pwmP : 0;
    // the SK9822's global brightness sets its current, so it scales the light without a slower PWM
    u.uCurrentScale.value = (p.globalBrightness / 31) * brightnessScale(p);

    const eye = p.exposureModel === 'eye';
    u.uT.value = SHUTTERS[p.shutter];
    u.uTau.value = eye ? p.eyeTauMs / 1000 : 0;
    // Exposure: 1.0 ≈ a fully lit disc at mid-strip radius. Auto mode compensates shutter and strip
    // count like a camera's auto exposure; otherwise exposure is fixed at an ISO calibrated for 1/30 s.
    const rMid = 0.5 * (d.rStart + d.rEnd);
    const duty = (2 * d.halfWidth) / (2 * Math.PI * rMid);
    const auto = p.autoExposure || eye;
    const strips = auto ? p.stripCount : 3;
    const shutterGain = auto ? 1 : SHUTTERS[p.shutter] * 30;
    // A roadside camera only gets light at a given spot while the wheel is passing it, so its
    // auto exposure also compensates for that fraction of the shutter time.
    const exposure = eye ? p.eyeTauMs / 1000 : SHUTTERS[p.shutter];
    const passGain = auto && p.view === 'ride-by' ? Math.max(1, (speedMps(p) * exposure) / (2 * d.rEnd)) : 1;
    u.uGain.value = (0.35 / (duty * strips)) * shutterGain * passGain;

    u.uRideBy.value = p.view === 'ride-by' ? 1 : 0;
    const spec = anim ?? animSpecFor(p, this.frames);
    u.uFrames.value = spec.frames;
    u.uFrameTimed.value = spec.timed ? 1 : 0;
    u.uFps.value = spec.fps;
    u.uBanner.value = p.displayMode === 'banner' && this.banner && !anim?.live ? 1 : 0;
    if (this.banner) {
      u.uBannerW.value = this.banner.width * this.banner.pixelM;
      u.uBannerTile.value = bannerTileM(this.banner, p.tileGapM);
      u.uBannerHalfH.value = (this.banner.height * this.banner.pixelM) / 2;
    }
    u.uBannerMirror.value = independent && p.backSide === 'reads' ? 1 : 0;
    u.uPredict.value = p.predictMotion ? 1 : 0;
    u.uLower.value = BANNER_LOWER.indexOf(bannerLowerOf(p));
    u.uBannerRide.value = p.bannerUpper === 'bike' ? 1 : 0;
    // Spin applies to wheel-locked pictures (not live water or banners).
    const spin = p.displayMode === 'wheel' && !spec.live && p.spinSeconds !== 0 ? 1 / p.spinSeconds : 0;
    u.uSpinRate.value = spin;
    u.uSpinPhase.value = spin ? (((tRef * spin) % 1) + 1) % 1 : 0;
    u.uRRoll.value = d.tireRadius;

    for (const m of [this.front, this.back]) {
      const cam = (m.material as THREE.ShaderMaterial).uniforms.uCamLocal.value as THREE.Vector3;
      m.updateWorldMatrix(true, false);
      cam.copy(camera.position);
      m.worldToLocal(cam);
    }
  }
}

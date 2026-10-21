import * as THREE from 'three';
import fragmentShader from './pov.frag.glsl?raw';
import { LEDS, type Params, playbackFps, SHUTTERS, speedMps } from '../params';
import type { Derived } from '../sim/timing';
import { MAX_SLICES, type Slice } from '../sim/firmware';
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

export const LED_Z = 0.009; // LED faces sit ~9 mm either side of the wheel's centre plane

/**
 * The LED light plane(s). Front faces the drive side (+z); the back plane carries the
 * back-to-back strips when double-sided. Both share every uniform except the side.
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
  private planeKey = '';

  constructor() {
    this.sliceTex.minFilter = this.sliceTex.magFilter = THREE.NearestFilter;
    this.shared = {
      uSlices: { value: this.sliceTex }, uSliceCount: { value: 0 },
      uCols: { value: this.colTex }, uC: { value: 1 },
      uStrips: { value: 1 }, uLeds: { value: 1 }, uRStart: { value: 0 }, uPitch: { value: 0.007 },
      uHalfW: { value: 0.003 }, uStagger: { value: 0 }, uBackRow: { value: 0 }, uBackChain: { value: 0 },
      uLanes: { value: 1 }, uLatchBase: { value: 0 }, uLatchPerLed: { value: 0 },
      uPwmPeriod: { value: 0 }, uPwmPhase: { value: 0 }, uGbPeriod: { value: 0 }, uGbDuty: { value: 1 },
      uGbPhase: { value: 0 }, uCurrentScale: { value: 1 }, uOverflowBlank: { value: 0 },
      uT: { value: 0.25 }, uTau: { value: 0 }, uGain: { value: 1 },
      uRideBy: { value: 0 }, uRRoll: { value: 0.34 }, uFalloff: { value: 0.5 },
      uFrames: { value: 1 }, uFrameTimed: { value: 1 }, uFps: { value: 12 },
      uBanner: { value: 0 }, uBannerTex: { value: this.bannerTex }, uBannerW: { value: 1 },
      uBannerTile: { value: 1 }, uBannerHalfH: { value: 0.3 }, uBannerMirror: { value: 0 }, uPredict: { value: 1 },
    };
    const make = (side: number) => new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader, fragmentShader,
      uniforms: { ...this.shared, uSide: { value: side }, uCamLocal: { value: new THREE.Vector3() } },
      blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    this.front = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), make(1));
    this.back = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), make(-1));
    this.front.position.z = LED_Z;
    this.back.position.z = -LED_Z;
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

  private ensurePlane(p: Params, d: Derived) {
    const R = d.rEnd + 0.02;
    const key = `${p.view}|${R}|${p.trackLengthM}`;
    if (key === this.planeKey) return;
    this.planeKey = key;
    const w = p.view === 'ride-by' ? p.trackLengthM + 2 * R : 2 * R;
    for (const m of [this.front, this.back]) {
      m.geometry.dispose();
      m.geometry = new THREE.PlaneGeometry(w, 2 * R);
    }
  }

  update(p: Params, d: Derived, slices: Slice[], tRef: number, camera: THREE.Camera) {
    this.ensurePlane(p, d);
    const led = LEDS[p.ledType];
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

    const independent = p.doubleSided && p.backData === 'independent';
    u.uC.value = p.columnsPerRev;
    u.uStrips.value = p.stripCount;
    u.uLeds.value = d.ledsPerStrip;
    u.uRStart.value = d.rStart;
    u.uPitch.value = d.pitch;
    u.uHalfW.value = d.halfWidth;
    u.uStagger.value = p.radialStagger ? 1 : 0;
    u.uBackRow.value = independent ? p.stripCount * d.ledsPerStrip : 0;
    u.uBackChain.value = independent ? p.stripCount : 0;
    u.uLanes.value = Math.max(1, Math.min(p.lanes, d.stripUnits));
    u.uLatchBase.value = d.latchBaseS;
    u.uLatchPerLed.value = d.latchPerLedS;

    const pwmP = p.pwmHz > 0 ? 1 / p.pwmHz : 0;
    u.uPwmPeriod.value = pwmP;
    u.uPwmPhase.value = pwmP ? tRef % pwmP : 0;
    const slowGb = led.gbMode === 'pwm' && p.globalBrightness < 31 && p.gbPwmHz > 0;
    const gbP = slowGb ? 1 / p.gbPwmHz : 0;
    u.uGbPeriod.value = gbP;
    u.uGbPhase.value = gbP ? tRef % gbP : 0;
    u.uGbDuty.value = p.globalBrightness / 31;
    u.uCurrentScale.value = led.gbMode === 'current' ? p.globalBrightness / 31 : 1;
    u.uOverflowBlank.value = p.syncMode === 'hall' && p.overflow === 'blank' ? 1 : 0;

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
    u.uFrames.value = this.frames;
    u.uFrameTimed.value = p.frameAdvance === 'timed' ? 1 : 0;
    u.uFps.value = playbackFps(p);
    u.uBanner.value = p.displayMode === 'banner' && this.banner ? 1 : 0;
    if (this.banner) {
      u.uBannerW.value = this.banner.width * this.banner.pixelM;
      u.uBannerTile.value = bannerTileM(this.banner, p.tileGapM);
      u.uBannerHalfH.value = (this.banner.height * this.banner.pixelM) / 2;
    }
    u.uBannerMirror.value = independent ? 1 : 0;
    u.uPredict.value = p.predictMotion ? 1 : 0;
    u.uRRoll.value = d.tireRadius;
    this.back.visible = p.doubleSided;

    for (const m of [this.front, this.back]) {
      const cam = (m.material as THREE.ShaderMaterial).uniforms.uCamLocal.value as THREE.Vector3;
      m.updateWorldMatrix(true, false);
      cam.copy(camera.position);
      m.worldToLocal(cam);
    }
  }
}

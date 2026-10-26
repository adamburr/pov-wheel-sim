// Geometric model of a laced bicycle wheel (default: 32-hole, 3-cross, symmetric front hub).
//
// Coordinates: x, y in the wheel plane (mm, hub centre at origin), z along the axle, +z = the
// RIGHT side of the bike. Angles in degrees, counter-clockwise seen from the right.
//
// Model:
//  * Rim holes i = 0..N-1 at angle i·360/N. Holes alternate flanges: even → LEFT, odd → RIGHT.
//    The valve hole is between holes N-1 and 0.
//  * Each flange has N/2 holes; the two flanges are offset by half a hole spacing.
//  * On each flange, spokes alternate between the two directions (leading / trailing) around the
//    rim; a k-cross spoke leaves the hub k·720/N degrees away from its rim hole.
//  * Heads-in spokes leave from the OUTER face of the flange, heads-out spokes from the INNER face
//    (flange thickness apart). Direction +1 = heads-in, -1 = heads-out.
//  * Spokes run straight to the rim at r = ERD/2, z = rim offset (plus optional offset drilling).
//  * At each spoke's outermost crossing the pair is interlaced: the heads-out spoke is bent
//    outboard over the heads-in spoke by about one spoke diameter, tapering over interlaceLen.
//
// Dimensions are TYPICAL VALUES, not measurements.
import { type Pt, rad, segIntersect } from './geom';

export interface WheelSpec {
  spokes: number;
  crosses: number;
  erd: number;             // effective rim diameter (spoke ends)
  rimWallR: number;        // radius of the rim's inner wall, where the nipples come out
  nippleExposed: number;   // nipple length showing inside the rim wall
  rimOffset: number;       // rim hole offset from the centre plane (symmetric rim = 0)
  offsetDrill: number;     // ± alternate hole offset of offset-drilled rims (0 = in line)
  pcdLeft: number; pcdRight: number;   // flange spoke-hole circle diameters
  c2fLeft: number; c2fRight: number;   // hub centre to flange centre
  flangeT: number;         // flange thickness
  flangeOuterExtra: number; // flange outer edge beyond the hole circle (radius)
  holeD: number;           // flange hole diameter
  spokeD: number;          // 2.0 = 14 g
  headH: number;           // spoke head height proud of the flange face
  old: number;             // over-locknut width
  interlaceLen: number;    // length over which the interlace bend fades (each way)
}

export const TYPICAL_FRONT: WheelSpec = {
  spokes: 32, crosses: 3, erd: 600, rimWallR: 296, nippleExposed: 6, rimOffset: 0, offsetDrill: 0,
  pcdLeft: 44, pcdRight: 44, c2fLeft: 35, c2fRight: 35, flangeT: 2.8, flangeOuterExtra: 4.5, holeD: 2.6,
  spokeD: 2, headH: 2, old: 100, interlaceLen: 35,
};

type P3 = [number, number, number];

export class Spoke {
  crossings: [number, number, number, number][] = []; // (t along the spoke 0..1, other spoke, x, y)
  interlace?: [number, number, number, number];        // (t, x, y, +1 outboard / -1 inboard)
  readonly length: number;
  constructor(
    readonly i: number, readonly side: -1 | 1, readonly direction: -1 | 1,
    readonly rimDeg: number, readonly hubDeg: number, readonly p0: P3, readonly p1: P3,
  ) {
    this.length = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
  }
  at(t: number): P3 {
    const { p0, p1 } = this;
    return [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t, p0[2] + (p1[2] - p0[2]) * t];
  }
  get a(): Pt { return [this.p0[0], this.p0[1]]; }
  get b(): Pt { return [this.p1[0], this.p1[1]]; }
}

export class Wheel {
  readonly p: WheelSpec;
  readonly holePitch: number;
  readonly spokes: Spoke[] = [];

  constructor(spec: Partial<WheelSpec> = {}) {
    const p = (this.p = { ...TYPICAL_FRONT, ...spec });
    const N = p.spokes;
    this.holePitch = 360 / N;
    const crossDeg = (p.crosses * 720) / N;
    const perSide = { [-1]: 0, [1]: 0 } as Record<number, number>;
    for (let i = 0; i < N; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const j = perSide[side]++;
      const direction = j % 2 === 0 ? 1 : -1;
      const rim = i * this.holePitch;
      const hub = rim + direction * crossDeg;
      const pcd = side < 0 ? p.pcdLeft : p.pcdRight;
      const c2f = side < 0 ? p.c2fLeft : p.c2fRight;
      const zf = side * (c2f + (direction * p.flangeT) / 2); // heads-in: outer face
      const r0 = pcd / 2, r1 = p.erd / 2;
      const zr = p.rimOffset + side * p.offsetDrill;
      this.spokes.push(new Spoke(i, side, direction, rim, ((hub % 360) + 360) % 360,
        [r0 * Math.cos(rad(hub)), r0 * Math.sin(rad(hub)), zf],
        [r1 * Math.cos(rad(rim)), r1 * Math.sin(rad(rim)), zr]));
    }
    this.findCrossings();
  }

  private findCrossings() {
    const S = this.spokes;
    for (let a = 0; a < S.length; a++) {
      for (let b = a + 1; b < S.length; b++) {
        const A = S[a], B = S[b];
        if (A.side !== B.side || A.direction === B.direction) continue;
        const hit = segIntersect(A.a, A.b, B.a, B.b);
        if (!hit) continue;
        const [ta, tb, x, y] = hit;
        A.crossings.push([ta, b, x, y]);
        B.crossings.push([tb, a, x, y]);
      }
    }
    for (const s of S) {
      s.crossings.sort((u, v) => u[0] - v[0]);
      const last = s.crossings.at(-1);
      if (last) s.interlace = [last[0], last[2], last[3], s.direction < 0 ? 1 : -1]; // outermost crossing
    }
  }

  /** |z| of the spoke's OUTBOARD surface at parameter t (interlace bend included). */
  surfaceZ(s: Spoke, t: number): number {
    let z = Math.abs(s.at(t)[2]) + this.p.spokeD / 2;
    if (s.interlace) {
      const [ti, , , sgn] = s.interlace;
      const d = Math.abs(t - ti) * s.length;
      z += ((sgn * this.p.spokeD) / 2) * Math.max(0, 1 - d / this.p.interlaceLen);
    }
    return z;
  }

  sideSpokes(side: number) { return this.spokes.filter((s) => s.side === side); }
  valveDeg() { return -this.holePitch / 2; }
  nippleTipR() { return this.p.rimWallR - this.p.nippleExposed; }
  flangeOuterR(side: number) { return (side < 0 ? this.p.pcdLeft : this.p.pcdRight) / 2 + this.p.flangeOuterExtra; }

  /** Standard spoke-length formula (for comparison with measured spokes). */
  spokeLengthFormula(side: number): number {
    const p = this.p;
    const pcd = side < 0 ? p.pcdLeft : p.pcdRight, c2f = side < 0 ? p.c2fLeft : p.c2fRight;
    const R = p.erd / 2, r = pcd / 2, a = rad((p.crosses * 720) / p.spokes);
    return Math.sqrt(R * R + r * r + c2f * c2f - 2 * R * r * Math.cos(a)) - p.holeD / 2;
  }

  /** Lacing invariants: unique flange holes, crossings per spoke, spoke lengths. */
  check() {
    const res: Record<string, unknown> = {};
    const round1 = (v: number) => Math.round(v * 10) / 10;
    for (const [side, name] of [[-1, 'left'], [1, 'right']] as const) {
      const ss = this.sideSpokes(side);
      res[`${name}FlangeHolesUnique`] = new Set(ss.map((s) => s.hubDeg.toFixed(2))).size === this.p.spokes / 2;
      res[`${name}CrossingsPerSpoke`] = [...new Set(ss.map((s) => s.crossings.length))].sort();
      const ls = ss.map((s) => s.length);
      res[`${name}SpokeLenModel`] = [round1(Math.min(...ls)), round1(Math.max(...ls))];
      res[`${name}SpokeLenFormula`] = round1(this.spokeLengthFormula(side));
    }
    return res;
  }
}

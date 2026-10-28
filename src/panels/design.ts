// Spoke-tied LED panels for a front-wheel POV display.
//
// Two flat-cut panels (thin polypropylene by default), one each side of the wheel, lie on that
// side's spokes and are zip-tied to them. Each is a circular disc round the hub that reaches a
// spoke cross, tied at every crossing there, plus N straight radial blades from the disc to the rim,
// one per LED strip, evenly spaced whatever the spoke pattern. Each strip is held by its own tie
// holes, pairs on the strip's edges every few pixels (between LEDs). The blades are tied to the
// spokes by separate hole pairs that straddle a spoke beside the strip, on a tab where the spoke
// runs outside the blade: one pair near each tip, and more along the blade so no stretch is longer
// than asked.
//
// designPanels() turns the blades (all together) for the smallest tabs, places the ties, lays the
// flat part onto the dished spokes (the flat part is a little longer than its plan, by the slope),
// and checks the fork, the valve and the nipples. See docs/panels.md for the design notes.
//
// Wheel dimensions other than the bore and tip radius are TYPICAL VALUES until measured.
import {
  adiff, arcMerge, box, type BulgePt, ccw, circlePts, clamp, cleanRing, convexHull, deg, densify, dist, filletRing, mirrorPt,
  outlineOf, pmod, pointSegDist, pol, type Pt, rad, rectPts, Ring, rot, rotRing,
} from './geom';
import { type Material, MATERIALS } from './materials';
import { type Spoke, Wheel, type WheelSpec } from './wheel';

export { MATERIALS };

export interface PanelSpec {
  strips: number;           // LED strips (blades) per side, evenly spaced
  material: string;
  stripW: number; stripT: number; ledPitch: number; // LED strip in its sleeve, and its pixel pitch
  boreD: number;            // centre hole, round the hub body outboard of the flange
  tipEndR: number | null;   // radius of the blade tips on the wheel; null = just inside the rim wall
  tipClear: number;         // tip-end corners inside the rim wall
  tipSlot: 'auto' | 'none'; // a nipple under a tip: slot the tip round it, or stop every blade short of the nipples
  nippleD: number;          // nipple shank diameter (typical 14 g brass)
  tipSlotClear: number;     // slot bottom this far inside the nipple's inner end
  bladeW: number;           // blade width; 0 = the narrowest that holds the strip ties
  cornerR: number;          // radius on every outline corner
  tieW: number; tieT: number;          // zip tie strap
  tieHead: [number, number, number];   // tie head: width, length, height
  tieClear: number;         // square hole = tie width + this
  holesEvery: number;       // strip ties every N LED pixels, between pixels
  gridEdge: number;         // material from a hole to an edge, and between ties
  stripStartGap: number;    // first LED at least this far outside the bore
  discCross: number;        // the disc reaches this spoke cross (1 = nearest the hub; 0 = the outermost, interlaced one) and is tied at every crossing there
  discRadialR: number;      // radial lacing (no crosses): the disc's ties straddle each spoke this far out from the flange's hole circle
  spokeGap: number;         // spoke ties: room between the spoke and each hole of the pair
  tieSpan: number;          // longest stretch of blade between spoke ties (the disc's ties count)
  tipTieZone: number;       // the outermost spoke tie is within this of the tip end
  earMax: number;           // farthest a tab reaches beyond the blade's edge for a spoke tie; 0 = half the gap between one side's spokes at the rim
  valveD: number; valveLen: number; valveClear: number; // valve stem (with its nut) inside the rim, and the room it needs
  sensor: boolean;          // a hall switch beside every strip, on the outer face, tied on
  sensorGap: number;        // from the strip's edge to the sensor's body (clear of the strip ties, their heads and the strip's wiring)
  sensorBody: [number, number, number]; // body width (across the blade) × length (along it) × thickness
  sensorLeads: number;      // its leads run this far toward the hub, past the body
  ledMa: number;            // most current one LED draws (full white)
  stripTraceSep: number;    // the strip's supply and ground run this far apart (for the stray field)
  sensorReleaseMT: number;  // the switch's lowest release point: the strip's field must stay far under it
  wireHoleD: number;        // a round hole per strip in the disc, by the strip's inner end, for its and its sensor's wires to the inner side (0 = none)
  forkCrownR: number; forkCrownHalf: number; minForkClear: number; // straight fork blades, dropouts (OLD/2) to crown
}

export const PANEL_DEFAULTS: PanelSpec = {
  strips: 3, material: 'pp_08',
  // Adafruit DotStar 144 LED/m black (product 2241, SK9822): 14 mm wide × 4 mm in its weatherproof sleeve
  stripW: 14, stripT: 4, ledPitch: 1000 / 144,
  boreD: 38.1, tipEndR: 298.45, tipClear: 3, tipSlot: 'auto', nippleD: 4, tipSlotClear: 1,
  bladeW: 0, cornerR: 2,
  // 40 lb (178 N, 3.6 × 1.27 mm) and 18 lb (80 N, 2.4 × 1.1 mm) ties both fit the 4.6 mm holes.
  tieW: 3.6, tieT: 1.27, tieHead: [6.0, 5.9, 4.3], tieClear: 1,
  holesEvery: 2, gridEdge: 4, stripStartGap: 3,
  discCross: 0, discRadialR: 30, spokeGap: 0.5, tieSpan: 80, tipTieZone: 30, earMax: 0,
  valveD: 8, valveLen: 35, valveClear: 3,
  // Melexis US5881LUA unipolar hall switch (Adafruit 158): 4.08 × 3.00 × 1.51 mm, marked face out. It
  // switches on at 15–30 mT and off at 9.5–28 mT (south pole). SK9822 / APA102: 20 mA per colour.
  sensor: true, sensorGap: 12, sensorBody: [4.08, 3.0, 1.51], sensorLeads: 14,
  ledMa: 60, stripTraceSep: 10, sensorReleaseMT: 9.5, wireHoleD: 6,
  forkCrownR: 340, forkCrownHalf: 22, minForkClear: 3,
};

export type Spec = PanelSpec & Material;
/** Strips per side the panels are made for. */
export const PANEL_STRIP_RANGE = [2, 3, 4];
export type HoleKind = 'strip' | 'spoke' | 'disc' | 'sensor' | 'wire';

export interface Hole {
  c: Pt;             // centre on the part
  a: number;         // the square's sides run along and across this angle
  kind: HoleKind;
  tie: number;       // the two holes of one tie share this (the four of a board, too)
  d?: number;        // a round hole of this diameter (screws), not a square one
  bulge: BulgePt[];
  ring: Ring;
}
type HoleSpec = Omit<Hole, 'bulge' | 'ring'>;

/**
 * A spoke tie on a blade: where it is on the wheel, the spoke, and how far its tab reaches past the
 * blade's edge. `across`: the spoke runs under the strip, so the tie goes over the strip between two
 * LEDs (its own holes, either side of the strip and the spoke).
 */
export interface SpokeTie { blade: number; r: number; spoke: number; sg: 1 | -1; earMm: number; across: boolean; holes: [Pt, Pt] }
/** A disc tie round a spoke crossing. */
export interface DiscTie { r: number; at: Pt; spokes: [number, number]; holes: [Pt, Pt] }

/** The panel as cut (flat). rho = distance from the centre on the flat sheet. */
export interface Flat {
  arms: number[]; bladeW: number; rBore: number; rhoDisc: number; rhoEnd: number;
  outlinePts: Pt[];        // straight-edged outline (the disc as short chords) before filleting
  outlineBulge: BulgePt[]; // filleted, with the disc as true arcs
  outline: Ring;           // filleted, sampled
  holes: Hole[];
  rhoLed0: number; rhoLed1: number; nLeds: number;
  stripTieRhos: number[][]; // each blade's strip ties
  slots: { blade: number; rimHole: number }[];
  /**
   * Hall switches beside the strips: the blade, where along it and across it (the body's centre), on
   * the disc or on a tab, and the strip's stray field there at full white (µT).
   */
  sensors: { blade: number; rho: number; e: number; onDisc: boolean; fieldUT: number }[];
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
/** Compare two keys element by element, like Python tuples. */
const lexCmp = (a: number[], b: number[]) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
};

export const holeSize = (pp: Spec) => pp.tieW + pp.tieClear;
/** Strip ties: hole centres on the strip's edges. */
export const rowOffset = (pp: PanelSpec) => pp.stripW / 2;
/** Narrowest blade: the strip ties plus gridEdge outside them. */
export const minBladeW = (pp: Spec) => Math.ceil(2 * (rowOffset(pp) + holeSize(pp) / 2 + pp.gridEdge));
const HEAD_R = 2.5; // spoke heads on the flange face

// ---------------------------------------------------------------- shape queries
export const bodyContains = (g: Flat, p: Pt) => Math.hypot(...p) > g.rBore && g.outline.contains(p);
export function shapeContains(g: Flat, p: Pt): boolean {
  if (!bodyContains(g, p)) return false;
  for (const h of g.holes) {
    const b = h.ring.bbox;
    if (p[0] >= b.x0 && p[0] <= b.x1 && p[1] >= b.y0 && p[1] <= b.y1 && h.ring.contains(p)) return false;
  }
  return true;
}
function polyArea(r: Pt[]) {
  let s = 0;
  for (let i = 0; i < r.length; i++) s += r[i][0] * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * r[i][1];
  return s / 2;
}
export const bodyArea = (g: Flat) => Math.abs(polyArea(g.outline.pts)) - Math.PI * g.rBore ** 2;
export const shapeArea = (g: Flat) => bodyArea(g) - g.holes.reduce((s, h) => s + Math.abs(polyArea(h.ring.pts)), 0);

// ---------------------------------------------------------------- the dished surface the panel lies on
/** The panel's inner face on the wheel: its height |z| every dr of plan radius, and the flat radius that lands there. */
export interface Surface { dr: number; z: number[]; rho: number[] }

export function surfaceFns(s: Surface) {
  const n = s.z.length, rMax = (n - 1) * s.dr;
  const at = (arr: number[], r: number) => {
    const k = clamp(r / s.dr, 0, n - 1 - 1e-9), i = Math.floor(k);
    return arr[i] + (arr[i + 1] - arr[i]) * (k - i);
  };
  return {
    /** Height of the inner face at plan radius r. */
    zAt: (r: number) => at(s.z, r),
    /** Flat radius of the point that lies at plan radius r. */
    rhoOf: (r: number) => (r <= rMax ? at(s.rho, r) : s.rho[n - 1] + r - rMax),
    /** Plan radius of flat radius rho. */
    rOf: (rho: number) => {
      if (rho >= s.rho[n - 1]) return rMax + rho - s.rho[n - 1];
      let lo = 0, hi = n - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (s.rho[mid] <= rho) lo = mid; else hi = mid; }
      return (lo + (rho - s.rho[lo]) / (s.rho[hi] - s.rho[lo] || 1)) * s.dr;
    },
  };
}
export type SurfaceFns = ReturnType<typeof surfaceFns>;

const scaleTo = (p: Pt, r: number): Pt => { const L = Math.hypot(...p); return L > 1e-9 ? [(p[0] * r) / L, (p[1] * r) / L] : p; };
/** Flat point → where it lies on the wheel (plan view). */
export const toPlan = (sf: SurfaceFns, p: Pt): Pt => scaleTo(p, sf.rOf(Math.hypot(...p)));
/** Plan point → where it is on the flat part. */
export const toFlat = (sf: SurfaceFns, p: Pt): Pt => scaleTo(p, sf.rhoOf(Math.hypot(...p)));

/** Parameter t where spoke s (in plan) is at radius r, or null. */
function tAtRadius(s: Spoke, r: number): number | null {
  const [ax, ay] = s.a, dx = s.b[0] - ax, dy = s.b[1] - ay;
  const A = dx * dx + dy * dy, B = 2 * (ax * dx + ay * dy), C = ax * ax + ay * ay - r * r;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return null;
  const t = (-B + Math.sqrt(disc)) / (2 * A);
  return t >= 0 && t <= 1 ? t : null;
}

/**
 * The panel lies on the outboard faces of its side's spokes (and the spoke heads at the flange):
 * at each radius the highest of them, spanned straight across the dips (the upper hull).
 */
function surfaceOf(wh: Wheel, side: number, rMax: number): Surface {
  const dr = 0.5, rc = (side < 0 ? wh.p.pcdLeft : wh.p.pcdRight) / 2;
  const zHead = (side < 0 ? wh.p.c2fLeft : wh.p.c2fRight) + wh.p.flangeT / 2 + wh.p.headH;
  const own = wh.sideSpokes(side);
  const pts: Pt[] = [];
  for (let k = 0; k * dr <= rMax; k++) {
    const r = k * dr;
    let z = Math.abs(r - rc) <= HEAD_R ? zHead : -Infinity;
    for (const s of own) { const t = tAtRadius(s, r); if (t !== null) z = Math.max(z, wh.surfaceZ(s, t)); }
    if (z > -Infinity) pts.push([r, z]);
  }
  const hull: Pt[] = [];
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  for (const q of pts) {
    while (hull.length >= 2 && cross(hull[hull.length - 2], hull[hull.length - 1], q) >= 0) hull.pop();
    hull.push(q);
  }
  const z: number[] = [], rho: number[] = [];
  let h = 0;
  for (let k = 0; k * dr <= rMax; k++) {
    const r = k * dr;
    while (h + 1 < hull.length && hull[h + 1][0] <= r) h++;
    const [x0, z0] = hull[h], [x1, z1] = hull[Math.min(h + 1, hull.length - 1)];
    z.push(r <= x0 || x1 === x0 ? z0 : z0 + ((z1 - z0) * (r - x0)) / (x1 - x0));
    rho.push(k ? rho[k - 1] + Math.hypot(dr, z[k] - z[k - 1]) : 0);
  }
  return { dr, z, rho };
}

// ---------------------------------------------------------------- ties
// Holes are rebuilt for every design; the same hole always has the same shape.
let holeCache = new Map<string, { bulge: BulgePt[]; ring: Ring }>();
function holeAt(pp: Spec, h: HoleSpec): Hole {
  const s = holeSize(pp);
  const key = `${h.c[0].toFixed(6)},${h.c[1].toFixed(6)},${h.a.toFixed(6)},${h.d ?? s},${pp.cutCornerR}`;
  let f = holeCache.get(key);
  if (!f && h.d) { // a circle: two half-circle arcs
    const r = h.d / 2, [x, y] = h.c;
    f = { bulge: [[x + r, y, 1], [x - r, y, 1]], ring: new Ring(circlePts(r, 36, h.c)) };
    holeCache.set(key, f);
  } else if (!f) {
    const fr = filletRing(ccw(rectPts(h.c[0], h.c[1], h.a, s, s)), pp.cutCornerR);
    f = { bulge: fr.bulge, ring: new Ring(fr.sampled) };
    holeCache.set(key, f);
  }
  return { ...h, ...f };
}

/** Corners of a square of the given size centred on c, sides along angle a. */
const squareAt = (c: Pt, a: number, size: number) => rectPts(c[0], c[1], a, size, size);

/**
 * The disc's ties: one round each crossing at the disc's spoke cross, a hole either side of the
 * crossing in the wide angles between the two spokes, just far enough out to clear both. Radial
 * lacing has no crossings: there, one straddling each spoke, discRadialR out from the flange.
 * Ties too near the bore are left out.
 */
function discTiesOf(wh: Wheel, pp: Spec, side: number, sf: SurfaceFns): DiscTie[] {
  const h = holeSize(pp) / 2, need = wh.p.spokeD / 2 + pp.spokeGap, rBore = pp.boreD / 2;
  const unit = (s: Spoke): Pt => { const L = dist(s.a, s.b); return [(s.b[0] - s.a[0]) / L, (s.b[1] - s.a[1]) / L]; };
  const out: DiscTie[] = [];
  const add = (at: Pt, spokes: [number, number], w: Pt, q: number) => {
    const plan = [1, -1].map((sg) => [at[0] + sg * q * w[0], at[1] + sg * q * w[1]] as Pt);
    if (plan.some((p) => Math.hypot(...p) - h * Math.SQRT2 - rBore < pp.gridEdge)) return;
    out.push({ r: Math.hypot(...at), at, spokes, holes: plan.map((p) => toFlat(sf, p)) as [Pt, Pt] });
  };
  if (wh.p.crosses < 1) {
    const r = (side < 0 ? wh.p.pcdLeft : wh.p.pcdRight) / 2 + pp.discRadialR;
    for (const s of wh.sideSpokes(side)) {
      const t = tAtRadius(s, r);
      if (t === null) continue;
      const [x, y] = s.at(t), d = unit(s);
      add([x, y], [s.i, s.i], [-d[1], d[0]], need + h);
    }
  } else {
    const level = pp.discCross > 0 ? Math.min(pp.discCross, wh.p.crosses) : wh.p.crosses;
    const seen = new Set<string>();
    for (const s of wh.sideSpokes(side)) {
      const c = s.crossings[level - 1];
      if (!c) continue;
      const [, j, x, y] = c;
      const key = `${x.toFixed(3)},${y.toFixed(3)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const o = wh.spokes[j], d1 = unit(s), d2 = unit(o);
      let w: Pt = [d1[0] - d2[0], d1[1] - d2[1]]; // bisects the wide angle between the spokes
      const lw = Math.hypot(...w);
      w = [w[0] / lw, w[1] / lw];
      const q = Math.max(...[d1, d2].map((d) => {
        const n: Pt = [-d[1], d[0]];
        const ext = h * (Math.abs(w[0] * n[0] + w[1] * n[1]) + Math.abs(-w[1] * n[0] + w[0] * n[1]));
        return (need + ext) / Math.abs(d[0] * w[1] - d[1] * w[0]);
      }));
      add([x, y], [s.i, o.i], w, q);
    }
  }
  return out.sort((a, b) => pmod(deg(Math.atan2(a.at[1], a.at[0])), 360) - pmod(deg(Math.atan2(b.at[1], b.at[0])), 360));
}
const discTieAngle = (t: DiscTie) => deg(Math.atan2(t.holes[1][1] - t.holes[0][1], t.holes[1][0] - t.holes[0][0]));

/** A place a blade could be tied to a spoke: plan position along the blade (x) and across it (e). */
interface Cand { x: number; e: number; psi: number; spoke: number; sg: 1 | -1; ear: number; across: boolean; lo: number; hi: number; holes: [Pt, Pt] }

interface Ctx {
  wh: Wheel; pp: Spec; bladeW: number; rEnd: number; xMax: number;
  side: Record<number, { surface: Surface; sf: SurfaceFns; ties: DiscTie[]; rDisc: number; rSupport: number }>;
}

/**
 * Every place along a blade at angle a where a hole pair straddling one of the side's spokes fits
 * beside the strip ties (on a tab, if the spoke is outside the blade), sampled every 2 mm. Where a
 * spoke runs under the strip, or none will do beside it, a tie across the strip at a pixel gap with no
 * strip tie: `gaps` are those gaps (plan radius along the blade).
 */
function spokeTieCands(c: Ctx, side: number, a: number, gaps: number[]): Cand[] {
  const { wh, pp } = c, own = wh.sideSpokes(side);
  const u: Pt = [Math.cos(rad(a)), Math.sin(rad(a))], n: Pt = [-u[1], u[0]];
  const hole = holeSize(pp), h = hole / 2, need = wh.p.spokeD / 2 + pp.spokeGap, p = need + h, edge = pp.gridEdge;
  const eIn = rowOffset(pp) + h + edge, wHalf = c.bladeW / 2;
  const { rSupport: xMin, sf, ties } = c.side[side], out: Cand[] = [];
  const at = (x: number, e: number): Pt => [x * u[0] + e * n[0], x * u[1] + e * n[1]];
  // the disc's ties, in plan: a spoke tie may sit over the disc's edge, clear of them
  const discHoles = ties.flatMap((t) => t.holes.map((q) => toPlan(sf, q)));
  // a tie can't go down through a hole that another spoke runs under
  const blocked = (s: Spoke, holes: Pt[]) => own.some((o) => o !== s && holes.some((q) => pointSegDist(q, o.a, o.b) < h * Math.SQRT2 + wh.p.spokeD / 2))
    || holes.some((q) => discHoles.some((dq) => dist(q, dq) < hole * Math.SQRT2 + edge));
  // near the rim, the tab stays inside the rim wall and clear of every nipple (either side's)
  const rimIn = wh.p.rimWallR - pp.tipClear, padR = h * Math.SQRT2 + edge, nipR = wh.nippleTipR() - padR - pp.nippleD / 2;
  const nipples = wh.spokes.map((sp) => [pol(wh.nippleTipR(), sp.rimDeg), pol(wh.p.rimWallR, sp.rimDeg)] as [Pt, Pt]);
  const nearNipple = (holes: Pt[]) => holes.some((q) => Math.hypot(...q) > nipR && nipples.some(([na, nb]) => pointSegDist(q, na, nb) < padR + pp.nippleD / 2));
  for (const s of own) {
    const au = s.a[0] * u[0] + s.a[1] * u[1], bu = s.b[0] * u[0] + s.b[1] * u[1];
    const ae = s.a[0] * n[0] + s.a[1] * n[1], be = s.b[0] * n[0] + s.b[1] * n[1];
    const du = bu - au, de = be - ae, L = Math.hypot(du, de);
    if (du / L < 0.5) continue; // runs across the blade, or away from it
    const cs = du / L, sn = de / L, hh = h * (Math.abs(cs) + Math.abs(sn));
    const eAt = (x: number) => ae + ((x - au) / du) * de;
    const x0 = Math.max(xMin, au), x1 = Math.min(c.xMax, bu);
    // beside the strip: the pair straddles the spoke square to it
    const rad_ = p * Math.abs(sn) + hh + edge;
    for (let x = Math.ceil(x0); x <= x1; x += 2) {
      const e = eAt(x), ae_ = Math.abs(e);
      if (ae_ - p * cs - hh < eIn) continue; // must clear the strip ties
      const outer = ae_ + p * cs + hh + edge, ear = outer - wHalf;
      if (ear > pp.earMax) continue;
      const lo = x - rad_, hi = x + rad_;
      if (lo < xMin || Math.hypot(hi, outer) > rimIn) continue;
      const holes = [1, -1].map((k) => at(x - k * p * sn, e + k * p * cs)) as [Pt, Pt];
      if (blocked(s, holes) || nearNipple(holes)) continue;
      out.push({ x, e, psi: deg(Math.atan2(sn, cs)), spoke: s.i, sg: e < 0 ? -1 : 1, ear: Math.max(0, ear), across: false, lo, hi, holes });
    }
    // across the blade: one hole on the strip's far edge, one past the spoke (the spoke under the strip,
    // or beside the blade on a tab), the band over the strip between two LEDs. It holds both edges.
    const off = (need + hh) / cs;
    for (const x of gaps) {
      if (x < x0 || x > x1) continue;
      const e = eAt(x);
      const e1 = Math.min(-rowOffset(pp), e - off), e2 = Math.max(rowOffset(pp), e + off);
      const outer = Math.max(-e1, e2) + h + edge, ear = outer - wHalf;
      const lo = x - h - edge, hi = x + h + edge;
      if (ear > pp.earMax || lo < xMin || Math.hypot(hi, outer) > rimIn) continue;
      const holes: [Pt, Pt] = [at(x, e1), at(x, e2)];
      if (blocked(s, holes) || nearNipple(holes)) continue;
      out.push({ x, e, psi: 0, spoke: s.i, sg: e < 0 ? -1 : 1, ear: Math.max(0, ear), across: true, lo, hi, holes });
    }
  }
  return out;
}

/**
 * Spoke ties for one blade, so each edge is held (against flutter): for each edge in turn (the one
 * with fewer places for a tab first), the
 * smallest tab within tipTieZone of the tip (the farthest out, of equals), then working inward, the
 * smallest tab within tieSpan of the last one (the farthest in, of equals), until the disc's ties are
 * within reach. A tie across the strip holds both edges: one already chosen is used first, and a new
 * one only where no tab will do. `gaps` counts the stretches no tie could cover.
 */
function chooseTies(c: Ctx, side: number, cands: Cand[]): { ties: Cand[]; gaps: number } {
  const { pp } = c, support = c.side[side].rSupport, edge = pp.gridEdge;
  const ties: Cand[] = [];
  const clash = (a: Cand, b: Cand) => a.lo < b.hi + edge && b.lo < a.hi + edge && (a.across || b.across || a.sg === b.sg);
  const pick = (list: Cand[], out: boolean) => {
    const had = list.filter((x) => ties.includes(x)), beside = list.filter((x) => !x.across);
    const key = (x: Cand) => [Math.ceil(x.ear / 5), out ? -x.x : x.x]; // tabs within 5 mm count as the same
    return (had.length ? had : beside.length ? beside : list).reduce((b, x) => (lexCmp(key(x), key(b)) < 0 ? x : b));
  };
  let gaps = 0;
  // the edge with fewer places for a tab of its own goes first: its ties across the strip then hold the other edge too
  const beside = (sg: number) => cands.filter((x) => !x.across && x.sg === sg).length;
  for (const sg of beside(1) <= beside(-1) ? [1, -1] : [-1, 1]) {
    const own = cands.filter((x) => (x.across || x.sg === sg) && (ties.includes(x) || !ties.some((t) => clash(t, x))));
    const take = (t: Cand) => { if (!ties.includes(t)) ties.push(t); };
    let prev = c.rEnd, inner = Infinity;
    const tip = own.filter((x) => x.x >= c.rEnd - pp.tipTieZone);
    if (tip.length) { const t = pick(tip, true); take(t); prev = t.x; inner = t.lo; } else gaps++;
    while (prev - support > pp.tieSpan) {
      const win = own.filter((x) => x.x >= prev - pp.tieSpan && x.hi <= inner - edge && (ties.includes(x) || !ties.some((t) => clash(t, x))));
      if (!win.length) { gaps++; prev -= pp.tieSpan; continue; }
      const t = pick(win, false);
      take(t); prev = t.x; inner = t.lo;
    }
  }
  return { ties: ties.sort((a, b) => a.x - b.x), gaps };
}

/**
 * The disc ties that would sit under the strip on a blade at angle a (a hole, or the band between
 * the two): those are left out, and the blade's strip ties hold the panel there instead.
 */
function discTiesUnderStrip(c: Ctx, side: number, a: number): Set<number> {
  const { pp } = c, h = (holeSize(pp) / 2) * Math.SQRT2, lane = pp.stripW / 2;
  const sf = c.side[side].sf, out = new Set<number>();
  c.side[side].ties.forEach((t, i) => {
    const q = t.holes.map((f) => rot(toPlan(sf, f), -a));
    const e0 = Math.min(q[0][1], q[1][1]) - h, e1 = Math.max(q[0][1], q[1][1]) + h;
    if (Math.max(q[0][0], q[1][0]) > 0 && e1 > -lane && e0 < lane) out.add(i);
  });
  return out;
}

/** Room between the blades (without tabs) and the valve stem, in plan. */
function valveRoom(c: Ctx, arms: number[]): number {
  const { wh, pp } = c, vd = wh.valveDeg(), rw = wh.p.rimWallR;
  let best = Infinity;
  for (let r = rw - pp.valveLen; r <= rw; r += 1) {
    for (const a of arms) {
      const [x, e] = rot(pol(r, vd), -a);
      if (x < 0) continue;
      best = Math.min(best, Math.hypot(Math.max(0, x - c.rEnd), Math.max(0, Math.abs(e) - c.bladeW / 2)));
    }
  }
  return best - pp.valveD / 2;
}

// ---------------------------------------------------------------- mirror images
/**
 * The axes (deg, 0–180) that mirror the left spokes onto the right ones in plan (a symmetric hub has
 * several, a spoke pattern's repeat apart): blades placed symmetrically about one make the two panels
 * mirror images.
 */
export function mirrorAxes(wh: Wheel): number[] {
  if (wh.p.pcdLeft !== wh.p.pcdRight) return [];
  const L = wh.sideSpokes(-1), R = wh.sideSpokes(1), out: number[] = [];
  const same = (x: number, y: number) => adiff(x, y) < 1e-6;
  for (const q of R) {
    for (const b of [(L[0].rimDeg + q.rimDeg) / 2, (L[0].rimDeg + q.rimDeg) / 2 + 90].map((v) => pmod(v, 180))) {
      if (out.some((o) => same(2 * o, 2 * b))) continue;
      if (L.every((l) => R.some((rr) => same(rr.rimDeg, 2 * b - l.rimDeg) && same(rr.hubDeg, 2 * b - l.hubDeg)))) out.push(b);
    }
  }
  return out.sort((a, b) => a - b);
}

// ---------------------------------------------------------------- one panel
/** Everything that makes up one panel, before the outline is built. */
interface Features {
  arms: number[]; bladeW: number; rBore: number; rhoDisc: number; rhoEnd: number;
  ears: Pt[][]; slotRings: Pt[][]; slots: { blade: number; rimHole: number }[];
  holes: HoleSpec[];
  rhoLed0: number; rhoLed1: number; nLeds: number; stripTieRhos: number[][];
  spokeTies: SpokeTie[]; discTies: DiscTie[]; discTiesUnder: number; gaps: number;
  sensors: Flat['sensors'];
}

function outlineFrom(pp: Spec, f: Features) {
  const blades = f.arms.map((a) => rotRing(box(0, -f.bladeW / 2, f.rhoEnd, f.bladeW / 2), a));
  const outlinePts = ccw(cleanRing(outlineOf([circlePts(f.rhoDisc), ...blades, ...f.ears], f.slotRings)));
  const fr = filletRing(outlinePts, pp.cornerR);
  return { outlinePts, outlineBulge: arcMerge(fr.bulge, f.rhoDisc), outline: new Ring(fr.sampled) };
}

function buildFlat(pp: Spec, f: Features): Flat {
  return {
    arms: f.arms, bladeW: f.bladeW, rBore: f.rBore, rhoDisc: f.rhoDisc, rhoEnd: f.rhoEnd, ...outlineFrom(pp, f),
    holes: f.holes.map((h) => holeAt(pp, h)), rhoLed0: f.rhoLed0, rhoLed1: f.rhoLed1, nLeds: f.nLeds,
    stripTieRhos: f.stripTieRhos, slots: f.slots, sensors: f.sensors,
  };
}

/** Filled ring q lies inside the outline with at least m of material to its edge. */
const insideBy = (outline: Ring, q: Ring, m: number) => outline.contains(q.pts[0]) && outline.boundaryDist(q, m) >= m;

/** Plan radii of the pixel gaps that have no strip tie: where a tie across the strip may go. */
function freeGaps(pp: Spec, sf: SurfaceFns, rho0: number, nLeds: number): number[] {
  const out: number[] = [];
  for (let m = 1; m <= nLeds - 1; m++) if ((m - 1) % pp.holesEvery) out.push(sf.rOf(rho0 + m * pp.ledPitch));
  return out;
}

function sideFeatures(c: Ctx, side: number, arms: number[], led: { rho0: number; rho1: number }, rhoDisc: number): Features {
  const { wh, pp } = c, { sf, ties: allTies } = c.side[side];
  const under = new Set(arms.flatMap((a) => [...discTiesUnderStrip(c, side, a)]));
  const dTies = allTies.filter((_, i) => !under.has(i));
  const hole = holeSize(pp), edge = pp.gridEdge, wHalf = c.bladeW / 2, rhoEnd = sf.rhoOf(c.rEnd);
  const holes: HoleSpec[] = [];
  let tie = 0;
  for (const t of dTies) { const a = discTieAngle(t); holes.push(...t.holes.map((q) => ({ c: q, a, kind: 'disc' as const, tie }))); tie++; }
  const ears: Pt[][] = [], spokeTies: SpokeTie[] = [];
  let gaps = 0;
  // pixel gaps with no strip tie, for ties across the strip
  const nLeds = Math.floor((led.rho1 - led.rho0) / pp.ledPitch);
  const free = freeGaps(pp, sf, led.rho0, nLeds);
  arms.forEach((a, bi) => {
    const ch = chooseTies(c, side, spokeTieCands(c, side, a, free));
    gaps += ch.gaps;
    for (const t of ch.ties) {
      const fh = t.holes.map((q) => toFlat(sf, q)) as [Pt, Pt];
      const ha = t.across ? a : a + t.psi;
      holes.push(...fh.map((q) => ({ c: q, a: ha, kind: 'spoke' as const, tie })));
      tie++;
      spokeTies.push({ blade: bi, r: r1(t.x), spoke: t.spoke, sg: t.sg, earMm: r1(t.ear), across: t.across, holes: fh });
      if (t.ear <= 0) continue;
      // the tab: the two holes with gridEdge round them, blended into the blade's edge
      const pad = fh.flatMap((q) => squareAt(q, ha, hole + 2 * edge)).map((q) => rot(q, -a));
      const x0 = Math.min(...pad.map((q) => q[0])), x1 = Math.max(...pad.map((q) => q[0]));
      const blend = clamp(t.ear, 4, 15), ey = t.sg * (wHalf - 0.5);
      const xIn = Math.max(0, x0 - blend), xOut = Math.min(rhoEnd - pp.cornerR, x1 + blend);
      ears.push(rotRing(convexHull([...pad, [xIn, ey], [Math.max(xOut, x1), ey]]), a));
    }
  });
  // nipple slots: a nipple (either side's) under a tip
  const slotRings: Pt[][] = [], slots: Features['slots'] = [];
  if (pp.tipSlot === 'auto') {
    const sw = pp.nippleD + 1, bottom = sf.rhoOf(wh.nippleTipR() - pp.tipSlotClear);
    arms.forEach((a, bi) => {
      for (const s of wh.spokes) {
        const e = wh.nippleTipR() * Math.sin(rad(s.rimDeg - a));
        if (Math.cos(rad(s.rimDeg - a)) < 0 || Math.abs(e) >= wHalf + pp.nippleD / 2 + 0.5) continue;
        slotRings.push(rotRing(box(bottom, -sw / 2, rhoEnd + 10, sw / 2), s.rimDeg));
        slots.push({ blade: bi, rimHole: s.i });
      }
    });
  }
  // hall switches: one beside each strip on the outer face, marked face out, sensorGap from the strip's
  // edge, on the disc as far out as fits (the strip's current falls towards its tip), else on a tab off
  // the blade just past the disc. Two ties hold it: one across its body, one across its leads.
  const sensors: Flat['sensors'] = [];
  if (pp.sensor) {
    const [bw, bl] = pp.sensorBody, rBore = pp.boreD / 2, h = hole / 2;
    const off = pp.stripW / 2 + pp.sensorGap + bw / 2, tieE = bw / 2 + 0.5 + h, leadTie = bl / 2 + hole + edge;
    const placed: Ring[] = [];
    arms.forEach((a, bi) => {
      let best: { key: number[]; rho: number; e: number; specs: HoleSpec[]; onDisc: boolean; foot: Ring } | undefined;
      const rings = holes.map((x) => holeAt(pp, x).ring);
      for (const e of [off, -off]) {
        for (let rho = Math.ceil(rBore + pp.sensorLeads + 5); rho <= rhoEnd - pp.tipTieZone - bl; rho += 1) {
          const specs = [rho, rho - leadTie].flatMap((x) => [-1, 1].map((j) => ({ c: rot([x, e + j * tieE], a), a, kind: 'sensor' as const, tie: 0 })));
          const outer = sensorArea(pp, a, rho, e, h + edge);
          if (outer.some((q) => Math.hypot(...q) < rBore + 2)) continue;
          const onDisc = outer.every((q) => Math.hypot(...q) <= rhoDisc);
          const key = onDisc ? [0, -rho] : [1, rho];
          if (best && lexCmp(key, best.key) >= 0) continue;
          // clear of the other strips, the other ties (their bands and heads) and the other sensors
          const foot = new Ring(sensorAt(pp, a, rho, e, 1));
          const lanes = arms.filter((b) => b !== a).every((b) => outer.every((q) => { const [x, y] = rot(q, -b); return x < 0 || Math.abs(y) >= pp.stripW / 2 + pp.sensorGap; }));
          if (!lanes || rings.some((o) => foot.boundaryDist(o, 1) < 1 || foot.contains(o.pts[0])) || placed.some((o) => foot.boundaryDist(o, edge) < edge)) continue;
          if (!specs.every((sp) => { const q = holeAt(pp, sp).ring; return rings.every((o) => o.boundaryDist(q, edge) >= edge - 0.05); })) continue;
          best = { key, rho, e, specs, onDisc, foot };
        }
      }
      if (!best) return;
      for (let k = 0; k < 2; k++) { holes.push(...best.specs.slice(2 * k, 2 * k + 2).map((sp) => ({ ...sp, tie }))); tie++; }
      placed.push(best.foot);
      // the strip's stray field at the sensor: its supply and ground carry the current of every LED beyond
      const amps = (clamp((led.rho1 - best.rho) / pp.ledPitch, 0, nLeds) * pp.ledMa) / 1000;
      const L = Math.abs(best.e) / 1000, d = pp.stripTraceSep / 1000;
      const fieldUT = (2e-7 * amps * d) / (L * L - (d * d) / 4) * 1e6;
      sensors.push({ blade: bi, rho: best.rho, e: best.e, onDisc: best.onDisc, fieldUT: r1(fieldUT) });
      if (!best.onDisc) { // a tab off the blade for it, blended into the blade's edge
        const ring = sensorArea(pp, 0, best.rho, best.e, h + edge), ey = Math.sign(best.e) * (wHalf - 0.5);
        const x0 = Math.min(...ring.map((q) => q[0])), x1 = Math.max(...ring.map((q) => q[0]));
        ears.push(rotRing(convexHull([...ring, [x0 - 6, ey], [x1 + 6, ey]]), a));
      }
    });
  }
  const f: Features = {
    arms, bladeW: c.bladeW, rBore: pp.boreD / 2, rhoDisc, rhoEnd, ears, slotRings, slots, holes,
    rhoLed0: led.rho0, rhoLed1: led.rho1, nLeds, stripTieRhos: arms.map(() => []),
    spokeTies, discTies: dTies, discTiesUnder: under.size, gaps, sensors,
  };
  // strip ties: pairs on the strip's edges every holesEvery pixels, between pixels, wherever they
  // keep gridEdge to the edge, the bore and the other ties
  const { outline } = outlineFrom(pp, f);
  const others = holes.map((h) => holeAt(pp, h).ring);
  const step = pp.holesEvery, y = rowOffset(pp), rBore = pp.boreD / 2;
  for (let m = 1; m <= f.nLeds - 1; m += step) {
    const rho = led.rho0 + m * pp.ledPitch;
    arms.forEach((a, bi) => {
      const pair = [y, -y].map((yy) => ({ c: rot([rho, yy], a), a, kind: 'strip' as const, tie }));
      const ok = pair.every((h) => {
        const q = holeAt(pp, h).ring;
        return insideBy(outline, q, edge - 0.05) && q.areaDist([0, 0]) - rBore >= edge - 0.05 && others.every((o) => o.boundaryDist(q, edge) >= edge - 0.05);
      });
      if (!ok) return;
      f.stripTieRhos[bi].push(rho);
      holes.push(...pair);
      others.push(...pair.map((h) => holeAt(pp, h).ring)); // blades meet at the hub: keep clear of their strip ties too
      tie++;
    });
  }
  // wire holes: one per strip, as near the strip's inner end as it can be beside the strip (on its
  // sensor's side), for the strip's and the sensor's wires to the inner side: in the disc, or on a small
  // tab off the blade where the disc is too small
  if (pp.wireHoleD > 0) {
    const r = pp.wireHoleD / 2, lane = pp.stripW / 2;
    const feet = f.sensors.map((b) => new Ring(sensorAt(pp, arms[b.blade], b.rho, b.e, 1)));
    arms.forEach((a, bi) => {
      const sg = Math.sign(f.sensors.find((b) => b.blade === bi)?.e ?? 1);
      const end: Pt = [led.rho0, sg * lane];
      const spots: Pt[] = [];
      for (let x = rBore + edge + r; x <= Math.max(rhoDisc, led.rho0 + 40); x += 0.5) {
        for (let e = lane + r + 1; e <= lane + 40; e += 0.5) spots.push([x, sg * e]);
      }
      spots.sort((p, q) => dist(p, end) - dist(q, end));
      const fits = (x: number, e: number, onPart: boolean) => {
        const spec = { c: rot([x, e], a), a, kind: 'wire' as const, tie, d: pp.wireHoleD };
        const q = holeAt(pp, spec).ring;
        // clear of the other strips, every other hole, the sensors and the bore
        const lanes = arms.every((b) => b === a || q.pts.every((p) => { const [u, v] = rot(p, -b); return u < 0 || Math.abs(v) >= lane + 1; }));
        if (!lanes || q.areaDist([0, 0]) - rBore < edge || (onPart && !insideBy(outline, q, edge - 0.05))) return null;
        if (others.some((o) => o.boundaryDist(q, edge) < edge - 0.05) || feet.some((o) => o.boundaryDist(q, 1) < 1 || o.contains(q.pts[0]))) return null;
        return { spec, q };
      };
      let hit = null as { spec: HoleSpec; q: Ring; x: number; e: number } | null;
      for (const [x, e] of spots) { const ok = fits(x, e, true); if (ok) { hit = { ...ok, x, e }; break; } }
      if (!hit) { // a tab off the blade for it, blended into the blade's edge
        for (const [x, e] of spots) {
          if (Math.abs(e) + r + edge - wHalf > 20) continue;
          const ok = fits(x, e, false);
          if (!ok) continue;
          hit = { ...ok, x, e };
          const m = r + edge, ey = sg * (wHalf - 0.5);
          ears.push(rotRing(convexHull([[x - m, e - m], [x + m, e - m], [x + m, e + m], [x - m, e + m], [x - m - 6, ey], [x + m + 6, ey]]), a));
          break;
        }
      }
      if (!hit) return;
      holes.push(hit.spec);
      others.push(hit.q);
      tie++;
    });
  }
  return f;
}

/** A hall switch on the part (grown by m): its body centred at rho along the blade and e across, its leads toward the hub. */
const sensorAt = (pp: Spec, a: number, rho: number, e: number, m = 0) => {
  const [bw, bl] = pp.sensorBody;
  return rotRing(box(rho - bl / 2 - pp.sensorLeads - m, e - bw / 2 - m, rho + bl / 2 + m, e + bw / 2 + m), a);
};
/** The sensor and its two ties' holes (grown by m). */
const sensorArea = (pp: Spec, a: number, rho: number, e: number, m: number) => {
  const [bw, bl] = pp.sensorBody, h = holeSize(pp) / 2, tieE = bw / 2 + 0.5 + h, leadTie = bl / 2 + 2 * h + pp.gridEdge;
  return rotRing(box(rho - Math.max(bl / 2 + pp.sensorLeads, leadTie) - m, e - tieE - m, rho + Math.max(bl / 2, h) + m, e + tieE + m), a);
};

/** The other side's panel, mirrored across `axis`: the same part turned over. */
function mirrorFeatures(wh: Wheel, f: Features, axis: number): Features {
  const M = (p: Pt) => mirrorPt(p, axis), A = (a: number) => pmod(2 * axis - a, 360);
  const holeOf = (d: number) => wh.spokes.find((s) => adiff(s.rimDeg, A(d)) < 1e-6)!.i;
  const order = f.arms.map((a, i) => [A(a), i]).sort((p, q) => p[0] - q[0]);
  const blade = (i: number) => order.findIndex(([, j]) => j === i);
  return {
    ...f, arms: order.map(([a]) => a), stripTieRhos: order.map(([, i]) => f.stripTieRhos[i]),
    ears: f.ears.map((r) => r.map(M)), slotRings: f.slotRings.map((r) => r.map(M)),
    slots: f.slots.map((s) => ({ blade: blade(s.blade), rimHole: holeOf(wh.spokes[s.rimHole].rimDeg) })),
    holes: f.holes.map((h) => ({ ...h, c: M(h.c), a: A(h.a) })),
    spokeTies: f.spokeTies.map((t) => ({
      ...t, blade: blade(t.blade), spoke: holeOf(wh.spokes[t.spoke].rimDeg), sg: -t.sg as 1 | -1, holes: t.holes.map(M) as [Pt, Pt],
    })),
    sensors: f.sensors.map((b) => ({ ...b, blade: blade(b.blade), e: -b.e })).sort((p, q) => p.blade - q.blade),
    discTies: f.discTies.map((t) => ({
      ...t, at: M(t.at), spokes: t.spokes.map((i) => holeOf(wh.spokes[i].rimDeg)) as [number, number], holes: t.holes.map(M) as [Pt, Pt],
    })),
  };
}

// ---------------------------------------------------------------- checks
/** Outer side of the panel (and the LED strip on it) vs a straight fork blade from the dropout (OLD/2) to the crown. */
function forkClearance(wh: Wheel, pp: Spec, g: Flat, sf: SurfaceFns) {
  const old = wh.p.old / 2;
  const forkZ = (r: number) => old - (old - pp.forkCrownHalf) * Math.min(1, r / pp.forkCrownR);
  const t = pp.thickness, stack = pp.stripT + pp.tieT;
  let face: [number, Record<string, number> | null] = [1e9, null];
  for (const p of densify(g.outline.pts, 3)) {
    const r = sf.rOf(Math.hypot(...p)), cl = forkZ(r) - (sf.zAt(r) + t);
    if (cl < face[0]) face = [cl, { r: r1(r), panelOuterZ: r1(sf.zAt(r) + t), forkZ: r1(forkZ(r)) }];
  }
  let lane: [number, Record<string, number> | null] = [1e9, null];
  for (let rho = g.rhoLed0; rho <= g.rhoLed1; rho += 1) {
    const r = sf.rOf(rho), zo = sf.zAt(r) + t + stack, cl = forkZ(r) - zo;
    if (cl < lane[0]) lane = [cl, { r: r1(r), stripOuterZ: r1(zo), forkZ: r1(forkZ(r)) }];
  }
  let board: [number, Record<string, number> | null] = [1e9, null];
  for (const b of g.sensors) { // the sensor body and the tie band over it
    for (const q of sensorAt(pp, g.arms[b.blade], b.rho, b.e)) {
      const r = sf.rOf(Math.hypot(...q)), zo = sf.zAt(r) + t + pp.sensorBody[2] + pp.tieT, cl = forkZ(r) - zo;
      if (cl < board[0]) board = [cl, { r: r1(r), sensorOuterZ: r1(zo), forkZ: r1(forkZ(r)) }];
    }
  }
  // the hall sensors face the fork: the room there is for the magnet (on the fork leg's inner face)
  const magnetRoom = g.sensors.length ? Math.min(...g.sensors.map((b) => {
    const r = sf.rOf(Math.hypot(b.rho, b.e));
    return forkZ(r) - (sf.zAt(r) + t + pp.sensorBody[2]);
  })) : null;
  const worst = [[lane, 'LED strip + tie band'], [board, 'hall sensor + tie band'], [face, 'panel face']] as const;
  const [w, by] = worst.reduce((m, x) => (x[0][0] < m[0][0] ? x : m));
  return {
    minMm: r1(w[0]), governedBy: by as string,
    panelFaceMm: r1(face[0]), ledStripMm: r1(lane[0]), sensorMm: board[1] ? r1(board[0]) : null,
    sensorFaceToForkMm: magnetRoom === null ? null : r1(magnetRoom), stackOnFaceMm: r2(stack), where: w[1],
  };
}

/** Signed room from a plan point to the panel's edge (negative: over the panel). */
function roomTo(g: Flat, sf: SurfaceFns, p: Pt): number {
  const q = toFlat(sf, p), d = g.outline.pointDist(q);
  return bodyContains(g, q) ? -d : d;
}

/** Rotation (deg) that gives the part its smallest bounding box on the sheet, and the box (short side first). */
function bestCutRot(g: Flat): [number, [number, number]] {
  let best: { key: [number, number]; a: number; w: number; h: number } | undefined;
  const pts = densify(g.outline.pts, 5);
  for (let k = 0; k < 720; k++) {
    const a = rad(k * 0.25), c = Math.cos(a), s = Math.sin(a);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of pts) {
      const X = x * c - y * s, Y = x * s + y * c;
      x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y);
    }
    const w = x1 - x0, h = y1 - y0;
    const key: [number, number] = [r1(w * h), -h];
    if (!best || lexCmp(key, best.key) < 0) best = { key, a: k * 0.25, w, h };
  }
  const b = best!;
  return [b.w > b.h ? (b.a + 90) % 360 : b.a, [Math.min(b.w, b.h), Math.max(b.w, b.h)]];
}

// ---------------------------------------------------------------- the design
export interface SideResult {
  label: 'LEFT' | 'RIGHT';
  side: -1 | 1;
  g: Flat;
  surface: Surface;
  sf: SurfaceFns;
  cutRot: number;
  spokeTies: SpokeTie[];
  discTies: DiscTie[];
  summary: {
    ledsPerStrip: number; ledStartR: number; ledEndR: number; stripTiesPerBlade: number[]; stripTiePitchMm: number;
    discD: number; discCross: number; discTies: number; discTiesUnderStrips: number; discTieR: number | null;
    bladeW: number; tipR: number; flatTipRho: number; lengthOnSlopeMm: number;
    spokeTiesPerBlade: number[]; spokeTieR: number[][]; maxEarMm: number; longestSpanMm: number; tipOverhangMm: number; tieGaps: number;
    holes: Record<HoleKind, number>; holesTotal: number;
    partSizeIn: [number, number]; partSizeMm: [number, number]; areaCm2: number; massG: number;
    dishMm: number; dropoutClearAtHub: number;
    forkClearance: ReturnType<typeof forkClearance>; forkOk: boolean;
    valveClearMm: number; nippleSlots: number; nippleHits: number[];
    sensorR: number[]; sensorsOnDisc: number; sensorFieldUT: number | null; closeTies: { r: number; gapMm: number }[];
  };
}

export interface WheelInput extends Partial<WheelSpec> { size?: string }

export interface PanelDesign {
  name: string;
  spec: Spec;
  wheel: Wheel;
  material: string;
  rimNote: string;
  arms: number[];
  armSpacing: number;
  /** Left and right are the same part: one cut file, order two (turned over for the other side). */
  identical: boolean;
  tipSlot: { widthMm: number; depthMm: number; nippleInnerEndR: number; slotBottomROnWheel: number } | null;
  sides: { LEFT: SideResult; RIGHT: SideResult };
  sim: { stripCount: number; ledDensity: number; stripStartMm: number; stripLengthMm: number; ledEndR: number; evenlySpaced: boolean };
  warnings: string[];
}

export function designPanels(wheelIn: WheelInput, panelIn: Partial<PanelSpec>): PanelDesign {
  holeCache = new Map();
  const { size = '700c', ...wp } = wheelIn;
  const mat = panelIn.material ?? PANEL_DEFAULTS.material;
  const material = MATERIALS[mat];
  if (!material) throw new Error(`Unknown material ${mat}.`);
  const pp: Spec = { ...PANEL_DEFAULTS, ...material, ...panelIn };
  if (pp.strips < 1) throw new Error('The panels need at least one strip.');
  const bladeW = Math.max(pp.bladeW, minBladeW(pp));
  let wh = new Wheel(wp);
  let rimNote = '', rEnd: number;
  if (pp.tipEndR) { // measured tip position: make sure the modelled rim sits outside it
    const need = Math.hypot(pp.tipEndR, bladeW / 2) + pp.tipClear;
    if (wh.p.rimWallR < need) {
      wh = new Wheel({ ...wp, rimWallR: need, erd: 2 * (need + 4) });
      rimNote = `Rim wall assumed at r = ${need.toFixed(1)} mm, just outside the tip. Measure the rim to confirm.`;
    }
    rEnd = pp.tipEndR;
  } else {
    rEnd = Math.sqrt((wh.p.rimWallR - pp.tipClear) ** 2 - (bladeW / 2) ** 2);
  }
  if (pp.tipSlot === 'none') rEnd = Math.min(rEnd, wh.nippleTipR() - pp.tipSlotClear);
  if (pp.earMax <= 0) { // a tab that reaches a spoke midway between the blade and the next spoke on that side
    const half = rEnd * rad(360 / wh.p.spokes), h = holeSize(pp) / 2;
    pp.earMax = Math.ceil(half + wh.p.spokeD / 2 + pp.spokeGap + 2 * h * Math.SQRT2 + pp.gridEdge - bladeW / 2 + 2);
  }
  const rBore = pp.boreD / 2;
  // the dished surface each panel lies on, the disc's ties, and the disc that holds them
  const sideCtx: Ctx['side'] = {};
  for (const side of [-1, 1]) {
    const surface = surfaceOf(wh, side, wh.p.rimWallR + 20), sf = surfaceFns(surface);
    sideCtx[side] = { surface, sf, ties: discTiesOf(wh, pp, side, sf), rDisc: 0, rSupport: 0 };
  }
  const hole = holeSize(pp);
  const rhoDisc = Math.max(rBore + 2 * pp.gridEdge + hole, ...[-1, 1].flatMap((side) => sideCtx[side].ties.flatMap((t) =>
    t.holes.flatMap((q) => squareAt(q, discTieAngle(t), hole).map((k) => Math.hypot(...k) + pp.gridEdge)))));
  for (const side of [-1, 1]) {
    const s = sideCtx[side];
    s.rDisc = s.sf.rOf(rhoDisc);
    s.rSupport = s.ties.length ? Math.max(...s.ties.map((t) => t.r)) : rBore;
  }
  const c: Ctx = { wh, pp, bladeW, rEnd, xMax: Math.min(rEnd, wh.nippleTipR() - pp.tipSlotClear), side: sideCtx };
  // the strips start just outside the bore, so the pixel gaps (where ties across a strip go) are known
  // before the blades turn; only a nipple slot may shorten the strips later
  const ledStart = rBore + pp.stripStartGap;
  const searchGaps: Record<number, number[]> = {};
  for (const side of [-1, 1]) {
    const sf = sideCtx[side].sf, rho0 = sf.rhoOf(ledStart);
    searchGaps[side] = freeGaps(pp, sf, rho0, Math.floor((sf.rhoOf(rEnd) - 2 - rho0) / pp.ledPitch));
  }

  // Turn all the blades together (they stay evenly spaced) for: every stretch tied, the valve clear,
  // the two panels mirror images of each other (or else as alike as can be), the smallest tabs, the
  // fewest ties across a strip, the fewest disc ties under a strip.
  const N = pp.strips, period = 360 / N, sidePeriod = 1440 / wh.p.spokes;
  // blades at t0 + k·period are symmetric about an axis when t0 is a multiple of 180/N from it
  const axes = mirrorAxes(wh);
  const symmetric = (t0: number) => axes.find((ax) => Math.min(pmod(t0 - ax, 180 / N), 180 / N - pmod(t0 - ax, 180 / N)) < 1e-6) ?? null;
  const cache = new Map<string, { gaps: number; n: number; across: number; maxEar: number; sumEar: number; under: Set<number> }>();
  const armEval = (side: number, a: number) => {
    const key = `${side}:${r3(pmod(a, sidePeriod))}`;
    let v = cache.get(key);
    if (!v) {
      const { ties, gaps } = chooseTies(c, side, spokeTieCands(c, side, a, searchGaps[side]));
      v = { gaps, n: ties.length, across: ties.filter((t) => t.across).length, maxEar: Math.max(0, ...ties.map((t) => t.ear)), sumEar: ties.reduce((s, t) => s + t.ear, 0), under: discTiesUnderStrip(c, side, a) };
      cache.set(key, v);
    }
    return v;
  };
  const starts: number[] = [];
  for (let k = 0; k * 0.25 < period - 1e-9; k++) starts.push(k * 0.25);
  for (const ax of axes) for (let k = 0; k < 2; k++) starts.push(pmod(ax + (k * 180) / N, period));
  let best: { key: number[]; t0: number } | undefined;
  for (const t0 of starts) {
    const arms = Array.from({ length: N }, (_, k) => pmod(t0 + k * period, 360));
    const ev = [-1, 1].flatMap((side) => arms.map((a) => armEval(side, a)));
    const dropped = [0, 1].reduce((n, k) => n + new Set(ev.slice(k * N, (k + 1) * N).flatMap((v) => [...v.under])).size, 0);
    const valve = valveRoom(c, arms);
    // how differently the two sides come out: their biggest tabs, their tie counts and ties across a strip
    const side_ = (k: number) => ev.slice(k * N, (k + 1) * N);
    const [l, r] = [side_(0), side_(1)].map((vs) => ({
      ear: Math.max(...vs.map((v) => v.maxEar)), n: vs.reduce((s, v) => s + v.n, 0), across: vs.reduce((s, v) => s + v.across, 0),
    }));
    const unlike = Math.ceil(Math.abs(l.ear - r.ear) / 5) + Math.abs(l.n - r.n) + Math.abs(l.across - r.across);
    const key = [
      ev.reduce((s, v) => s + v.gaps, 0), valve < pp.valveClear ? 1 : 0, symmetric(t0) === null ? 1 : 0, unlike,
      Math.ceil(Math.max(...ev.map((v) => v.maxEar)) / 5), ev.reduce((s, v) => s + v.across, 0),
      dropped, r1(ev.reduce((s, v) => s + v.sumEar, 0)), -r1(valve),
    ];
    if (!best || lexCmp(key, best.key) < 0) best = { key, t0 };
  }
  const arms = Array.from({ length: N }, (_, k) => pmod(best!.t0 + k * period, 360)).sort((a, b) => a - b);
  const axis = symmetric(best!.t0), mirrored = axis !== null;

  // the strips: all the same, from just outside the bore to the tip or a nipple slot
  const sfR = sideCtx[1].sf;
  let rho1 = sfR.rhoOf(rEnd) - 2;
  let tipSlot: PanelDesign['tipSlot'] = null;
  if (pp.tipSlot === 'auto') {
    const sw = pp.nippleD + 1, bottomR = wh.nippleTipR() - pp.tipSlotClear;
    for (const a of arms) {
      for (const s of wh.spokes) {
        const e = wh.nippleTipR() * Math.sin(rad(s.rimDeg - a));
        if (Math.cos(rad(s.rimDeg - a)) < 0 || Math.abs(e) >= bladeW / 2 + pp.nippleD / 2 + 0.5) continue;
        tipSlot = { widthMm: r2(sw), depthMm: r2(sfR.rhoOf(rEnd) - sfR.rhoOf(bottomR)), nippleInnerEndR: r1(wh.nippleTipR()), slotBottomROnWheel: r1(bottomR) };
        if (Math.abs(e) < pp.stripW / 2 + sw / 2) rho1 = Math.min(rho1, sfR.rhoOf(bottomR) - 1); // the slot cuts into the strip's lane
      }
    }
  }
  const led = { rho0: sfR.rhoOf(ledStart), rho1 };

  const fL = sideFeatures(c, -1, arms, led, rhoDisc);
  const fR = axis !== null ? mirrorFeatures(wh, fL, axis) : sideFeatures(c, 1, arms, led, rhoDisc);
  const name = `${size}_${wh.p.spokes}h${wh.p.crosses}x_${N}strips_${mat}`;
  const t = pp.thickness;

  const sideResult = (side: -1 | 1, label: 'LEFT' | 'RIGHT', f: Features): SideResult => {
    const { sf } = sideCtx[side];
    const g = buildFlat(pp, f);
    const [cutRot, sz] = bestCutRot(g);
    const area = shapeArea(g);
    const perBlade = g.arms.map((_, bi) => f.spokeTies.filter((x) => x.blade === bi).map((x) => x.r));
    // each edge of each blade on its own: its beside ties and the ties across the strip
    const edges = g.arms.flatMap((_, bi) => [1, -1].map((sg) => f.spokeTies.filter((x) => x.blade === bi && (x.across || x.sg === sg)).map((x) => x.r).sort((p, q) => p - q)));
    const rSupport = sideCtx[side].rSupport;
    const spans = edges.map((rs) => { const all = [rSupport, ...rs]; return Math.max(0, ...all.slice(1).map((r, i) => r - all[i])); });
    const count = (k: HoleKind) => g.holes.filter((h) => h.kind === k).length;
    // valve and nipples, in plan
    const vd = wh.valveDeg(), rw = wh.p.rimWallR;
    let valve = Infinity;
    for (let r = rw - pp.valveLen; r <= rw; r += 1) valve = Math.min(valve, roomTo(g, sf, pol(r, vd)));
    const nippleHits = wh.spokes.filter((s) => { // the nipple's end, then its sides
      for (let r = wh.nippleTipR(); r <= rw; r += 0.5) {
        const room = roomTo(g, sf, pol(r, s.rimDeg));
        if (room < 0 || (r >= wh.nippleTipR() + pp.nippleD / 2 && room < pp.nippleD / 2)) return true;
      }
      return false;
    }).map((s) => s.i);
    // ties closer together than gridEdge (the two holes of one tie are meant to be close)
    const closeTies: { r: number; gapMm: number }[] = [];
    for (let i = 0; i < g.holes.length; i++) {
      for (let j = i + 1; j < g.holes.length; j++) {
        const A = g.holes[i], B = g.holes[j];
        if (A.tie === B.tie && A.kind === B.kind) continue;
        const d = A.ring.boundaryDist(B.ring, pp.gridEdge);
        if (d < pp.gridEdge - 0.05) closeTies.push({ r: r1(sf.rOf(Math.hypot(...A.c))), gapMm: r2(d) });
      }
    }
    const fc = forkClearance(wh, pp, g, sf);
    return {
      label, side, g, surface: sideCtx[side].surface, sf, cutRot, spokeTies: f.spokeTies, discTies: f.discTies,
      summary: {
        ledsPerStrip: g.nLeds, ledStartR: r1(sf.rOf(g.rhoLed0)), ledEndR: r1(sf.rOf(g.rhoLed1)),
        stripTiesPerBlade: g.stripTieRhos.map((r) => r.length), stripTiePitchMm: r2(pp.holesEvery * pp.ledPitch),
        discD: r1(2 * g.rhoDisc), discCross: pp.discCross > 0 ? Math.min(pp.discCross, wh.p.crosses) : wh.p.crosses, discTies: f.discTies.length, discTiesUnderStrips: f.discTiesUnder,
        discTieR: f.discTies.length ? r1(f.discTies[0].r) : null,
        bladeW: g.bladeW, tipR: r1(rEnd), flatTipRho: r1(g.rhoEnd), lengthOnSlopeMm: r2(g.rhoEnd - rEnd),
        spokeTiesPerBlade: perBlade.map((rs) => rs.length), spokeTieR: perBlade,
        maxEarMm: r1(Math.max(0, ...f.spokeTies.map((x) => x.earMm))), longestSpanMm: r1(Math.max(...spans)),
        tipOverhangMm: r1(Math.max(...edges.map((rs) => rEnd - (rs.at(-1) ?? rSupport)))), tieGaps: f.gaps,
        holes: { strip: count('strip'), spoke: count('spoke'), disc: count('disc'), sensor: count('sensor'), wire: count('wire') }, holesTotal: g.holes.length,
        partSizeIn: [r2(sz[0] / 25.4), r2(sz[1] / 25.4)], partSizeMm: [r1(sz[0]), r1(sz[1])],
        areaCm2: r1(area / 100), massG: r1((area * t * pp.density) / 1000),
        dishMm: r1(sf.zAt(rBore) - sf.zAt(rEnd)), dropoutClearAtHub: r1(wh.p.old / 2 - (sf.zAt(rBore) + t)),
        forkClearance: fc, forkOk: fc.minMm >= pp.minForkClear,
        valveClearMm: r1(valve - pp.valveD / 2), nippleSlots: g.slots.length, nippleHits,
        sensorR: g.sensors.map((b) => Math.round(sf.rOf(b.rho))), sensorsOnDisc: g.sensors.filter((b) => b.onDisc).length,
        sensorFieldUT: g.sensors.length ? Math.max(...g.sensors.map((b) => b.fieldUT)) : null, closeTies,
      },
    };
  };
  const L = sideResult(-1, 'LEFT', fL), R = sideResult(1, 'RIGHT', fR);

  const perSide = (s: SideResult) => {
    const out: string[] = [], sm = s.summary;
    if (sm.tieGaps) {
      const fit = PANEL_STRIP_RANGE.filter((n) => wh.p.spokes % n === 0);
      out.push(`${sm.tieGaps} stretch${sm.tieGaps > 1 ? 'es' : ''} of blade edge can't be tied to a spoke within ${pp.earMax} mm of the blade (tips: within ${pp.tipTieZone} mm of the end). `
        + `Each blade tip has to sit over a spoke or midway between two, which every blade can only do when the strips divide the spoke count: ${fit.join(', ')} strips on ${wh.p.spokes} spokes. Or allow longer tabs.`);
    }
    else if (sm.longestSpanMm > pp.tieSpan) out.push(`the longest stretch between ties is ${sm.longestSpanMm} mm, over the ${pp.tieSpan} mm asked.`);
    if (sm.valveClearMm < pp.valveClear) out.push(`the valve (${pp.valveD} mm with its nut, ${pp.valveLen} mm inside the rim) ${sm.valveClearMm < 0 ? 'hits the panel' : `clears the panel by only ${sm.valveClearMm} mm`}.`);
    if (sm.nippleHits.length) out.push(`${sm.nippleHits.length} nipple${sm.nippleHits.length > 1 ? 's' : ''} (rim hole ${sm.nippleHits.join(', ')}) under the panel. Slot the tips (Nipple slot) or shorten the blades.`);
    if (sm.sensorFieldUT !== null && sm.sensorFieldUT > 100 * pp.sensorReleaseMT) out.push(`the strip's stray field at a hall sensor is up to ${sm.sensorFieldUT} µT at full white, within 10× of the switch's ${pp.sensorReleaseMT} mT release point: widen the gap to the strip.`);
    if (pp.wireHoleD > 0 && sm.holes.wire < s.g.arms.length) out.push(`no room for a wire hole by ${s.g.arms.length - sm.holes.wire} of the strips.`);
    if (pp.sensor && s.g.sensors.length < s.g.arms.length) out.push(`no room for a hall sensor beside the strip on ${s.g.arms.length - s.g.sensors.length} blade${s.g.arms.length - s.g.sensors.length > 1 ? 's' : ''}.`);
    if (sm.closeTies.length) out.push(`${sm.closeTies.length} pairs of ties are closer than ${pp.gridEdge} mm (tightest ${Math.min(...sm.closeTies.map((x) => x.gapMm))} mm at r ${sm.closeTies[0].r} mm).`);
    if (!sm.discTies) {
      out.push(sm.discTiesUnderStrips ? 'every tie for the disc is under a strip: the disc isn\'t tied. Try another spoke cross.'
        : 'no room for the disc\'s ties clear of the bore: only the blades are tied. Try another spoke cross.');
    }
    const fc = sm.forkClearance;
    if (!sm.forkOk) {
      out.push(`${fc.governedBy} ${fc.minMm < 0 ? `hits the (typical) fork by ${-fc.minMm} mm` : `clears the (typical) fork by only ${fc.minMm} mm`}`
        + ` at r ${fc.where?.r} mm; the target is ${pp.minForkClear} mm. Measure the fork.`);
    }
    return out;
  };
  const wl = perSide(L), wr = perSide(R);
  const made: string[] = []; // what the cutter can make
  if (pp.minFeature) {
    const webs: [string, number][] = [['hole to edge', pp.gridEdge], ['between a spoke tie\'s two holes', wh.p.spokeD + 2 * pp.spokeGap],
      ['between strip ties', pp.holesEvery * pp.ledPitch - hole], ['hole', hole], ...(L.g.slots.length ? [['nipple slot', pp.nippleD + 1] as [string, number]] : [])];
    for (const [what, v] of webs) if (v < pp.minFeature) made.push(`${what} is ${r2(v)} mm: under the ${pp.minFeature} mm the cutter makes reliably in ${pp.label}.`);
  }
  if (pp.maxPartIn && (L.summary.partSizeIn[0] > pp.maxPartIn[0] || L.summary.partSizeIn[1] > pp.maxPartIn[1])) {
    made.push(`the part (${L.summary.partSizeIn.join(' × ')} in) is larger than ${pp.maxPartIn.join(' × ')} in, the largest the cutter takes in ${pp.label}.`);
  }
  // one warning for both panels when they say the same
  const warnings = [...made, ...wl.map((w) => (wr.includes(w) ? `Both panels: ${w}` : `LEFT: ${w}`)), ...wr.filter((w) => !wl.includes(w)).map((w) => `RIGHT: ${w}`)];
  return {
    name, spec: pp, wheel: wh, material: `${pp.label} (${pp.role})`, rimNote, arms, armSpacing: r3(period),
    identical: mirrored, tipSlot: L.g.slots.length ? tipSlot : null, sides: { LEFT: L, RIGHT: R },
    sim: {
      stripCount: N, ledDensity: Math.round(1000 / pp.ledPitch),
      stripStartMm: Math.round(R.summary.ledStartR), stripLengthMm: Math.round(R.summary.ledEndR - R.summary.ledStartR),
      ledEndR: R.summary.ledEndR, evenlySpaced: true,
    },
    warnings,
  };
}

/** Everything computed, as plain data (for the report file). */
export function designReport(d: PanelDesign) {
  const side = (s: SideResult) => ({
    ...s.summary, armAnglesDeg: s.g.arms.map(r3),
    spokeTies: s.spokeTies.map(({ holes: _h, ...x }) => ({ ...x, bladeDeg: r3(s.g.arms[x.blade]) })),
    discTies: s.discTies.map(({ holes: _h, at, ...x }) => ({ ...x, r: r1(x.r), at: at.map(r1) })),
  });
  return {
    name: d.name, material: d.material, rimNote: d.rimNote, wheelTypical: d.wheel.p, wheelCheck: d.wheel.check(), panel: d.spec,
    armAnglesDeg: d.arms.map(r3), armSpacingDeg: d.armSpacing, valveDeg: d.wheel.valveDeg(), tipSlot: d.tipSlot,
    identicalParts: d.identical, sides: { LEFT: side(d.sides.LEFT), RIGHT: side(d.sides.RIGHT) }, simSettings: d.sim, warnings: d.warnings,
  };
}

function flatExtrasOf(pp: Spec, g: Flat) {
  const leds = g.arms.map((a) => [rot([g.rhoLed0, 0], a), rot([g.rhoLed1, 0], a)] as [Pt, Pt]);
  const sensors = g.sensors.map((b) => sensorAt(pp, g.arms[b.blade], b.rho, b.e));
  return { leds, sensors };
}

/** LED strip lines, hall sensors (with their leads) and the side's spokes on the flat part (for drawings). */
export function flatExtras(d: PanelDesign, s: SideResult) {
  const spokes = d.wheel.sideSpokes(s.side).map((sp) => Array.from({ length: 41 }, (_, k) => {
    const [x, y] = sp.at(k / 40);
    return toFlat(s.sf, [x, y]);
  }));
  return { ...flatExtrasOf(d.spec, s.g), spokes };
}

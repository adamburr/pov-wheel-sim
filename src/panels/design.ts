// Parametric, self-supporting LED panels for a front-wheel POV display.
//
// Two identical flat-cut panels hug the hub, one each side of the wheel. Each is a star of N
// straight, tapered blades (N = LED strips per side: 2, 3 or 4). Every edge is a straight line
// with a small corner radius; the only curve is the centre bore. Each blade carries one LED strip
// between two rows of square tie holes centred on the strip edges, with a wider plate near the hub
// (battery / electronics) and a nipple slot in the tip.
//
// The blade tips meet in the wheel's centre plane near the rim and are zip-tied tip-to-tip to the
// other panel's tips, never to the spokes. Pulling the tips together bends every blade like a leaf
// spring, and the reaction clamps both panels onto the hub (each rests on its flange's spoke heads).
//
// designPanels() computes the bend (tip force, clamp, stress, bent shape), lengthens the flat
// blades so the bent tips land on the measured tip radius, and checks clearance to every spoke,
// the fork and the tie heads. See docs/panels.md for the design notes.
//
// Wheel dimensions other than the bore and tip radius are TYPICAL VALUES until measured.
import {
  adiff, box, type BulgePt, ccw, clamp, cleanRing, convexHull, deg, densify, filletRing, outlineOf, pmod, pointInRing, pointSegDist, pol,
  type Pt, rad, rectPts, Ring, rot, rotRing, segSegDist,
} from './geom';
import { type Material, MATERIALS } from './materials';
import { type Spoke, Wheel, type WheelSpec } from './wheel';

export { MATERIALS };

export interface PanelSpec {
  strips: number;           // LED strips (blades) per side
  evenSpacing: boolean;     // exactly 360/strips apart (tips placed for the most room between spokes)
  sandwichOk: boolean;      // if even tips can't all sit between spokes (3 strips on 32 spokes), centre ONE tip on a
                            // spoke: the two panels' tips clamp that spoke and its nipple between them
  nippleD: number;          // nipple shank diameter (typical 14 g brass)
  tipSlot: 'all' | 'auto' | 'none'; // nipple slot in the tip end: always, only when a blade sits on a spoke, or never
  tipSlotW: number | null;  // slot width; null = nippleD + 1
  tipSlotClear: number;     // slot bottom this far inside the nipple's inner end (bent, on the wheel)
  material: string;
  stripW: number; stripT: number; ledPitch: number; // LED strip in its sleeve, and its pixel pitch
  boreD: number;            // centre hole
  tipEndR: number | null;   // radius of the tip end on the wheel (measured); null = just inside the rim wall
  wCenter: number;          // blade width at the centre (straight taper to the tip width)
  hubW: number;             // minimum material round the bore
  cornerR: number;          // radius on every outline corner, outside and inside
  tipClear: number;         // tip-end corners inside the rim wall
  tieW: number; tieT: number;          // zip tie strap
  tieHead: [number, number, number];   // tie head: width, length, height
  tieClear: number;         // square hole = tie width + this
  holesEvery: number;       // hole pairs every N LED pixels, centred on the gap between pixels
  gridEdge: number;         // minimum material from a hole to the outer edge
  boreEdge: number;         // minimum material from a hole to the centre bore
  gridStripGap: number;     // (only if rowsOnStripEdges is false) material between a hole and the strip edge
  rowsOnStripEdges: boolean; // the rows beside the LED lane have their hole centres on the strip's edges
  stripStartGap: number;    // LED strip starts this far outside the bore
  plate: boolean; plateSide: 'both' | -1 | 1; // electronics plate along the blades ("both" = identical panels)
  plateHalfW: number;       // half-width across the blades (snapped to the hole lattice)
  gridPitchY: number | null; // hole pitch ACROSS the blades; null = the strip width
  centerCol: boolean;       // keep the hole column through the hub
  pushOut: boolean;         // shift each blade's hole grid out toward its tip as far as the edge rule allows
  plateLen: number;         // full width runs this far along each blade from the centre (snapped to the lattice)
  plateTaper: number;       // taper length, used only if plateTaperEnd is null
  plateTaperEnd: number | null; // the taper meets the plain blade this far from the centre (upper limit if plateTaperCols set)
  plateTaperCols: number | null; // fit the taper to the holes: it carries this many columns of the second hole row
  sensor: boolean; sensorSide: -1 | 1; sensorAll: boolean; // magnetometer boards under the blades (every blade, or blade 0)
  sensorR: number; sensorBoard: [number, number];
  minSpokeClear: number;    // required gap panel ↔ any spoke
  forkCrownR: number; forkCrownHalf: number; minForkClear: number; // straight fork blades, dropouts (OLD/2) to crown
}

export const PANEL_DEFAULTS: PanelSpec = {
  strips: 2, evenSpacing: true, sandwichOk: true, nippleD: 4, tipSlot: 'all', tipSlotW: null, tipSlotClear: 1,
  material: 'g10_063',
  // Adafruit DotStar 144 LED/m black (product 2241, SK9822): 14 mm wide × 4 mm in its weatherproof sleeve
  stripW: 14, stripT: 4, ledPitch: 1000 / 144,
  boreD: 38.1, tipEndR: 298.45, wCenter: 50, hubW: 8, cornerR: 2, tipClear: 3,
  // 40 lb (178 N, 3.6 × 1.27 mm) and 18 lb (80 N, 2.4 × 1.1 mm) ties both fit the 4.6 mm holes.
  tieW: 3.6, tieT: 1.27, tieHead: [6.0, 5.9, 4.3], tieClear: 1,
  holesEvery: 2, gridEdge: 4, boreEdge: 3, gridStripGap: 1.5, rowsOnStripEdges: true, stripStartGap: 3,
  plate: true, plateSide: 'both', plateHalfW: 41.3, gridPitchY: null, centerCol: true, pushOut: true,
  plateLen: 48, plateTaper: 60, plateTaperEnd: 149.6, plateTaperCols: 4,
  sensor: true, sensorSide: -1, sensorAll: true, sensorR: 110, sensorBoard: [25.4, 17.8],
  minSpokeClear: 1, forkCrownR: 340, forkCrownHalf: 22, minForkClear: 3,
};

type Spec = PanelSpec & Material & { slot: [number, number] | null };

export interface Hole {
  c: Pt;              // centre on the part
  a: number;          // blade angle (the hole's sides run along and across it)
  x: number; y: number; // lattice position in the blade's own frame
  bulge: BulgePt[];
  ring: Ring;
}

/** What the blade's half-width follows: a straight taper w0 → wTip, and the plate (length, half-width, taper). */
export interface HwSpec { w0: number; wTip: number; rhoEnd: number; plate: [number, number, number] | null }

export function hwFn({ w0, wTip, rhoEnd, plate }: HwSpec) {
  const hwArm = (rho: number) => (w0 - (w0 - wTip) * clamp(rho / rhoEnd, 0, 1)) / 2;
  return (rho: number) => {
    let h = hwArm(rho);
    if (plate) {
      const [L, W, c] = plate;
      if (rho <= L) h = Math.max(h, W);
      else if (rho <= L + c) h = Math.max(h, W - ((W - hwArm(L + c)) * (rho - L)) / c);
    }
    return h;
  };
}

/** The panel as cut (flat). rho = distance from the centre along the flat sheet. */
export interface Flat {
  arms: number[];
  outlinePts: Pt[];        // straight-edged outline before filleting
  outlineBulge: BulgePt[];
  outline: Ring;           // filleted, sampled
  holes: Hole[];
  rBore: number; rhoEnd: number; wTip: number; w0: number;
  hwSpec: HwSpec;
  hw: (rho: number) => number; // half-width that bends with the blade (plate included), from hwSpec
  holeRhos: number[]; yRow: number; equalGap: [number, number];
  rhoTie: number; rhoLed0: number; rhoLed1: number; nLeds: number;
  netWCenter: number; nGrid: number; hasPlate: boolean; latticePhase: number | null;
  holeXY: Pt[] | null;
  plateLW: [number, number] | null; plateC: number | null;
  taperEnd?: number; gridShift?: number;
  star?: boolean; holesPerBlade?: number[]; holesDropped?: number;
}

/** Compare two keys element by element, like Python tuples. */
const lexCmp = (a: number[], b: number[]) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
};
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

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
export const bodyArea = (g: Flat) => Math.abs(polyArea(g.outline.pts)) - Math.PI * g.rBore ** 2;
export const shapeArea = (g: Flat) => bodyArea(g) - g.holes.reduce((s, h) => s + Math.abs(polyArea(h.ring.pts)), 0);
function polyArea(r: Pt[]) {
  let s = 0;
  for (let i = 0; i < r.length; i++) s += r[i][0] * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * r[i][1];
  return s / 2;
}

/** Length of the segment a→b that lies in the part's material (bore and holes removed). */
function lengthInShape(g: Flat, a: Pt, b: Pt): number {
  const ts = [0, 1, ...g.outline.crossings(a, b)];
  for (const h of g.holes) ts.push(...h.ring.crossings(a, b));
  // the bore: |a + t(b-a)| = rBore
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const A = dx * dx + dy * dy, B = 2 * (a[0] * dx + a[1] * dy), C = a[0] ** 2 + a[1] ** 2 - g.rBore ** 2;
  const disc = B * B - 4 * A * C;
  if (disc > 0) for (const s of [-1, 1]) { const t = (-B + s * Math.sqrt(disc)) / (2 * A); if (t > 0 && t < 1) ts.push(t); }
  ts.sort((u, v) => u - v);
  let len = 0;
  const L = Math.hypot(dx, dy);
  for (let i = 0; i + 1 < ts.length; i++) {
    const tm = (ts[i] + ts[i + 1]) / 2;
    if (ts[i + 1] - ts[i] > 1e-12 && shapeContains(g, [a[0] + dx * tm, a[1] + dy * tm])) len += (ts[i + 1] - ts[i]) * L;
  }
  return len;
}

// ---------------------------------------------------------------- layout
/**
 * Sideways room for a tip of width wTip centred at angle deg: distance from a radial strip
 * (rEnd - depth .. rEnd) to the nearest spoke, in plan.
 */
export function gapClearance(wh: Wheel, a: number, wTip: number, rEnd: number, depth = 60): number {
  const strip = rotRing(box(rEnd - depth, -wTip / 2, rEnd, wTip / 2), a);
  const centre = pol(rEnd - depth / 2, a), reach = Math.hypot(depth, wTip) / 2;
  let best = Infinity;
  for (const s of wh.spokes) {
    if (pointSegDist(centre, s.a, s.b) - reach >= best) continue; // can't be nearer than the best so far
    if (pointInRing(s.a, strip)) return -wh.p.spokeD / 2;
    for (let i = 0; i < 4; i++) best = Math.min(best, segSegDist(s.a, s.b, strip[i], strip[(i + 1) % 4]));
  }
  return best - wh.p.spokeD / 2;
}

/** Exactly even spacing (360/n), rotated to give the tips the most room between spokes; ties go to the farthest from the valve. */
function evenTipAngles(wh: Wheel, n: number, wTip: number, rEnd: number, step = 0.05): number[] {
  let best: { key: [number, number]; angs: number[] } | undefined;
  for (let k = 0; k * step < 360 / n; k++) {
    const angs = Array.from({ length: n }, (_, j) => pmod(k * step + (j * 360) / n, 360));
    const c = Math.min(...angs.map((a) => gapClearance(wh, a, wTip, rEnd)));
    const key: [number, number] = [r2(c), Math.min(...angs.map((a) => adiff(a, wh.valveDeg())))];
    if (!best || lexCmp(key, best.key) > 0) best = { key, angs };
  }
  return best!.angs.sort((a, b) => a - b);
}

function* combinations(n: number, k: number, start = 0, acc: number[] = []): Generator<number[]> {
  if (acc.length === k) { yield acc; return; }
  for (let i = start; i < n; i++) yield* combinations(n, k, i + 1, [...acc, i]);
}

/**
 * Every tip in a gap between two rim holes. Among all choices of n gaps, keep those whose tips
 * clear the spokes by wantClear (else the best available), then the closest to evenly spaced,
 * then the farthest from the valve.
 */
function tipAngles(wh: Wheel, n: number, wTip: number, rEnd: number, wantClear = 4): number[] {
  const H = wh.p.spokes, pitch = wh.holePitch;
  const mids = Array.from({ length: H }, (_, k) => (k + 0.5) * pitch);
  const clear = mids.map((m) => gapClearance(wh, m, wTip, rEnd));
  let best: { key: number[]; angs: number[] } | undefined;
  for (const combo of combinations(H, n)) {
    const angs = combo.map((k) => mids[k]);
    const err = Math.max(...angs.map((a, i) => Math.abs(pmod(angs[(i + 1) % n] - a, 360) - 360 / n)));
    const cmin = Math.min(...combo.map((k) => clear[k]));
    const valve = Math.min(...angs.map((a) => adiff(a, wh.valveDeg())));
    const key = [cmin >= wantClear ? 0 : 1, Math.round(err * 1e6) / 1e6, cmin < wantClear ? -cmin : 0, -valve];
    if (!best || lexCmp(key, best.key) < 0) best = { key, angs };
  }
  return best!.angs.sort((a, b) => a - b);
}

const holeSize = (pp: Spec) => pp.tieW + pp.tieClear;
export const rowOffset = (pp: PanelSpec) => (pp.rowsOnStripEdges ? pp.stripW / 2 : pp.stripW / 2 + pp.gridStripGap + (pp.tieW + pp.tieClear) / 2);
export const pitchY = (pp: PanelSpec) => pp.gridPitchY || pp.stripW;
/** Narrowest the blade can be: strip + (gap, hole, edge) on each side. */
export const tipWidth = (pp: PanelSpec) => Math.ceil(2 * (rowOffset(pp) + (pp.tieW + pp.tieClear) / 2 + pp.gridEdge));
const hasPlateOn = (pp: Spec, side: number) => pp.plate && (pp.plateSide === 'both' || side === pp.plateSide);
const isCollinear = (arms: number[]) => arms.length === 2 && adiff(arms[0] + 180, arms[1]) < 1e-6;

/** Nipple slots cut into the tip ends (open at the end), one per blade. */
function tipSlots(pp: Spec, arms: number[], rhoEnd: number): Pt[][] {
  if (!pp.slot) return [];
  const [w, depth] = pp.slot;
  return arms.map((a) => rotRing(box(rhoEnd - depth, -w / 2, rhoEnd + 10, w / 2), a));
}

// Holes are rebuilt many times while the outline is fitted; the same hole always has the same shape.
let holeCache = new Map<string, Hole>();
function holeAt(pp: Spec, x: number, y: number, a: number): Hole {
  const key = `${x},${y},${a},${pp.tieW + pp.tieClear},${pp.cutCornerR}`;
  let h = holeCache.get(key);
  if (!h) {
    const c = rot([x, y], a), s = holeSize(pp);
    const f = filletRing(ccw(rectPts(c[0], c[1], a, s, s)), pp.cutCornerR);
    h = { c, a, x, y, bulge: f.bulge, ring: new Ring(f.sampled) };
    holeCache.set(key, h);
  }
  return h;
}

/** Filled ring q lies inside the outline with at least m of material to its edge. */
const insideBy = (outline: Ring, q: Ring, m: number) => outline.contains(q.pts[0]) && outline.boundaryDist(q, m) >= m;

function filletedOutline(pp: Spec, add: Pt[][], cut: Pt[][]) {
  const outlinePts = ccw(cleanRing(outlineOf(add, cut)));
  const f = filletRing(outlinePts, pp.cornerR);
  return { outlinePts, outlineBulge: f.bulge, outline: new Ring(f.sampled) };
}

function flatGeometry(wh: Wheel, pp: Spec, side: number, arms: number[], rhoEnd: number): Flat {
  if (!isCollinear(arms)) {
    if (arms.length >= 3 && pp.pushOut && pp.plate) return flatStar(wh, pp, side, arms, rhoEnd);
    return flatCore(pp, side, arms, rhoEnd);
  }
  // Two collinear blades: the outline follows the hole lattice. Plate edges sit gridEdge outside a
  // lattice column/row.
  const hole = holeSize(pp), step = pp.holesEvery * pp.ledPitch, yRow = rowOffset(pp), edge = pp.gridEdge;
  const cols = Array.from({ length: 12 }, (_, k) => yRow + k * pitchY(pp) + hole / 2 + edge);
  const W = Math.max(...cols.filter((v) => v <= pp.plateHalfW + step / 2));
  if (pp.pushOut) {
    // One lattice, phase 0, centre column kept; each half slides outward by the same amount (the
    // plate end moves with its holes, the taper still ends at plateTaperEnd).
    const Ls = Array.from({ length: 59 }, (_, i) => (i + 1) * step + hole / 2 + edge);
    const L = Ls.reduce((b, v) => (Math.abs(v - pp.plateLen) < Math.abs(b - pp.plateLen) ? v : b));
    const g0 = flatCore(pp, side, arms, rhoEnd, L, W, 0, 0);
    const n0 = g0.holeRhos.length;
    let s = Math.max(0, rhoEnd - edge - hole / 2 - g0.holeRhos.at(-1)!); // last row hole lands gridEdge from the tip
    s = Math.min(s, step - 1e-3);
    while (s > 0) {
      if (flatCore(pp, side, arms, rhoEnd, L + s, W, 0, s).holeRhos.length >= n0) break;
      s = Math.max(0, s - 0.05);
    }
    s = Math.floor(s * 100) / 100;
    let g = flatCore(pp, side, arms, rhoEnd, L + s, W, 0, s);
    if (hasPlateOn(pp, side) && pp.plateTaperCols) {
      // Steepest taper that still keeps the target hole of the second row gridEdge inside the edge.
      const yt = yRow + pitchY(pp);
      const xFlat = L + s - hole / 2 - edge; // last column of the full-width plate
      const xt = xFlat + pp.plateTaperCols * step;
      const sq = new Ring(rotRing(box(xt - hole / 2, yt - hole / 2, xt + hole / 2, yt + hole / 2), arms[0]));
      // hole present AND its square (sharp corners: conservative) a full gridEdge from the outline
      const has = (gg: Flat) => gg.holeXY!.some(([hx, hy]) => Math.abs(hx - xt) < 1e-6 && Math.abs(Math.abs(hy) - yt) < 1e-6)
        && gg.outline.boundaryDist(sq, edge) >= edge;
      const withTaper = (te: number) => flatCore({ ...pp, plateTaperEnd: te }, side, arms, rhoEnd, L + s, W, 0, s);
      let lo = xt, hi = pp.plateTaperEnd || rhoEnd;
      if (has(withTaper(hi))) {
        for (let i = 0; i < 18; i++) {
          const mid = (lo + hi) / 2;
          if (has(withTaper(mid))) hi = mid; else lo = mid;
        }
        const te = Math.ceil(hi * 10) / 10;
        g = withTaper(te);
        g.taperEnd = te;
      }
    }
    g.gridShift = s;
    return g;
  }
  // Without the push-out: the tip end is placed so the gap beyond the last hole equals the gap
  // from the first hole to the bore (never longer than asked).
  let best: { key: [number, number]; g: Flat } | undefined;
  for (const phase of [0, 0.5]) {
    const Ls = Array.from({ length: 60 }, (_, i) => (i + phase) * step).filter((v) => v > 0).map((v) => v + hole / 2 + edge);
    const L = Ls.reduce((b, v) => (Math.abs(v - pp.plateLen) < Math.abs(b - pp.plateLen) ? v : b));
    const g1 = flatCore(pp, side, arms, rhoEnd, L, W, phase);
    let end = g1.holeRhos.at(-1)! + hole / 2 + g1.equalGap[0];
    if (end > rhoEnd + 0.5) end = rhoEnd; // would overshoot the tip target: keep the asked length
    const g2 = flatCore(pp, side, arms, end, L, W, phase);
    const key: [number, number] = [r3(rhoEnd - end), -g2.holes.length];
    if (!best || lexCmp(key, best.key) < 0) best = { key, g: g2 };
  }
  return best!.g;
}

/**
 * Three or more blades with the same pattern as the 2-blade part: every blade is the 2-blade
 * design's blade (plate, fitted taper, rows on the strip edges pushed out to the tip). Blades are
 * joined at the hub; each hole belongs to the blade whose axis it is nearest, and where two
 * blades' grids meet, a hole is dropped if it would leave less than gridEdge of material to a hole
 * of the other blade.
 */
function flatStar(wh: Wheel, pp: Spec, side: number, arms: number[], rhoEnd: number): Flat {
  const n = arms.length;
  const g2 = flatGeometry(wh, pp, side, [0, 180], rhoEnd); // the reference blade (own frame)
  const edge = pp.gridEdge;
  const E = g2.rhoEnd, wt = g2.wTip, w0 = g2.w0;
  const [L, W] = g2.plateLW!, c = g2.plateC!;
  const hwArm = (rho: number) => (w0 - (w0 - wt) * clamp(rho / E, 0, 1)) / 2;
  const h1 = hwArm(L + c);
  const petal: Pt[][] = [
    [[0, hwArm(0)], [E, wt / 2], [E, -wt / 2], [0, -hwArm(0)]],
    [[0, -W], [L, -W], [L + c, -h1], [L + c, h1], [L, W], [0, W]],
  ];
  // hub: straight edges joining neighbouring plate corners, so no slots are left between the plates
  const hub = convexHull(arms.flatMap((a) => [rot([L, -W], a), rot([L, W], a)]));
  const o = filletedOutline(pp, [...arms.flatMap((a) => petal.map((r) => rotRing(r, a))), hub], tipSlots(pp, arms, E));
  const rBore = g2.rBore;
  // half-angles to the neighbouring blades (counter-clockwise and clockwise)
  const srt = arms.map((a) => pmod(a, 360)).sort((a, b) => a - b);
  const half = srt.map((a, i) => [pmod(srt[(i + 1) % n] - a, 360) / 2, pmod(a - srt[(i - 1 + n) % n], 360) / 2]);
  const cand: (Hole & { frac: number; blade: number })[] = [];
  srt.forEach((a, bi) => {
    const [hp, hm] = half[bi];
    for (const [x, y] of g2.holeXY!) {
      if (x <= 1e-6) continue;
      const off = deg(Math.atan2(y, x));
      const frac = off >= 0 ? off / hp : -off / hm;
      if (frac >= 1 - 1e-9) continue; // nearer another blade's axis
      const h = holeAt(pp, x, y, a);
      if (!insideBy(o.outline, h.ring, edge - 0.05) || h.ring.areaDist([0, 0]) - rBore < pp.boreEdge - 0.01) continue;
      cand.push({ ...h, frac: Math.round(frac * 1e6) / 1e6, blade: bi });
    }
  });
  const drop = new Set<number>();
  for (let i = 0; i < cand.length; i++) {
    for (let j = i + 1; j < cand.length; j++) {
      const A = cand[i], B = cand[j];
      if (A.blade === B.blade || A.ring.boundaryDist(B.ring, edge) >= edge - 1e-6) continue;
      if (A.frac >= B.frac) drop.add(i);
      if (B.frac >= A.frac) drop.add(j);
    }
  }
  const keep = cand.filter((_, k) => !drop.has(k));
  const g: Flat = {
    ...g2, arms, ...o, holes: keep, holeXY: null, star: true, holesDropped: drop.size,
    nGrid: keep.filter((h) => Math.abs(Math.abs(h.y) - g2.yRow) > 1e-6).length,
    holesPerBlade: srt.map((_, bi) => keep.filter((h) => h.blade === bi).length),
  };
  // hub section of each blade: across the blade at the contact ring, within the blade's own sector
  const rc = (side < 0 ? wh.p.pcdLeft : wh.p.pcdRight) / 2;
  g.netWCenter = Math.min(...srt.map((a, bi) => {
    const [hp, hm] = half[bi];
    return lengthInShape(g, rot([rc, -rc * Math.tan(rad(Math.min(hm, 89)))], a), rot([rc, rc * Math.tan(rad(Math.min(hp, 89)))], a));
  }));
  return g;
}

function flatCore(pp: Spec, side: number, arms: number[], rhoEnd: number,
  Lsnap?: number, Wsnap?: number, phaseFix?: number, shift = 0): Flat {
  const rBore = pp.boreD / 2;
  const wTip = tipWidth(pp);
  // w0 must keep hubW of material between neighbouring arms round the bore
  const n = arms.length;
  const minGap = n > 1 ? Math.min(...arms.map((a, i) => pmod(arms[(i + 1) % n] - a, 360))) : 360;
  const need = rBore + pp.hubW;
  const w0 = n > 2 ? Math.max(pp.wCenter, 2 * need * Math.sin(rad(minGap / 2)) + 2) : Math.max(pp.wCenter, 2 * need + 2);
  const hwArm = (rho: number) => (w0 - (w0 - wTip) * clamp(rho / rhoEnd, 0, 1)) / 2;
  const add: Pt[][] = arms.map((a) => rotRing([[0, hwArm(0)], [rhoEnd, wTip / 2], [rhoEnd, -wTip / 2], [0, -hwArm(0)]], a));
  const hasPlate = hasPlateOn(pp, side);
  let L = pp.plateLen, W = pp.plateHalfW, c = pp.plateTaper;
  if (Lsnap !== undefined) L = Lsnap;
  if (Wsnap !== undefined) W = Wsnap;
  if (pp.plateTaperEnd) c = pp.plateTaperEnd - L;
  if (hasPlate) { // straight-edged plate along arm 0's axis (and the opposite blade for 2 strips)
    const h1 = hwArm(L + c);
    add.push(rotRing(convexHull([[-L, -W], [L, -W], [L + c, -h1], [L + c, h1], [L, W], [-L, W], [-L - c, h1], [-L - c, -h1]]), arms[0]));
  }
  const hwSpec: HwSpec = { w0, wTip, rhoEnd, plate: hasPlate ? [L, W, c] : null };
  const hw = hwFn(hwSpec);
  const o = filletedOutline(pp, add, tipSlots(pp, arms, rhoEnd));
  const hole = holeSize(pp);
  const pitch = pp.ledPitch;
  let rhoLed1 = rhoEnd - 2; // the strip runs to the tip
  if (pp.slot) rhoLed1 = Math.min(rhoLed1, rhoEnd - pp.slot[1] - 1); // ...or stops short of the nipple
  // Tie holes. Two collinear blades: ONE lattice for the whole part (holesEvery LED pixels along,
  // the strip width across, symmetric about the centre, columns either side of an LED-strip lane),
  // so holes on both blades and the plate line up and ties across the strip land between LEDs.
  // A hole is kept only if it sits at least gridEdge inside every edge and boreEdge from the bore.
  // Other layouts: each blade gets its own two rows, placed for equal gaps at the bore and the tip.
  const step = pp.holesEvery * pitch;
  const yRow = rowOffset(pp), edge = pp.gridEdge;
  const farFromBore = (h: Hole) => Math.hypot(...h.c) - hole * Math.SQRT1_2 - rBore >= pp.boreEdge || h.ring.areaDist([0, 0]) - rBore >= pp.boreEdge - 0.01;
  const holeOk = (h: Hole) => farFromBore(h) && insideBy(o.outline, h.ring, edge - 0.05);
  const holes: Hole[] = [];
  let nGrid = 0, holeRhos: number[], equalGap: [number, number], latticePhase: number | null = null, holeXY: Pt[] | null = null;
  if (isCollinear(arms)) {
    const halfW = Math.max(hw(0), w0 / 2) + 1;
    let best: { key: [number, number]; hs: Hole[]; rows: number[]; gaps: [number, number]; phase: number } | undefined;
    for (const phase of phaseFix === undefined ? [0, 0.5] : [phaseFix]) {
      const imax = Math.floor(rhoEnd / step) + 2;
      const xs: number[] = [];
      for (let i = -imax; i <= imax; i++) {
        const x = (i + phase) * step;
        if (Math.abs(x) < 1e-9) { if (pp.centerCol) xs.push(0); } else xs.push(x + Math.sign(x) * shift);
      }
      const ys: number[] = [];
      for (let k = 0; yRow + k * pitchY(pp) - hole / 2 < halfW; k++) ys.push(yRow + k * pitchY(pp), -(yRow + k * pitchY(pp)));
      const hs: Hole[] = [];
      for (const x of xs) {
        for (const y of ys) {
          if (!o.outline.contains(rot([x, y], arms[0]))) continue;
          const h = holeAt(pp, x, y, arms[0]);
          if (holeOk(h)) hs.push(h);
        }
      }
      const rows = hs.filter((h) => Math.abs(h.y - yRow) < 1e-6 && h.x > 0).map((h) => h.x).sort((a, b) => a - b);
      if (!rows.length) continue;
      const gapTip = rhoEnd - (rows.at(-1)! + hole / 2);
      const gapBore = Math.min(...hs.filter((h) => Math.abs(Math.abs(h.y) - yRow) < 1e-6).map((h) => h.ring.areaDist([0, 0]))) - rBore;
      const key: [number, number] = [Math.abs(gapTip - gapBore), -hs.length];
      if (!best || lexCmp(key, best.key) < 0) best = { key, hs, rows, gaps: [gapBore, gapTip], phase };
    }
    if (!best) throw new Error('No tie holes fit on the blade: it is too narrow or too short for the hole and edge sizes.');
    holes.push(...best.hs);
    holeRhos = best.rows; equalGap = best.gaps; latticePhase = best.phase;
    holeXY = best.hs.map((h) => [h.x, h.y]);
    nGrid = best.hs.filter((h) => Math.abs(Math.abs(h.y) - yRow) > 1e-6).length;
  } else {
    // keep edge from the outline and from the bore
    const safe = (q: Ring) => insideBy(o.outline, q, edge - 0.05) && q.areaDist([0, 0]) >= rBore + edge - 0.05;
    const gapIn = (rho: number) => holeAt(pp, rho, yRow, 0).ring.areaDist([0, 0]) - rBore;
    const gapOut = (rho: number) => rhoEnd - (rho + hole / 2);
    const fits = (rhos: number[]) => {
      for (const rho of rhos) for (const a of arms) for (const y of [yRow, -yRow]) if (!safe(holeAt(pp, rho, y, a).ring)) return false;
      const inner = arms.flatMap((a) => [yRow, -yRow].map((y) => holeAt(pp, rhos[0], y, a).ring));
      for (let i = 0; i < inner.length; i++) for (let j = i + 1; j < inner.length; j++) if (inner[i].boundaryDist(inner[j], edge) < edge) return false;
      return true;
    };
    let found: number[] | undefined;
    for (let k = Math.floor((rhoEnd - rBore) / step) + 1; k >= 2 && !found; k--) {
      const span = (k - 1) * step;
      let lo = rBore, hi = rhoEnd - span;
      for (let i = 0; i < 60; i++) {
        const mid = (lo + hi) / 2;
        if (gapIn(mid) < gapOut(mid + span)) lo = mid; else hi = mid;
      }
      const rhos = Array.from({ length: k }, (_, j) => lo + j * step);
      if (Math.min(gapIn(rhos[0]), gapOut(rhos.at(-1)!)) >= edge && fits(rhos)) found = rhos;
    }
    if (!found) throw new Error('No tie holes fit on the blades: they are too narrow or too short for the hole and edge sizes.');
    holeRhos = found;
    equalGap = [gapIn(found[0]), gapOut(found.at(-1)!)];
    for (const a of arms) for (const rho of found) for (const y of [yRow, -yRow]) holes.push(holeAt(pp, rho, y, a));
  }
  // LED strip: pixel boundaries on the hole centres, starting just outside the bore
  const rhoLed0 = holeRhos[0] - pitch * Math.floor((holeRhos[0] - rBore - pp.stripStartGap) / pitch);
  const g: Flat = {
    arms, ...o, holes, rBore, rhoEnd, wTip, w0, hwSpec, hw, holeRhos, yRow, equalGap,
    rhoTie: holeRhos.at(-1)!, // outermost pair: tip-to-tip ties
    rhoLed0, rhoLed1, nLeds: Math.floor((rhoLed1 - rhoLed0) / pp.ledPitch),
    netWCenter: 0, nGrid, hasPlate, latticePhase, holeXY,
    plateLW: hasPlate ? [r2(L), r2(W)] : null, plateC: hasPlate ? r2(c) : null,
  };
  // net material across the blade axis at the centre (through the bore): carries the hub bending moment
  g.netWCenter = lengthInShape(g, rot([0, -400], arms[0]), rot([0, 400], arms[0]));
  return g;
}

// ---------------------------------------------------------------- mechanics
/** The bent shape as tables: plan radius and height every d along the blade from rc, straight beyond. */
export interface BendTable { rc: number; d: number; z0: number; endPhi: number; rPlan: number[]; zMid: number[] }

export interface Mech {
  F: number; compliance: number; clampN: number; zTip: number; zContact: number; rContact: number; z0: number;
  sigmaHub: number; sigmaMax: number; sigmaAt: [number, number][];
  tipPlanR: number; shortening: number;
  bend: BendTable;
  planR: (rho: number) => number;   // plan radius on the wheel of flat radius rho
  rhoOf: (r: number) => number;     // inverse of planR
  zAtRho: (rho: number) => number;  // mid-plane height (|z|) at flat radius rho
  zMid: (r: number) => number;      // mid-plane height (|z|) at plan radius r
}

/**
 * Each arm is a tapered cantilever from the contact ring (spoke heads) to the tip ties,
 * integrated along its own length rho, with a little extra rotation from the hub region.
 * Gives the tip force, clamp, stress, and the bent shape: plan radius r(rho) and height z(rho).
 */
function mechanics(wh: Wheel, pp: Spec, side: number, g: Flat, zM = 0): Mech {
  const t = pp.thickness, E = pp.E;
  const c2f = side < 0 ? wh.p.c2fLeft : wh.p.c2fRight, pcd = side < 0 ? wh.p.pcdLeft : wh.p.pcdRight;
  const zContact = c2f + wh.p.flangeT / 2 + Math.max(wh.p.headH, wh.p.spokeD);
  const rc = pcd / 2, rt = g.rhoTie;
  const z0 = zContact + t / 2, zTip = side * zM + t / 2; // the tips' inner faces meet in the plane z = zM
  const Lm = rt - rc;
  const I = (rho: number) => (2 * g.hw(rho) * t ** 3) / 12;
  const d = 0.25;
  const rhos = Array.from({ length: Math.floor(Lm / d) + 1 }, (_, k) => rc + k * d);
  let slope = (Lm * rc) / (E * I(0)), w = 0;
  const ws: number[] = [], sl: number[] = [];
  for (const rho of rhos) { // unit tip load, small-slope beam
    ws.push(w); sl.push(slope);
    slope += ((rt - rho) / (E * I(rho))) * d;
    w += slope * d;
  }
  const F = (z0 - zTip) / ws.at(-1)!;
  // bent shape: walk along the arm with the actual slope angle
  const rPlan: number[] = [], zMidA: number[] = [];
  let r = rc, z = z0;
  rhos.forEach((_, k) => {
    rPlan.push(r); zMidA.push(z);
    const phi = Math.atan(F * sl[k]);
    r += Math.cos(phi) * d; z -= Math.sin(phi) * d;
  });
  // past the tie point (tip end) the blade continues straight at the end slope
  const endPhi = Math.atan(F * sl.at(-1)!);
  const sig = rhos.filter((_, k) => k % 8 === 0).map((rho) => [rho, (6 * F * (rt - rho)) / (2 * g.hw(rho) * t * t)] as [number, number]);
  const sigmaHub = (6 * F * Lm) / (g.netWCenter * t * t); // through the bore and the holes in line with it
  const bend: BendTable = { rc, d, z0, endPhi, rPlan, zMid: zMidA };
  const fns = bendFns(bend);
  return {
    F, compliance: ws.at(-1)!, clampN: F * pp.strips, zTip, zContact, rContact: rc, z0, sigmaHub,
    sigmaMax: Math.max(...sig.map((s) => s[1]), sigmaHub),
    sigmaAt: sig.filter((_, k) => k % 4 === 0).map(([rr, s]) => [Math.round(rr), r1(s)]),
    tipPlanR: fns.planR(rt), shortening: rt - fns.planR(rt), bend, ...fns,
  };
}

/** Where the bent blade is, from its tables. */
export function bendFns({ rc, d, z0, endPhi, rPlan, zMid: zTab }: BendTable) {
  const n = rPlan.length, rhoLast = rc + (n - 1) * d;
  const idx = (rho: number) => Math.min(n - 1, Math.floor((rho - rc) / d));
  const bisect = (rr: number) => { // first k with rPlan[k] >= rr
    let lo = 0, hi = n;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (rPlan[mid] < rr) lo = mid + 1; else hi = mid; }
    return lo;
  };
  return {
    planR: (rho: number) => (rho <= rc ? rho : rPlan[idx(rho)] + Math.max(0, rho - rhoLast) * Math.cos(endPhi)),
    zAtRho: (rho: number) => (rho <= rc ? z0 : zTab[idx(rho)] - Math.max(0, rho - rhoLast) * Math.sin(endPhi)),
    zMid: (rr: number) => {
      if (rr <= rc) return z0;
      const k = bisect(rr);
      return k >= n ? zTab[n - 1] - (rr - rPlan[n - 1]) * Math.tan(endPhi) : zTab[k];
    },
    rhoOf: (rr: number) => {
      if (rr <= rc) return rr;
      const k = bisect(rr);
      if (k >= n) return rhoLast + (rr - rPlan[n - 1]) / Math.cos(endPhi);
      if (k === 0) return rc;
      return rc + (k - 1) * d + ((rr - rPlan[k - 1]) / (rPlan[k] - rPlan[k - 1])) * d;
    },
  };
}

/** Flat point → where it sits on the wheel (plan view). */
export function toPlan(m: Mech, [x, y]: Pt): Pt {
  const rho = Math.hypot(x, y);
  const k = rho > 1e-9 ? m.planR(rho) / rho : 1;
  return [x * k, y * k];
}
/** Plan point → the flat point it came from. */
function toFlat(m: Mech, [x, y]: Pt): Pt {
  const r = Math.hypot(x, y);
  const k = r > 1e-9 ? m.rhoOf(r) / r : 1;
  return [x * k, y * k];
}

// ---------------------------------------------------------------- checks
interface SideCtx { wh: Wheel; pp: Spec; side: -1 | 1; g: Flat; m: Mech; skip: Set<number> }
const planBodyContains = (c: SideCtx, p: Pt) => bodyContains(c.g, toFlat(c.m, p));
const gapAt = (c: SideCtx, z: number, r: number) => Math.abs(z - c.side * c.m.zMid(r)) - c.pp.thickness / 2 - c.wh.p.spokeD / 2;
const sideName = (s: Spoke) => (s.side < 0 ? 'L' : 'R');

/**
 * The spoke clamped between the tips of one blade: where it meets this panel's inner face (model:
 * tips meet in the centre plane) and how much room it has inside that.
 */
function sandwichReport(c: SideCtx, i: number) {
  const s = c.wh.spokes[i];
  const pts: [number, number][] = [];
  for (let k = 1; k < 1200; k++) {
    const [x, y, z] = s.at(k / 1200), r = Math.hypot(x, y);
    if (r < c.m.rContact + 6 || !planBodyContains(c, [x, y])) continue;
    pts.push([r, gapAt(c, z, r)]);
  }
  const touch = pts.filter(([, gp]) => gp < 0).map(([r]) => r);
  const rT = touch.length ? Math.min(...touch) : null;
  const inside = pts.filter(([r]) => rT === null || r < rT - 5).map(([, gp]) => gp);
  const rt = c.m.planR(c.g.rhoTie);
  let lo = 0, hi = 1;
  for (let k = 0; k < 50; k++) { const mid = (lo + hi) / 2; if (Math.hypot(...s.at(mid).slice(0, 2) as Pt) < rt) lo = mid; else hi = mid; }
  return {
    rimHole: i, spokeSide: sideName(s), ownSide: s.side === c.side,
    spokeOffsetAtTiesMm: r2(s.at(lo)[2]),
    meetsPanelFromR: rT === null ? null : r1(rT),
    minGapInsideMm: inside.length ? r2(Math.min(...inside)) : null,
  };
}

export interface Clearances {
  seatMinGapMm: number | null; armsMinGapMm: number | null; tipsMinGapMm: number | null;
  collisionPoints: number; tipsSideClearMm: number; minGapMm: number;
  where: Record<string, { spokeHole: number; spokeSide: string; r: number } | null>;
  sandwichedSpoke?: ReturnType<typeof sandwichReport>;
}

function clearances(c: SideCtx): Clearances {
  const zones: Record<string, [number, { spokeHole: number; spokeSide: string; r: number } | null]> = {
    seat: [1e9, null], arms: [1e9, null], tips: [1e9, null],
  };
  let collisions = 0;
  const rSeat = c.m.rContact + 6, rTip = c.m.tipPlanR - 40;
  for (const s of c.wh.spokes) {
    if (c.skip.has(s.i)) continue;
    for (let k = 1; k < 600; k++) {
      const [x, y, z] = s.at(k / 600), r = Math.hypot(x, y);
      if (r < c.g.rBore || !planBodyContains(c, [x, y])) continue;
      const gap = gapAt(c, z, r);
      if (gap < 0) collisions++;
      const zone = r < rSeat ? 'seat' : r > rTip ? 'tips' : 'arms';
      if (gap < zones[zone][0]) zones[zone] = [gap, { spokeHole: s.i, spokeSide: sideName(s), r: r1(r) }];
    }
  }
  // sideways room at the tips: the part of the outline beyond rTip, in plan
  const plan = densify(c.g.outline.pts, 2).map((p) => toPlan(c.m, p));
  const segs: [Pt, Pt][] = [];
  for (let i = 0; i < plan.length; i++) {
    const a = plan[i], b = plan[(i + 1) % plan.length];
    const ra = Math.hypot(...a), rb = Math.hypot(...b);
    if (ra < rTip && rb < rTip) continue;
    if (ra >= rTip && rb >= rTip) { segs.push([a, b]); continue; }
    let lo = 0, hi = 1; // the point where the edge crosses r = rTip
    const at = (t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if ((Math.hypot(...at(mid)) >= rTip) === (ra >= rTip)) lo = mid; else hi = mid; }
    segs.push(ra >= rTip ? [a, at(lo)] : [at(hi), b]);
  }
  let side = Infinity;
  for (const s of c.wh.spokes) {
    if (c.skip.has(s.i)) continue;
    for (const [a, b] of segs) side = Math.min(side, segSegDist(s.a, s.b, a, b));
  }
  const val = (z: string) => (zones[z][1] ? r2(zones[z][0]) : null);
  const out: Clearances = {
    seatMinGapMm: val('seat'), armsMinGapMm: val('arms'), tipsMinGapMm: val('tips'),
    collisionPoints: collisions, tipsSideClearMm: r1(side - c.wh.p.spokeD / 2), minGapMm: 0,
    where: { seat: zones.seat[1], arms: zones.arms[1], tips: zones.tips[1] },
  };
  out.minGapMm = Math.min(...[out.armsMinGapMm, out.tipsMinGapMm, out.tipsSideClearMm].filter((v): v is number => v !== null));
  return out;
}

/**
 * Outer side of the bent panel vs a straight fork blade from the dropout (OLD/2) to the crown. Two
 * checks: the bare panel face (every outline point) and the LED lane, where the strip plus a tie
 * band over it stand proud of the face. Tie heads are on the inner face (or beside the strip,
 * lower than the strip + band), so they don't raise the outside.
 */
function forkClearance(c: SideCtx) {
  const { pp, m, g } = c;
  const old = c.wh.p.old / 2;
  const forkZ = (r: number) => old - (old - pp.forkCrownHalf) * Math.min(1, r / pp.forkCrownR);
  const t = pp.thickness, stack = pp.stripT + pp.tieT;
  let face: [number, Record<string, number> | null] = [1e9, null];
  for (const p of densify(g.outline.pts, 3)) {
    const rho = Math.hypot(...p), r = m.planR(rho), cl = forkZ(r) - (m.zAtRho(rho) + t / 2);
    if (cl < face[0]) face = [cl, { r: r1(r), panelOuterZ: r1(m.zAtRho(rho) + t / 2), forkZ: r1(forkZ(r)) }];
  }
  let lane: [number, Record<string, number> | null] = [1e9, null];
  for (let rho = g.rhoLed0; rho <= g.rhoLed1; rho += 1) {
    const r = m.planR(rho), zo = m.zAtRho(rho) + t / 2 + stack, cl = forkZ(r) - zo;
    if (cl < lane[0]) lane = [cl, { r: r1(r), stripOuterZ: r1(zo), forkZ: r1(forkZ(r)) }];
  }
  const laneGoverns = lane[0] <= face[0];
  return {
    minMm: r1(Math.min(face[0], lane[0])), governedBy: laneGoverns ? 'LED strip + tie band' : 'panel face',
    panelFaceMm: r1(face[0]), ledStripMm: r1(lane[0]), stackOnFaceMm: r2(stack), where: laneGoverns ? lane[1] : face[1],
  };
}

/**
 * Tie heads on the INNER face, across the LED lane at every tie position (not the tip-to-tip
 * ties): room between the head and the spokes below it. Returns the tightest and the positions
 * that don't fit.
 */
function tieHeadCheck(c: SideCtx) {
  const [hw, hl, hh] = c.pp.tieHead;
  const out: { bladeDeg: number; r: number; gapMm: number }[] = [];
  let worst: [number, { bladeDeg: number; r: number } | null] = [1e9, null];
  for (const a of c.g.arms) {
    const ca = Math.cos(rad(a)), sa = Math.sin(rad(a));
    for (const rho of c.g.holeRhos.slice(0, -1)) {
      const centre = toPlan(c.m, rot([rho, 0], a));
      let best = 1e9;
      for (const sp of c.wh.spokes) {
        if (sp.side !== c.side || c.skip.has(sp.i)) continue;
        for (let k = 1; k < 400; k++) {
          const [x, y, z] = sp.at(k / 400);
          if (Math.abs(x - centre[0]) > 8 || Math.abs(y - centre[1]) > 8) continue;
          const [fx, fy] = toFlat(c.m, [x, y]);
          const u = fx * ca + fy * sa, v = -fx * sa + fy * ca;
          if (Math.abs(u - rho) > hw / 2 || Math.abs(v) > hl / 2) continue;
          const r = Math.hypot(x, y);
          best = Math.min(best, gapAt(c, z, r) - hh);
        }
      }
      if (best < 1e8) {
        const rPlan = r1(c.m.planR(rho));
        if (best < worst[0]) worst = [best, { bladeDeg: r2(a), r: rPlan }];
        if (best < 0) out.push({ bladeDeg: r2(a), r: rPlan, gapMm: r2(best) });
      }
    }
  }
  return { headMm: [hw, hl, hh], tightestMm: worst[1] ? r2(worst[0]) : null, where: worst[1], moveOutside: out, nMoveOutside: out.length };
}

function roomTable(c: SideCtx) {
  const t = c.pp.thickness, d = c.wh.p.spokeD;
  const rows: Record<number, { panelToSpokes: number; outerFaceZ: number }> = {};
  for (const r of [40, 60, 80, 100, 130, 160, 200, 240, 270]) {
    const zs: number[] = [];
    for (const s of c.wh.sideSpokes(c.side)) {
      if (!(Math.hypot(...s.a) < r && r < Math.hypot(...s.b))) continue;
      let lo = 0, hi = 1;
      for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; const [x, y] = s.at(mid); if (Math.hypot(x, y) < r) lo = mid; else hi = mid; }
      zs.push(Math.abs(s.at(lo)[2]) + d / 2);
    }
    if (zs.length) rows[r] = { panelToSpokes: r1(c.m.zMid(r) - t / 2 - Math.max(...zs)), outerFaceZ: r1(c.m.zMid(r) + t / 2) };
  }
  return rows;
}

/** Rotation (deg) that gives the part its smallest bounding box on the sheet, and the box (short side first). */
function bestCutRot(g: Flat): [number, [number, number]] {
  let best: { key: [number, number]; a: number; w: number; h: number } | undefined;
  for (let k = 0; k < 720; k++) {
    const a = rad(k * 0.25), c = Math.cos(a), s = Math.sin(a);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of g.outlineBulge) {
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
  m: Mech;
  cutRot: number;
  summary: {
    ledsPerStrip: number; holesPerRow: number; holePitchMm: number; holeRowOffsetMm: number;
    gridShiftOutMm: number | null; gapFirstHoleToBoreMm: number; gapLastHoleToEndMm: number;
    ledStartR: number; ledEndR: number; boreD: number; wCenter: number; wTip: number;
    flatArmEndRho: number; bentArmEndR: number; bendShorteningMm: number; partSizeIn: [number, number]; partSizeMm: [number, number];
    holesPerBlade: number[] | null; holesDroppedWhereBladesMeet: number | null;
    areaCm2: number; massG: number; tipForceN: number; clampForceOnHubN: number;
    sigmaMaxMPa: number; sigmaOk: boolean; stressAlongArm: [number, number][]; sigmaHubSectionMPa: number; netWidthAtHubMm: number;
    contact: { r: number; zInnerFace: number };
    spokeClearance: Clearances; clearanceOk: boolean;
    room: ReturnType<typeof roomTable>; dropoutClearAtHub: number;
    forkClearance: ReturnType<typeof forkClearance>; forkOk: boolean; tieHeadsInside: ReturnType<typeof tieHeadCheck>;
    plate: boolean; plateGridHoles: number; latticePhase: number | null;
    plateLenHalfwidthMm: [number, number] | null; plateTaperMm: number | null; plateTaperEndMm: number | null;
    holesTotal: number;
  };
}

export interface WheelInput extends Partial<WheelSpec> { size?: string }

export interface PanelDesign {
  name: string;
  spec: Spec;
  wheel: Wheel;
  material: string;
  rimNote: string;
  spacingNote: string;
  arms: number[];
  armSpacing: number[];
  tipsBetweenHoles: (string | number)[][];
  sandwich: { bladeDeg: number; rimHole: number } | null;
  tipSlot: { widthMm: number; depthMm: number; nippleInnerEndR: number; slotBottomROnWheel: number } | null;
  tipsMeetAtZMm: number;
  sides: { LEFT: SideResult; RIGHT: SideResult };
  /** Left and right are the same part: one cut file, order two. */
  identical: boolean;
  imbalanceGmmPerPanel: number;
  lateralGBeforeAPanelLifts: number;
  sim: { stripCount: number; ledDensity: number; stripStartMm: number; stripLengthMm: number; ledEndR: number; evenlySpaced: boolean };
  warnings: string[];
}

export function designPanels(wheelIn: WheelInput, panelIn: Partial<PanelSpec>): PanelDesign {
  holeCache = new Map();
  const { size = '700c', ...wp } = wheelIn;
  const mat = panelIn.material ?? PANEL_DEFAULTS.material;
  const material = MATERIALS[mat];
  if (!material) throw new Error(`Unknown material ${mat}.`);
  const pp: Spec = { ...PANEL_DEFAULTS, ...material, ...panelIn, slot: null };
  let wh = new Wheel(wp);
  const wTip = tipWidth(pp);
  let rimNote = '', rEnd: number;
  if (pp.tipEndR) { // measured tip position: make sure the modelled rim sits outside it
    const need = Math.hypot(pp.tipEndR, wTip / 2) + pp.tipClear;
    if (wh.p.rimWallR < need) {
      wh = new Wheel({ ...wp, rimWallR: need, erd: 2 * (need + 4) });
      rimNote = `Rim wall assumed at r = ${need.toFixed(1)} mm, just outside the tip. Measure the rim to confirm.`;
    }
    rEnd = pp.tipEndR;
  } else {
    rEnd = Math.sqrt((wh.p.rimWallR - pp.tipClear) ** 2 - (wTip / 2) ** 2);
  }
  let spacingNote = '';
  let arms: number[] | undefined;
  let sandwichSpoke: number | null = null, sandwichDeg: number | null = null;
  if (pp.evenSpacing) {
    arms = evenTipAngles(wh, pp.strips, wTip, rEnd);
    if (Math.min(...arms.map((a) => gapClearance(wh, a, wTip, rEnd))) < pp.minSpokeClear + 3) {
      arms = undefined;
      if (pp.sandwichOk) {
        // even spacing with one tip centred on a rim hole: that spoke is clamped between the panels
        let best: { key: number[]; ok: boolean; i: number; a0: number } | undefined;
        for (let i = 0; i < wh.p.spokes; i++) {
          const a0 = i * wh.holePitch;
          const others = Array.from({ length: pp.strips - 1 }, (_, j) => pmod(a0 + ((j + 1) * 360) / pp.strips, 360));
          const cmin = Math.min(...others.map((a) => gapClearance(wh, a, wTip, rEnd)));
          const vd = Math.min(...[a0, ...others].map((a) => adiff(a, wh.valveDeg())));
          const ok = cmin >= pp.minSpokeClear + 3 && vd >= 10;
          const key = [ok ? 1 : 0, r2(cmin), vd];
          if (!best || lexCmp(key, best.key) > 0) best = { key, ok, i, a0 };
        }
        if (best?.ok) {
          sandwichSpoke = best.i; sandwichDeg = best.a0;
          arms = Array.from({ length: pp.strips }, (_, j) => pmod(best!.a0 + (j * 360) / pp.strips, 360)).sort((a, b) => a - b);
          spacingNote = `${pp.strips} evenly spaced tips can't all sit between spokes on a ${wh.p.spokes}-spoke wheel: the blade at `
            + `${sandwichDeg.toFixed(2)}° is centred on rim hole ${sandwichSpoke}, and its tips clamp that spoke and nipple between the two panels.`;
        }
      }
      if (!arms) {
        spacingNote = `${pp.strips} evenly spaced tips can't all fit between spokes on a ${wh.p.spokes}-spoke wheel: the tips sit in `
          + 'spoke gaps as close to even as possible. Give the firmware each strip\'s angle.';
      }
    }
  }
  if (!arms) arms = tipAngles(wh, pp.strips, wTip, rEnd);
  const name = `${size}_${wh.p.spokes}h${wh.p.crosses}x_${pp.strips}strips_${mat}`;
  let tipSlot: PanelDesign['tipSlot'] = null;
  if (pp.tipSlot === 'all' || (pp.tipSlot === 'auto' && sandwichSpoke !== null)) {
    const sw = pp.tipSlotW || pp.nippleD + 1;
    const need = rEnd - (wh.nippleTipR() - pp.tipSlotClear); // bent tip end to the slot bottom
    const depth = Math.max(need, 2 * pp.cutCornerR + 0.5);  // (its corner radii shrink to fit if shallow)
    pp.slot = [r2(sw), r2(depth)];
    tipSlot = { widthMm: r2(sw), depthMm: r2(depth), nippleInnerEndR: r1(wh.nippleTipR()), slotBottomROnWheel: r1(rEnd - depth) };
  }
  // Pass 1: each panel alone (tips to the centre plane) gives its compliance. The tie force is the
  // same on both tips, so they meet where the stiffer panel bends less: plane zM.
  const flatCache = new Map<string, Flat>();
  const flat = (side: number, rhoEnd: number) => {
    const key = `${hasPlateOn(pp, side)},${rhoEnd}`;
    let g = flatCache.get(key);
    if (!g) { g = flatGeometry(wh, pp, side, arms!, rhoEnd); flatCache.set(key, g); }
    return g;
  };
  const solve = (side: -1 | 1, zM: number) => {
    let rhoEnd = rEnd;
    for (let i = 0; i < 5; i++) { // lengthen the flat blade until the bent tip end lands on (not past) the target
      const m = mechanics(wh, pp, side, flat(side, rhoEnd), zM);
      rhoEnd += rEnd - m.planR(rhoEnd);
    }
    const g = flat(side, rhoEnd);
    return { g, m: mechanics(wh, pp, side, g, zM) };
  };
  const t = pp.thickness;
  const CL = solve(-1, 0).m, CR = solve(1, 0).m;
  const zM = ((CR.z0 - t / 2) / CR.compliance - (CL.z0 - t / 2) / CL.compliance) / (1 / CL.compliance + 1 / CR.compliance);
  const skip = new Set(sandwichSpoke === null ? [] : [sandwichSpoke]);
  const sideResult = (side: -1 | 1, label: 'LEFT' | 'RIGHT'): SideResult => {
    const { g, m } = solve(side, zM);
    const c: SideCtx = { wh, pp, side, g, m, skip };
    const cl = clearances(c);
    if (sandwichSpoke !== null) cl.sandwichedSpoke = sandwichReport(c, sandwichSpoke);
    const fc = forkClearance(c);
    const [cutRot, size] = bestCutRot(g);
    const area = shapeArea(g);
    return {
      label, side, g, m, cutRot,
      summary: {
        ledsPerStrip: g.nLeds, holesPerRow: g.holeRhos.length, holePitchMm: r2(pp.holesEvery * pp.ledPitch),
        holeRowOffsetMm: r2(g.yRow), gridShiftOutMm: g.gridShift ?? null,
        gapFirstHoleToBoreMm: r2(g.equalGap[0]), gapLastHoleToEndMm: r2(g.equalGap[1]),
        ledStartR: r1(m.planR(g.rhoLed0)), ledEndR: r1(m.planR(g.rhoLed1)),
        boreD: r2(2 * g.rBore), wCenter: r1(g.w0), wTip: g.wTip,
        flatArmEndRho: r1(g.rhoEnd), bentArmEndR: r1(m.planR(g.rhoEnd)), bendShorteningMm: r2(g.rhoEnd - m.planR(g.rhoEnd)),
        partSizeIn: [r2(size[0] / 25.4), r2(size[1] / 25.4)], partSizeMm: [r1(size[0]), r1(size[1])],
        holesPerBlade: g.holesPerBlade ?? null, holesDroppedWhereBladesMeet: g.holesDropped ?? null,
        areaCm2: r1(area / 100), massG: r1((area * t * pp.density) / 1000),
        tipForceN: r2(m.F), clampForceOnHubN: r1(m.clampN),
        sigmaMaxMPa: r1(m.sigmaMax), sigmaOk: m.sigmaMax <= pp.sigmaAllow, stressAlongArm: m.sigmaAt,
        sigmaHubSectionMPa: r1(m.sigmaHub), netWidthAtHubMm: r1(g.netWCenter),
        contact: { r: m.rContact, zInnerFace: r2(m.zContact) },
        spokeClearance: cl, clearanceOk: cl.minGapMm >= pp.minSpokeClear && cl.collisionPoints === 0,
        room: roomTable(c), dropoutClearAtHub: r1(wh.p.old / 2 - (m.zContact + t)),
        forkClearance: fc, forkOk: fc.minMm >= pp.minForkClear, tieHeadsInside: tieHeadCheck(c),
        plate: g.hasPlate, plateGridHoles: g.nGrid, latticePhase: g.latticePhase,
        plateLenHalfwidthMm: g.plateLW, plateTaperMm: g.plateC, plateTaperEndMm: g.taperEnd ?? null,
        holesTotal: g.holes.length,
      },
    };
  };
  const L = sideResult(-1, 'LEFT'), R = sideResult(1, 'RIGHT');
  const vx = arms.reduce((s, a) => s + Math.cos(rad(a)), 0), vy = arms.reduce((s, a) => s + Math.sin(rad(a)), 0);
  const armMass = ((bodyArea(L.g) / arms.length) * t * pp.density) / 1000;
  const sig = (g: Flat) => JSON.stringify([g.outlineBulge.map((p) => p.map(r3)), g.holes.map((h) => h.bulge.map((p) => p.map(r3)).join()).sort()]);
  const pairMass = (L.summary.massG + R.summary.massG) / 1000;
  const clamp_ = Math.min(L.summary.clampForceOnHubN, R.summary.clampForceOnHubN);
  const perSide = (s: SideResult) => {
    const out: string[] = [], sm = s.summary, sc = sm.spokeClearance;
    if (!sm.clearanceOk) out.push(`spoke clearance ${sc.minGapMm} mm is under ${pp.minSpokeClear} mm (arms ${sc.armsMinGapMm}, tips sideways ${sc.tipsSideClearMm}${sc.collisionPoints ? `, ${sc.collisionPoints} collision points` : ''}). Don't cut this layout.`);
    if (!sm.sigmaOk) out.push(`bending stress ${sm.sigmaMaxMPa} MPa is over the ${pp.sigmaAllow} MPa target for ${pp.label}.`);
    const fc = sm.forkClearance;
    if (!sm.forkOk) {
      out.push(`${fc.governedBy} ${fc.minMm < 0 ? `hits the (typical) fork by ${-fc.minMm} mm` : `clears the (typical) fork by only ${fc.minMm} mm`}`
        + ` at r ${fc.where?.r} mm; the target is ${pp.minForkClear} mm. Measure the fork.`);
    }
    return out;
  };
  // one warning for both panels when they say the same
  const wl = perSide(L), wr = perSide(R);
  const warnings = [...wl.map((w) => (wr.includes(w) ? `Both panels: ${w}` : `LEFT: ${w}`)), ...wr.filter((w) => !wl.includes(w)).map((w) => `RIGHT: ${w}`)];
  const evenly = new Set(arms.map((a, i) => r3(pmod(arms![(i + 1) % arms!.length] - a, 360)))).size === 1;
  return {
    name, spec: pp, wheel: wh, material: `${pp.label} (${pp.role})`, rimNote, spacingNote, arms,
    armSpacing: arms.map((a, i) => r3(pmod(arms![(i + 1) % arms!.length] - a, 360))),
    tipsBetweenHoles: arms.map((a) => {
      const k = a / wh.holePitch;
      return Math.abs(k - Math.round(k)) < 1e-6 ? ['on hole', Math.round(k)] : [Math.floor(k), Math.floor(k) + 1];
    }),
    sandwich: sandwichSpoke === null ? null : { bladeDeg: sandwichDeg!, rimHole: sandwichSpoke },
    tipSlot, tipsMeetAtZMm: r2(zM), sides: { LEFT: L, RIGHT: R }, identical: sig(L.g) === sig(R.g),
    imbalanceGmmPerPanel: Math.round(Math.hypot(vx, vy) * armMass * 0.4 * L.g.rhoEnd),
    lateralGBeforeAPanelLifts: r1(clamp_ / (pairMass * 9.81)),
    sim: {
      stripCount: pp.strips, ledDensity: Math.round(1000 / pp.ledPitch),
      stripStartMm: Math.round(R.summary.ledStartR), stripLengthMm: Math.round(R.summary.ledEndR - R.summary.ledStartR),
      ledEndR: R.summary.ledEndR, evenlySpaced: evenly,
    },
    warnings,
  };
}

/** Everything computed, as plain data (for the report file). */
export function designReport(d: PanelDesign) {
  const { slot, ...panel } = d.spec;
  const side = (s: SideResult) => ({ ...s.summary, armAnglesDeg: s.g.arms.map(r3) });
  return {
    name: d.name, material: d.material, rimNote: d.rimNote, wheelTypical: d.wheel.p, wheelCheck: d.wheel.check(), panel,
    armAnglesDeg: d.arms.map(r3), armSpacingDeg: d.armSpacing, tipsBetweenHoles: d.tipsBetweenHoles,
    valveDeg: d.wheel.valveDeg(), spacingNote: d.spacingNote, sandwich: d.sandwich, tipSlot: d.tipSlot,
    tipsMeetAtZMm: d.tipsMeetAtZMm, sides: { LEFT: side(d.sides.LEFT), RIGHT: side(d.sides.RIGHT) },
    identicalParts: d.identical, imbalanceGmmPerPanel: d.imbalanceGmmPerPanel,
    lateralGBeforeAPanelLifts: d.lateralGBeforeAPanelLifts, simSettings: d.sim, warnings: d.warnings,
  };
}

/** LED strip lines and sensor boards on the flat part (for drawings). */
export function flatExtras(d: PanelDesign, s: SideResult) {
  const { g } = s, pp = d.spec;
  const leds = g.arms.map((a) => [rot([g.rhoLed0, 0], a), rot([g.rhoLed1, 0], a)] as [Pt, Pt]);
  const sensors = pp.sensor && s.side === pp.sensorSide
    ? (pp.sensorAll ? g.arms : g.arms.slice(0, 1)).map((a) => rotRing(box(pp.sensorR - pp.sensorBoard[0] / 2, -pp.sensorBoard[1] / 2,
      pp.sensorR + pp.sensorBoard[0] / 2, pp.sensorBoard[1] / 2), a))
    : [];
  return { leds, sensors };
}


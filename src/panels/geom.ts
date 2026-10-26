// Plane geometry for the panel generator: straight-edged rings, true-arc fillets, distances and
// the few boolean operations the outline needs (Clipper does the unions and differences, on
// integer coordinates, so edges that meet exactly, as the blades do at the hub, are handled robustly).
import * as clipperNs from 'clipper-lib';

// clipper-lib is CommonJS: depending on the bundler its exports arrive as the namespace or as its default.
const ClipperLib = ((clipperNs as unknown as { default?: typeof clipperNs }).default ?? clipperNs) as typeof clipperNs;
const SCALE = 1e6; // nm: Clipper works on integers

export type Pt = [number, number];
/** A polyline vertex with the DXF bulge of the segment that starts at it (0 = straight). */
export type BulgePt = [number, number, number];

export const rad = (deg: number) => (deg * Math.PI) / 180;
export const deg = (r: number) => (r * 180) / Math.PI;
/** Python-style modulo: the result has the sign of the divisor. */
export const pmod = (a: number, n: number) => a - Math.floor(a / n) * n;
/** Smallest angle between two directions, in degrees. */
export const adiff = (a: number, b: number) => Math.abs(pmod(a - b + 180, 360) - 180);
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function rot([x, y]: Pt, a: number): Pt {
  const c = Math.cos(rad(a)), s = Math.sin(rad(a));
  return [x * c - y * s, x * s + y * c];
}
export const rotRing = (ring: Pt[], a: number) => ring.map((p) => rot(p, a));
export const pol = (r: number, a: number): Pt => [r * Math.cos(rad(a)), r * Math.sin(rad(a))];
export const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Axis-aligned box as a counter-clockwise ring. */
export const box = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

export function signedArea(ring: Pt[]): number {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i], [x1, y1] = ring[(i + 1) % ring.length];
    s += x0 * y1 - x1 * y0;
  }
  return s / 2;
}
export const ccw = (ring: Pt[]) => (signedArea(ring) > 0 ? ring : [...ring].reverse());

/** Rectangle L long (along along_deg) and W wide, centred on (cx, cy). */
export function rectPts(cx: number, cy: number, alongDeg: number, L: number, W: number): Pt[] {
  const ca = Math.cos(rad(alongDeg)), sa = Math.sin(rad(alongDeg));
  return ([[-L / 2, -W / 2], [L / 2, -W / 2], [L / 2, W / 2], [-L / 2, W / 2]] as Pt[])
    .map(([x, y]) => [cx + x * ca - y * sa, cy + x * sa + y * ca]);
}

/** Convex hull (monotone chain), counter-clockwise. */
export function convexHull(pts: Pt[]): Pt[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Pt[] = [], upper: Pt[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  for (const q of [...p].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/**
 * Outer ring of (union of `add`) minus `cut`. When the result falls apart, the largest piece is kept.
 */
export function outlineOf(add: Pt[][], cut: Pt[][] = []): Pt[] {
  const toPath = (r: Pt[]) => r.map(([x, y]) => ({ X: Math.round(x * SCALE), Y: Math.round(y * SCALE) }));
  const { Clipper, ClipType, PolyType, PolyFillType } = ClipperLib;
  const run = (type: number, subj: clipperNs.Paths, clip: clipperNs.Paths) => {
    const c = new Clipper();
    c.AddPaths(subj, PolyType.ptSubject, true);
    if (clip.length) c.AddPaths(clip, PolyType.ptClip, true);
    const out: clipperNs.Paths = [];
    c.Execute(type, out, PolyFillType.pftNonZero, PolyFillType.pftNonZero);
    return out;
  };
  let paths = run(ClipType.ctUnion, add.map((r) => toPath(ccw(r))), []);
  if (cut.length) paths = run(ClipType.ctDifference, paths, cut.map((r) => toPath(ccw(r))));
  let best: Pt[] = [], bestA = -1;
  for (const path of paths) {
    const ring = path.map((q) => [q.X / SCALE, q.Y / SCALE] as Pt);
    const a = signedArea(ring); // holes come back clockwise (negative)
    if (a > bestA) { bestA = a; best = ring; }
  }
  return best;
}

/** Drop vertices that are collinear with their neighbours or double back (zero-width spikes). */
export function cleanRing(pts: Pt[], tol = 1e-3): Pt[] {
  pts = [...pts];
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const p0 = pts[(i - 1 + pts.length) % pts.length], p1 = pts[i], p2 = pts[(i + 1) % pts.length];
      if (dist(p0, p1) < tol) { pts.splice(i, 1); changed = true; break; }
      const cross = (p1[0] - p0[0]) * (p2[1] - p1[1]) - (p1[1] - p0[1]) * (p2[0] - p1[0]);
      if (Math.abs(cross) < tol * Math.max(1e-9, dist(p0, p1) + dist(p1, p2))) { pts.splice(i, 1); changed = true; break; }
    }
  }
  return pts;
}

/**
 * Fillet every corner of a closed straight-edged ring (counter-clockwise, no repeated point) with
 * radius r. A corner whose edges are too short for the full radius gets a smaller one.
 * Returns the outline as bulge points (straight lines and true circular arcs, for DXF) and as a
 * ring sampled every 10° along the arcs (for analysis and drawing).
 */
export function filletRing(pts: Pt[], r: number): { bulge: BulgePt[]; sampled: Pt[] } {
  const n = pts.length;
  const bulge: BulgePt[] = [], sampled: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    const a: Pt = [p0[0] - p1[0], p0[1] - p1[1]], b: Pt = [p2[0] - p1[0], p2[1] - p1[1]];
    const la = Math.hypot(...a), lb = Math.hypot(...b);
    const ua: Pt = [a[0] / la, a[1] / la], ub: Pt = [b[0] / lb, b[1] / lb];
    const th = Math.acos(clamp(ua[0] * ub[0] + ua[1] * ub[1], -1, 1)); // corner angle
    const turn = (p1[0] - p0[0]) * (p2[1] - p1[1]) - (p1[1] - p0[1]) * (p2[0] - p1[0]);
    let d = th > 1e-9 ? r / Math.tan(th / 2) : 0;
    let rr = r;
    const lim = 0.49 * Math.min(la, lb);
    if (d > lim) { rr = (r * lim) / d; d = lim; } // edge too short for the full radius: shrink this one
    const sweep = Math.PI - th;
    const t1: Pt = [p1[0] + ua[0] * d, p1[1] + ua[1] * d], t2: Pt = [p1[0] + ub[0] * d, p1[1] + ub[1] * d];
    bulge.push([...t1, (turn < 0 ? -1 : 1) * Math.tan(sweep / 4)], [...t2, 0]);
    // sample the arc: its centre lies along the corner bisector
    const bis: Pt = [ua[0] + ub[0], ua[1] + ub[1]];
    const lbis = Math.hypot(...bis);
    if (sweep < 1e-6 || lbis < 1e-12) { sampled.push(t1, t2); continue; }
    const cd = rr / Math.sin(th / 2);
    const c: Pt = [p1[0] + (bis[0] / lbis) * cd, p1[1] + (bis[1] / lbis) * cd];
    const a1 = Math.atan2(t1[1] - c[1], t1[0] - c[0]), a2 = Math.atan2(t2[1] - c[1], t2[0] - c[0]);
    const da = pmod(a2 - a1 + Math.PI, 2 * Math.PI) - Math.PI;
    const k = Math.max(2, Math.floor(Math.abs(da) / rad(10)) + 1);
    for (let j = 0; j <= k; j++) sampled.push([c[0] + rr * Math.cos(a1 + (da * j) / k), c[1] + rr * Math.sin(a1 + (da * j) / k)]);
  }
  return { bulge, sampled };
}

/** Points along a closed ring, no more than `step` apart (every original vertex kept). */
export function densify(ring: Pt[], step: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const k = Math.max(1, Math.ceil(dist(a, b) / step));
    for (let j = 0; j < k; j++) out.push([a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k]);
  }
  return out;
}

export function pointInRing([x, y]: Pt, ring: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointSegDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const L2 = dx * dx + dy * dy;
  const t = L2 > 0 ? clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2, 0, 1) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** Intersection of two open segments: [t along a, u along b, x, y], or undefined. */
export function segIntersect(a0: Pt, a1: Pt, b0: Pt, b1: Pt): [number, number, number, number] | undefined {
  const [x1, y1] = a0, [x2, y2] = a1, [x3, y3] = b0, [x4, y4] = b1;
  const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(d) < 1e-12) return undefined;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / d;
  if (t > 0 && t < 1 && u > 0 && u < 1) return [t, u, x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
  return undefined;
}

function segsCross(a0: Pt, a1: Pt, b0: Pt, b1: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a0, a1, b0) * o(a0, a1, b1) <= 0 && o(b0, b1, a0) * o(b0, b1, a1) <= 0;
}

export function segSegDist(a0: Pt, a1: Pt, b0: Pt, b1: Pt): number {
  if (segsCross(a0, a1, b0, b1)) return 0;
  return Math.min(pointSegDist(a0, b0, b1), pointSegDist(a1, b0, b1), pointSegDist(b0, a0, a1), pointSegDist(b1, a0, a1));
}

export interface Bbox { x0: number; y0: number; x1: number; y1: number }
export function bboxOf(pts: Pt[]): Bbox {
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const [x, y] of pts) { b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y); b.x1 = Math.max(b.x1, x); b.y1 = Math.max(b.y1, y); }
  return b;
}
const near = (a: Bbox, b: Bbox, m: number) => a.x0 - m <= b.x1 && b.x0 - m <= a.x1 && a.y0 - m <= b.y1 && b.y0 - m <= a.y1;

/** A ring with its edge bounding boxes, for fast distance queries. */
export class Ring {
  readonly bbox: Bbox;
  private eb: Bbox[];
  private bands?: number[][]; // edges crossing each horizontal band, for point-in-ring tests
  constructor(readonly pts: Pt[]) {
    this.bbox = bboxOf(pts);
    this.eb = pts.map((p, i) => bboxOf([p, pts[(i + 1) % pts.length]]));
  }
  private band(y: number, n: number) { return Math.floor(((y - this.bbox.y0) / (this.bbox.y1 - this.bbox.y0 || 1)) * n); }
  contains([x, y]: Pt): boolean {
    const b = this.bbox;
    if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) return false;
    if (this.pts.length < 32) return pointInRing([x, y], this.pts);
    const n = Math.min(256, this.pts.length >> 1);
    if (!this.bands) {
      this.bands = Array.from({ length: n }, () => []);
      this.eb.forEach((e, i) => {
        for (let k = clamp(this.band(e.y0, n), 0, n - 1); k <= clamp(this.band(e.y1, n), 0, n - 1); k++) this.bands![k].push(i);
      });
    }
    let inside = false;
    const P = this.pts;
    for (const i of this.bands[clamp(this.band(y, n), 0, n - 1)]) {
      const [xi, yi] = P[i], [xj, yj] = P[(i + 1) % P.length];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  /**
   * Distance between the boundaries of this ring and another, or 0 where they cross. Only edges
   * within `limit` are looked at, so the answer is exact below `limit` and at least `limit` otherwise.
   */
  boundaryDist(o: Ring, limit = Infinity): number {
    let best = limit;
    if (!near(this.bbox, o.bbox, limit)) return best;
    const P = this.pts, Q = o.pts;
    for (let i = 0; i < P.length; i++) {
      if (!near(this.eb[i], o.bbox, best)) continue;
      for (let j = 0; j < Q.length; j++) {
        if (!near(this.eb[i], o.eb[j], best)) continue;
        best = Math.min(best, segSegDist(P[i], P[(i + 1) % P.length], Q[j], Q[(j + 1) % Q.length]));
        if (best === 0) return 0;
      }
    }
    return best;
  }
  /** Distance from a point to the boundary. */
  pointDist(p: Pt): number {
    let best = Infinity;
    for (let i = 0; i < this.pts.length; i++) best = Math.min(best, pointSegDist(p, this.pts[i], this.pts[(i + 1) % this.pts.length]));
    return best;
  }
  /** Distance from a point to the filled ring (0 inside). */
  areaDist(p: Pt): number { return this.contains(p) ? 0 : this.pointDist(p); }
  /** Parameters (0..1) along a→b where the segment crosses this ring. */
  crossings(a: Pt, b: Pt): number[] {
    const out: number[] = [];
    const sb = bboxOf([a, b]);
    for (let i = 0; i < this.pts.length; i++) {
      if (!near(this.eb[i], sb, 1e-9)) continue;
      const p = this.pts[i], q = this.pts[(i + 1) % this.pts.length];
      const dx = b[0] - a[0], dy = b[1] - a[1], ex = q[0] - p[0], ey = q[1] - p[1];
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-15) continue;
      const t = ((p[0] - a[0]) * ey - (p[1] - a[1]) * ex) / den;
      const u = ((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / den;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1) out.push(t);
    }
    return out;
  }
}

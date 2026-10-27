// The panels' drafting view: the flat part as cut with its dimensions, the bent panel on the
// wheel, and a side section through the hub. Pan by dragging, zoom with the wheel or a pinch,
// double-click (or F) to fit, and M to measure between snapped points.
import { flatExtras, type PanelDesign, type SideResult, toPlan } from './design';
import { densify, pol, type Pt, rot } from './geom';

type Mode = 'flat' | 'plan' | 'section';
interface Style { stroke?: string; fill?: string; width?: number; dash?: number[]; alpha?: number }
type Prim =
  | { k: 'path'; rings: Pt[][]; closed: boolean; s: Style }
  | { k: 'dot'; c: Pt; r: number; fill: string }
  | { k: 'dim'; a: Pt; b: Pt; off: number; text: string; color: string }
  | { k: 'note'; at: Pt; textAt: Pt; text: string; color: string; align?: 'left' | 'right' }
  | { k: 'text'; at: Pt; text: string; color: string; size?: number; bold?: boolean; angle?: number };
interface Scene { prims: Prim[]; snaps: Pt[]; bounds: [Pt, Pt]; xScale: number; title: string; hint: string }

const C = {
  bg: '#0b0e15', grid: '#161b26', gridText: '#4b5466', part: '#1c2330', edge: '#c5cfdd', hole: '#8d98aa',
  dim: '#6fb3ff', grain: '#c9a26b', led: '#ff9f1c', angle: '#c08cff', sensor: '#b07cd8', red: '#ff5a67', measure: '#ffd166',
  text: '#d8dde6', muted: '#8b93a3', spokeIn: '#8a949c', spokeOut: '#c08a2c', spokeOther: '#262c38',
};
const SECTION_X = 3; // lateral exaggeration of the side section

export const mmIn = (v: number, d = 1) => `${v.toFixed(d)} mm (${(v / 25.4).toFixed(3)}")`;
const circle = (r: number, n = 180, c: Pt = [0, 0]): Pt[] => Array.from({ length: n }, (_, i) => pol(r, (i * 360) / n).map((v, k) => v + c[k]) as Pt);

function boundsOf(prims: Prim[]): [Pt, Pt] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = ([x, y]: Pt) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  for (const p of prims) {
    if (p.k === 'path') p.rings.forEach((r) => r.forEach(grow));
    else if (p.k === 'dot') grow(p.c);
    else if (p.k === 'note') grow(p.textAt);
  }
  return [[x0, y0], [x1, y1]];
}

// ---------------------------------------------------------------- scenes
function partPath(rings: Pt[][]): Prim {
  return { k: 'path', rings, closed: true, s: { fill: C.part, stroke: C.edge, width: 1.2 } };
}

/** The flat part as cut, blade 1 pointing right, with the dimensions needed to check or rebuild it. */
function flatScene(d: PanelDesign, s: SideResult): Scene {
  const { g } = s, pp = d.spec, sm = s.summary;
  const a0 = g.arms[0];
  const R = (p: Pt) => rot(p, -a0);
  const prims: Prim[] = [partPath([g.outline.pts.map(R), ...g.holes.map((h) => h.ring.pts.map(R)), circle(g.rBore)])];
  const E = g.rhoEnd, hole = pp.tieW + pp.tieClear, step = pp.holesEvery * pp.ledPitch;
  const yr = g.yRow, wt = g.wTip, rb = g.rBore, xs = g.holeRhos;
  const dim = (a: Pt, b: Pt, off: number, text: string) => prims.push({ k: 'dim', a, b, off, text, color: C.dim });
  const note = (at: Pt, textAt: Pt, text: string, align?: 'left' | 'right') => prims.push({ k: 'note', at, textAt, text, color: C.dim, align });
  const rel = g.arms.map((a) => ((a - a0) % 360 + 360) % 360).sort((u, v) => u - v);
  for (const r of rel) { // LED lanes
    for (const sg of [1, -1]) {
      prims.push({ k: 'path', rings: [[rot([rb + 2, (sg * pp.stripW) / 2], r), rot([E, (sg * pp.stripW) / 2], r)]], closed: false, s: { stroke: C.led, width: 1, dash: [6, 4] } });
    }
  }
  prims.push({ k: 'text', at: [E * 0.6, 0], text: `LED strip lane ${mmIn(pp.stripW)}`, color: C.led });
  if (pp.ETrans) { // plywood: the face grain runs along blade 1
    const y = g.star ? g.plateLW![1] + 40 : Math.max(g.hw(0), g.plateLW?.[1] ?? 0) + 36;
    prims.push({ k: 'dim', a: [-E * 0.9, y], b: [-E * 0.45, y], off: 0, text: 'face grain', color: C.grain });
  }
  dim([E, -wt / 2], [E, wt / 2], -12, `tip ${mmIn(wt)}`);
  dim([xs.at(-1)! + hole / 2, yr + hole / 2 + 1], [E, yr + hole / 2 + 1], 9, `gap ${mmIn(sm.gapLastHoleToEndMm)}`);
  if (xs.length >= 4) dim([xs.at(-4)!, yr], [xs.at(-3)!, yr], 12 + hole / 2, `pitch ${mmIn(step, 2)}`);
  if (xs.length >= 6) dim([xs.at(-6)!, -yr], [xs.at(-6)!, yr], -10, `rows ${mmIn(2 * yr)}`);
  if (pp.slot) {
    const [sw, sd] = pp.slot;
    note([E - sd / 2, 0], [E - 70, wt / 2 + 24], `nipple slot ${sw.toFixed(1)} wide × ${sd.toFixed(1)} deep, every tip`);
  }
  const lw = g.plateLW;
  const half = Math.max(g.hw(0), lw ? lw[1] : 0);
  note([xs.at(-2)!, -yr - hole / 2], [xs.at(-2)! - 30, -half - 30], `□ ${mmIn(hole)} holes, R${pp.cutCornerR} corners`, 'right');
  const py = pp.gridPitchY || pp.stripW;
  const cy = lw ? [1, 2, 3, 4, 5].map((k) => yr + k * py).filter((v) => v + hole / 2 + pp.gridEdge <= lw[1] + 1e-6) : [];
  if (g.star) {
    // angles between the blades
    rel.forEach((r, i) => {
      const nxt = i === rel.length - 1 ? rel[0] + 360 : rel[i + 1];
      prims.push({ k: 'path', rings: [Array.from({ length: 41 }, (_, k) => pol(95, r + 14 + (k * (nxt - r - 28)) / 40))], closed: false, s: { stroke: C.angle, width: 1 } });
      prims.push({ k: 'text', at: pol(112, (r + nxt) / 2), text: `${(nxt - r).toFixed(2)}°`, color: C.angle, size: 13 });
    });
    const [Lp, Wp] = lw!;
    dim([0, -Wp], [E, -Wp], -30, `centre to tip ${mmIn(E)}`);
    dim([Lp, -Wp], [Lp, Wp], -8, `plate ${mmIn(2 * Wp)}`);
    dim([0, -Wp], [Lp, -Wp], -12, `plate ${mmIn(Lp)} from centre`);
    dim([Lp, -Wp], [Lp + g.plateC!, -Wp], -12, `taper ${mmIn(g.plateC!)}`);
    if (cy.length) dim([xs[2], yr], [xs[2], cy[0]], -10, mmIn(py, 2));
    note([-rb * 0.7, -rb * 0.7], [-E * 0.55, -E * 0.15], `Ø ${mmIn(2 * rb, 2)} bore`);
  } else {
    dim([-E, -half], [E, -half], -14, `overall ${mmIn(2 * E)}`);
    note([rb * 0.7, -rb * 0.7], [30, -half - 46], `Ø ${mmIn(2 * rb, 2)} bore`, 'left');
    note([-rb * 0.8, -rb * 0.6], [-30, -half - 30], `row gap to bore ${sm.gapFirstHoleToBoreMm} mm · any hole ≥ ${pp.boreEdge} mm from the bore`, 'right');
    if (lw) {
      const [Lp, Wp] = lw;
      dim([-Lp, -Wp], [-Lp, Wp], 16, `${pp.plateHoles ? 'plate' : 'across tabs'} ${mmIn(2 * Wp)}`);
      dim([-Lp, Wp], [Lp, Wp], 9, `${pp.plateHoles ? 'plate' : 'tab'} flat ${mmIn(2 * Lp)}`);
      dim([Lp, Wp], [Lp + g.plateC!, Wp], 9, `taper ${mmIn(g.plateC!)}`);
      if (cy.length) {
        dim([xs[2], yr], [xs[2], cy[0]], -10, mmIn(py, 2));
        if (pp.plateHoles) dim([xs[1], cy.at(-1)! + hole / 2], [xs[1], Wp], -8, `edge ${mmIn(pp.gridEdge)}`);
      }
    } else {
      dim([0, -g.hw(0)], [0, g.hw(0)], -(E * 0.35), `centre width ${mmIn(2 * g.hw(0))}`);
    }
  }
  const snaps: Pt[] = [[0, 0], ...[0, 90, 180, 270].map((a) => pol(rb, a)), ...g.outlineBulge.map((p) => R([p[0], p[1]])),
    ...g.holes.flatMap((h) => [R(h.c), ...h.bulge.map((p) => R([p[0], p[1]]))])];
  const per = sm.holesPerBlade ? ` (${sm.holesPerBlade.join('/')} per blade)` : '';
  return {
    prims, snaps, bounds: boundsOf(prims), xScale: 1,
    title: `${d.identical ? 'LEFT = RIGHT' : s.label} panel · flat, as cut · ${sm.partSizeIn[0]} × ${sm.partSizeIn[1]} in · `
      + `${pp.label} ${pp.thickness.toFixed(2)} mm · ${sm.holesTotal} holes${per} · outline corners R${pp.cornerR}${d.identical ? ' · order 2' : ''}`,
    hint: 'Blade 1 points right. Dimensions in mm (inches).',
  };
}

/** The panel on the wheel, bent by the tip ties, seen from the right, with every spoke. */
function planScene(d: PanelDesign, s: SideResult): Scene {
  const wh = d.wheel, { g, m } = s, prims: Prim[] = [];
  const P = (p: Pt) => toPlan(m, p);
  const DIR: Record<number, string> = { 1: C.spokeIn, [-1]: C.spokeOut };
  const spokes = [...wh.spokes].sort((a, b) => Number(a.side === s.side) - Number(b.side === s.side));
  for (const sp of spokes) {
    const own = sp.side === s.side, sand = d.sandwich?.rimHole === sp.i;
    prims.push({ k: 'path', rings: [[sp.a, sp.b]], closed: false, s: { stroke: sand ? C.red : own ? DIR[sp.direction] : C.spokeOther, width: sand ? 2.4 : own ? 1.2 : 0.8 } });
  }
  prims.push({ k: 'path', rings: [circle(wh.p.rimWallR, 360)], closed: true, s: { stroke: '#4b5466', width: 1, dash: [6, 5] } });
  prims.push(partPath([densify(g.outline.pts, 2).map(P), ...g.holes.map((h) => h.ring.pts.map(P)), circle(g.rBore)]));
  const { leds, sensors } = flatExtras(d, s);
  for (const b of sensors) prims.push({ k: 'path', rings: [densify(b, 2).map(P)], closed: true, s: { fill: C.sensor, alpha: 0.55 } });
  for (const [a, b] of leds) prims.push({ k: 'path', rings: [[P(a), P(b)]], closed: false, s: { stroke: C.led, width: 3 } });
  for (const sp of wh.spokes) prims.push({ k: 'dot', c: pol(wh.p.erd / 2, sp.rimDeg), r: 2.5, fill: sp.side === s.side ? C.edge : '#4b5466' });
  const vd = wh.valveDeg(), rw = wh.p.rimWallR;
  prims.push({ k: 'path', rings: [[pol(rw + 6, vd), pol(rw - 35, vd)]], closed: false, s: { stroke: C.angle, width: 5 } });
  prims.push({ k: 'text', at: pol(rw + 22, vd), text: 'valve', color: C.angle });
  g.arms.forEach((a, i) => prims.push({ k: 'text', at: pol(rw + 24, a), text: `blade ${i + 1} · ${a.toFixed(2)}°`, color: C.text }));
  const sm = s.summary;
  return {
    prims, snaps: [[0, 0], ...wh.spokes.map((sp) => pol(wh.p.erd / 2, sp.rimDeg)), ...g.holes.map((h) => P(h.c))],
    bounds: boundsOf(prims), xScale: 1,
    title: `${s.label} panel on the wheel, bent (seen from the right) · ${sm.ledsPerStrip} LEDs per blade · ${sm.areaCm2} cm² · ${sm.massG} g`,
    hint: `Own-side spokes: grey heads-in, amber heads-out${d.sandwich ? ', red: the spoke clamped between the tips' : ''}`
      + `${sensors.length ? ' · purple: magnetometer boards (inner face)' : ''} · dashed: rim wall`,
  };
}

/** Section through the axle: every spoke, both panels bent by the ties, flanges, fork and rim. */
function sectionScene(d: PanelDesign): Scene {
  const wh = d.wheel, pp = d.spec, X = SECTION_X, prims: Prim[] = [];
  const t = pp.thickness, old = wh.p.old / 2, top = wh.p.rimWallR + 14;
  for (let r = 50; r <= top; r += 50) {
    prims.push({ k: 'path', rings: [[[-60 * X, r], [60 * X, r]]], closed: false, s: { stroke: C.grid, width: 1 } });
    prims.push({ k: 'text', at: [-60 * X - 14, r], text: `r ${r}`, color: C.gridText, size: 11 });
  }
  for (let z = -40; z <= 40; z += 20) {
    prims.push({ k: 'path', rings: [[[z * X, -12], [z * X, top]]], closed: false, s: { stroke: C.grid, width: 1 } });
    prims.push({ k: 'text', at: [z * X, -24], text: `z ${z}`, color: C.gridText, size: 11 });
  }
  const forkZ = (r: number) => old - (old - pp.forkCrownHalf) * Math.min(1, r / pp.forkCrownR);
  for (const sg of [-1, 1]) {
    prims.push({ k: 'path', rings: [[[sg * old * X, 0], [sg * forkZ(top) * X, top]]], closed: false, s: { stroke: '#3a4152', width: 8 } });
    const c2f = sg < 0 ? wh.p.c2fLeft : wh.p.c2fRight;
    const x0 = (sg * c2f - wh.p.flangeT / 2) * X, x1 = (sg * c2f + wh.p.flangeT / 2) * X, fr = wh.flangeOuterR(sg);
    prims.push({ k: 'path', rings: [[[x0, 0], [x1, 0], [x1, fr], [x0, fr]]], closed: true, s: { fill: '#3a4152', stroke: '#5b6475', width: 1 } });
  }
  prims.push({ k: 'path', rings: [[[-old * X, -8], [old * X, -8], [old * X, 8], [-old * X, 8]]], closed: true, s: { fill: '#1c2330', stroke: '#5b6475', width: 1 } });
  for (const sp of wh.spokes) {
    const pts = Array.from({ length: 61 }, (_, k) => { const [x, y, z] = sp.at(k / 60); return [z * X, Math.hypot(x, y)] as Pt; });
    prims.push({ k: 'path', rings: [pts], closed: false, s: { stroke: sp.direction > 0 ? C.spokeIn : C.spokeOut, width: 1, alpha: 0.7 } });
  }
  const stack = pp.stripT + pp.tieT;
  for (const s of [d.sides.LEFT, d.sides.RIGHT]) {
    const { g, m, side } = s;
    const rhos = Array.from({ length: 301 }, (_, k) => g.rBore + (k * (g.rhoEnd - g.rBore)) / 300);
    const inner = rhos.map((rho) => [side * (m.zAtRho(rho) - t / 2) * X, m.planR(rho)] as Pt);
    const outer = rhos.map((rho) => [side * (m.zAtRho(rho) + t / 2) * X, m.planR(rho)] as Pt);
    prims.push({ k: 'path', rings: [[...inner, ...outer.reverse()]], closed: true, s: { fill: '#aab4c3', stroke: '#aab4c3', width: 1 } });
    const lane = rhos.filter((rho) => rho >= g.rhoLed0 && rho <= g.rhoLed1).map((rho) => [side * (m.zAtRho(rho) + t / 2 + stack) * X, m.planR(rho)] as Pt);
    prims.push({ k: 'path', rings: [lane], closed: false, s: { stroke: C.led, width: 1.5 } });
    const fc = s.summary.forkClearance;
    if (fc.where && s.side > 0) {
      const r = fc.where.r;
      prims.push({ k: 'note', at: [forkZ(r) * X, r], textAt: [forkZ(r) * X - 25, r - 45], text: `${fc.minMm} mm to the fork (${fc.governedBy})`, color: fc.minMm >= pp.minForkClear ? C.dim : C.red });
    }
  }
  const R = d.sides.RIGHT;
  prims.push({ k: 'path', rings: [[[0, wh.nippleTipR()], [0, wh.p.rimWallR]]], closed: false, s: { stroke: C.edge, width: 4 } });
  prims.push({ k: 'path', rings: [[[-12 * X, wh.p.rimWallR], [12 * X, wh.p.rimWallR]]], closed: false, s: { stroke: C.edge, width: 2 } });
  prims.push({ k: 'text', at: [16 * X + 30, wh.p.rimWallR], text: 'rim wall / nipple', color: C.muted, size: 11 });
  const rt = R.m.planR(R.g.rhoTie);
  prims.push({ k: 'path', rings: [[[-6 * X, rt], [6 * X, rt]]], closed: false, s: { stroke: C.red, width: 2.5 } });
  prims.push({ k: 'note', at: [6 * X, rt], textAt: [20 * X, rt - 20], text: 'tip-to-tip zip tie', color: C.red });
  return {
    prims, snaps: [[0, 0]], bounds: boundsOf(prims), xScale: X,
    title: `Side section through the axle · all ${wh.p.spokes} spokes · panels bent from flat by the tip ties · lateral scale ×${X}`,
    hint: 'Grey: heads-in spokes, amber: heads-out · orange: LED strip + tie band on the outer face · fork, hub and flanges are typical values',
  };
}

// ---------------------------------------------------------------- the view
export class PanelDrawing {
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;
  private titleEl: HTMLElement;
  private hintEl: HTMLElement;
  private readout: HTMLElement;
  private status: HTMLElement;
  private modeBtns: HTMLButtonElement[] = [];
  private sideBtns: HTMLButtonElement[] = [];
  private measureBtn: HTMLButtonElement;
  private design?: PanelDesign;
  private scene?: Scene;
  private mode: Mode = 'flat';
  private side: 'LEFT' | 'RIGHT' = 'LEFT';
  private view = { cx: 0, cy: 0, s: 1 };
  private fitted = false; // false once someone pans or zooms: a new design then keeps the view
  private w = 1; private h = 1;
  private pointers = new Map<number, Pt>();
  private drag?: { at: Pt; moved: boolean; pinch?: { d: number; mid: Pt } };
  private hover?: Pt;
  private measuring = false;
  private ma?: Pt; private mb?: Pt;
  private queued = false;

  constructor(private host: HTMLElement, onBack: () => void) {
    host.innerHTML = `
      <div class="pv-bar">
        <button type="button" data-act="back" title="Back to the ride">← Ride</button>
        <span class="pv-group" role="group" aria-label="View">
          <button type="button" data-mode="flat" title="The part as cut, with dimensions">Flat part</button>
          <button type="button" data-mode="plan" title="The bent panel on the wheel, with the spokes">On the wheel</button>
          <button type="button" data-mode="section" title="Section through the axle: spokes, panels, flanges, fork">Side section</button>
        </span>
        <span class="pv-group" role="group" aria-label="Side" data-sides>
          <button type="button" data-side="LEFT">Left</button>
          <button type="button" data-side="RIGHT">Right</button>
        </span>
        <button type="button" data-act="measure" title="Measure between two points (M); snaps to corners and hole centres">📏 Measure</button>
        <button type="button" data-act="fit" title="Fit the drawing (F, or double-click)">Fit</button>
      </div>
      <div class="pv-title"></div>
      <div class="pv-hint"></div>
      <div class="pv-status" hidden></div>
      <div class="pv-readout"></div>`;
    host.appendChild(this.canvas);
    const q = <T extends HTMLElement>(s: string) => host.querySelector<T>(s)!;
    this.titleEl = q('.pv-title'); this.hintEl = q('.pv-hint'); this.readout = q('.pv-readout'); this.status = q('.pv-status');
    this.measureBtn = q('[data-act="measure"]');
    q<HTMLButtonElement>('[data-act="back"]').onclick = onBack;
    q<HTMLButtonElement>('[data-act="fit"]').onclick = () => this.fit();
    this.measureBtn.onclick = () => this.setMeasuring(!this.measuring);
    this.modeBtns = [...host.querySelectorAll<HTMLButtonElement>('[data-mode]')];
    for (const b of this.modeBtns) b.onclick = () => { this.mode = b.dataset.mode as Mode; this.rebuild(true); };
    this.sideBtns = [...host.querySelectorAll<HTMLButtonElement>('[data-side]')];
    for (const b of this.sideBtns) b.onclick = () => { this.side = b.dataset.side as 'LEFT' | 'RIGHT'; this.rebuild(false); };
    new ResizeObserver(() => this.resize()).observe(host);
    this.bindInput();
    this.syncButtons();
  }

  /** Show a design, or a message instead of one (busy, or why there is no design). */
  setDesign(d: PanelDesign | undefined, message = '') {
    this.status.hidden = !message;
    this.status.textContent = message;
    this.status.classList.toggle('over', !!this.design); // over the last design: out of the way
    if (!d) { this.request(); return; } // keep showing the last design under the message
    const first = !this.design;
    this.design = d;
    this.rebuild(first || this.fitted);
  }

  private rebuild(fit: boolean) {
    const d = this.design;
    this.syncButtons();
    if (!d) return;
    const s = this.mode !== 'flat' || !d.identical ? d.sides[this.side] : d.sides.LEFT;
    this.scene = this.mode === 'flat' ? flatScene(d, s) : this.mode === 'plan' ? planScene(d, s) : sectionScene(d);
    this.titleEl.textContent = this.scene.title;
    this.hintEl.textContent = this.scene.hint;
    this.ma = this.mb = undefined;
    if (fit) this.fit(); else this.request();
  }

  private syncButtons() {
    for (const b of this.modeBtns) b.setAttribute('aria-pressed', String(b.dataset.mode === this.mode));
    for (const b of this.sideBtns) b.setAttribute('aria-pressed', String(b.dataset.side === this.side));
    const sides = this.host.querySelector<HTMLElement>('[data-sides]')!;
    sides.hidden = this.mode === 'section' || (this.mode === 'flat' && !!this.design?.identical);
    this.measureBtn.setAttribute('aria-pressed', String(this.measuring));
    this.canvas.style.cursor = this.measuring ? 'crosshair' : 'grab';
  }

  private setMeasuring(on: boolean) {
    this.measuring = on;
    if (!on) this.ma = this.mb = undefined;
    this.syncButtons();
    this.request();
  }

  fit() {
    if (!this.scene) return;
    const [[x0, y0], [x1, y1]] = this.scene.bounds;
    // room for the toolbar and title (they wrap on narrow screens), and for labels past the drawing
    const bar = this.host.querySelector<HTMLElement>('.pv-bar')!;
    const top = Math.max(70, bar.offsetTop + bar.offsetHeight + (this.hintEl.offsetParent ? 44 : 8)), pad = this.w < 500 ? 24 : 60;
    const s = Math.min((this.w - 2 * pad) / Math.max(1, x1 - x0), (this.h - top - 2 * pad) / Math.max(1, y1 - y0));
    this.view = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 + top / 2 / s, s };
    this.fitted = true;
    this.request();
  }

  private resize() {
    const r = this.host.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    const first = this.w <= 1;
    this.w = r.width; this.h = r.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.w * dpr); this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (first || this.fitted) this.fit(); else this.request();
  }

  private S = ([x, y]: Pt): Pt => [(x - this.view.cx) * this.view.s + this.w / 2, this.h / 2 - (y - this.view.cy) * this.view.s];
  private W = ([px, py]: Pt): Pt => [(px - this.w / 2) / this.view.s + this.view.cx, this.view.cy - (py - this.h / 2) / this.view.s];

  private zoomAt(p: Pt, f: number) {
    const w = this.W(p);
    this.view.s = Math.min(400, Math.max(0.05, this.view.s * f));
    this.view.cx = w[0] - (p[0] - this.w / 2) / this.view.s;
    this.view.cy = w[1] + (p[1] - this.h / 2) / this.view.s;
    this.fitted = false;
    this.request();
  }

  private snap(p: Pt): Pt {
    let best: Pt = this.W(p), bd = 12;
    for (const q of this.scene?.snaps ?? []) {
      const sq = this.S(q), d = Math.hypot(sq[0] - p[0], sq[1] - p[1]);
      if (d < bd) { bd = d; best = q; }
    }
    return best;
  }

  private bindInput() {
    const c = this.canvas;
    const local = (e: PointerEvent | WheelEvent | MouseEvent): Pt => {
      const r = c.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomAt(local(e), Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
    }, { passive: false });
    c.addEventListener('dblclick', () => this.fit());
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, local(e));
      this.drag = { at: local(e), moved: false };
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.drag.pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
        this.drag.moved = true;
      }
      if (!this.measuring) c.style.cursor = 'grabbing';
    });
    c.addEventListener('pointermove', (e) => {
      const p = local(e);
      this.hover = p;
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, p);
      const dr = this.drag;
      if (dr?.pinch && this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]), mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        this.view.cx -= (mid[0] - dr.pinch.mid[0]) / this.view.s;
        this.view.cy += (mid[1] - dr.pinch.mid[1]) / this.view.s;
        this.zoomAt(mid, d / Math.max(1, dr.pinch.d));
        dr.pinch = { d, mid };
      } else if (dr && this.pointers.size === 1) {
        if (Math.hypot(p[0] - dr.at[0], p[1] - dr.at[1]) > 3) dr.moved = true;
        if (dr.moved) {
          this.view.cx -= (p[0] - dr.at[0]) / this.view.s;
          this.view.cy += (p[1] - dr.at[1]) / this.view.s;
          dr.at = p;
          this.fitted = false;
        }
      }
      this.request();
    });
    const up = (e: PointerEvent) => {
      const dr = this.drag;
      this.pointers.delete(e.pointerId);
      if (this.pointers.size === 0) {
        if (dr && !dr.moved && this.measuring) {
          const q = this.snap(local(e));
          if (!this.ma || this.mb) { this.ma = q; this.mb = undefined; } else this.mb = q;
        }
        this.drag = undefined;
        this.syncButtons();
      } else if (dr) {
        dr.pinch = undefined;
        dr.at = [...this.pointers.values()][0];
      }
      this.request();
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('pointerleave', () => { this.hover = undefined; this.request(); });
    window.addEventListener('keydown', (e) => {
      if (this.host.offsetParent === null || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement).matches('input, textarea, select')) return;
      const k = e.key.toLowerCase();
      if (k === 'f') this.fit();
      else if (k === 'm') this.setMeasuring(!this.measuring);
      else if (k === 'escape' && this.measuring) this.setMeasuring(false);
    });
  }

  request() {
    if (this.queued) return;
    this.queued = true;
    requestAnimationFrame(() => { this.queued = false; this.draw(); });
  }

  // ---------------------------------------------------------------- drawing
  private draw() {
    const { ctx } = this;
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, this.w, this.h);
    const sc = this.scene;
    if (!sc) { this.readout.textContent = ''; return; }
    for (const p of sc.prims) if (p.k === 'path' || p.k === 'dot') this.drawShape(p);
    for (const p of sc.prims) if (p.k === 'dim') this.drawDim(p);
    for (const p of sc.prims) if (p.k === 'note' || p.k === 'text') this.drawLabel(p);
    this.drawScaleBar();
    this.drawMeasure(sc);
    // cursor position
    if (this.hover) {
      const [x, y] = this.W(this.hover);
      this.readout.textContent = this.mode === 'section'
        ? `z ${(x / sc.xScale).toFixed(1)} mm · r ${y.toFixed(1)} mm`
        : `x ${x.toFixed(1)} · y ${y.toFixed(1)} mm · r ${Math.hypot(x, y).toFixed(1)} mm`;
    } else this.readout.textContent = '';
  }

  private drawShape(p: Extract<Prim, { k: 'path' | 'dot' }>) {
    const { ctx } = this;
    ctx.save();
    if (p.k === 'dot') {
      const [x, y] = this.S(p.c);
      ctx.fillStyle = p.fill;
      ctx.beginPath(); ctx.arc(x, y, p.r, 0, 2 * Math.PI); ctx.fill();
      ctx.restore();
      return;
    }
    ctx.globalAlpha = p.s.alpha ?? 1;
    ctx.beginPath();
    for (const ring of p.rings) {
      ring.forEach((q, i) => { const [x, y] = this.S(q); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      if (p.closed) ctx.closePath();
    }
    if (p.s.fill) { ctx.fillStyle = p.s.fill; ctx.fill('evenodd'); }
    if (p.s.stroke) {
      ctx.strokeStyle = p.s.stroke;
      ctx.lineWidth = p.s.width ?? 1;
      ctx.setLineDash(p.s.dash ?? []);
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
    ctx.restore();
  }

  private textBox(text: string, at: Pt, color: string, opts: { size?: number; angle?: number; align?: CanvasTextAlign; bold?: boolean } = {}) {
    const { ctx } = this;
    const size = opts.size ?? 12;
    ctx.save();
    ctx.font = `${opts.bold ? '600 ' : ''}${size}px ui-sans-serif, system-ui, sans-serif`;
    ctx.translate(at[0], at[1]);
    ctx.rotate(opts.angle ?? 0);
    const w = ctx.measureText(text).width;
    const align = opts.align ?? 'center';
    const x0 = align === 'center' ? -w / 2 : align === 'right' ? -w : 0;
    ctx.fillStyle = 'rgba(11, 14, 21, 0.82)';
    ctx.fillRect(x0 - 3, -size * 0.65, w + 6, size * 1.3);
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(text, x0, 0.5);
    ctx.restore();
  }

  private drawDim(p: Extract<Prim, { k: 'dim' }>) {
    const { ctx } = this;
    const [ax, ay] = p.a, [bx, by] = p.b;
    const L = Math.hypot(bx - ax, by - ay) || 1;
    const n: Pt = [-(by - ay) / L, (bx - ax) / L];
    const a2: Pt = [ax + n[0] * p.off, ay + n[1] * p.off], b2: Pt = [bx + n[0] * p.off, by + n[1] * p.off];
    const A = this.S(p.a), B = this.S(p.b), A2 = this.S(a2), B2 = this.S(b2);
    const span = Math.hypot(B2[0] - A2[0], B2[1] - A2[1]);
    if (span < 14 || this.view.s < 0.5) return; // too small to read at this zoom
    const ux = (B2[0] - A2[0]) / span, uy = (B2[1] - A2[1]) / span;
    const ext = (q: Pt, q2: Pt) => {
      const d = Math.hypot(q2[0] - q[0], q2[1] - q[1]) || 1;
      ctx.moveTo(q[0], q[1]);
      ctx.lineTo(q2[0] + ((q2[0] - q[0]) / d) * 4, q2[1] + ((q2[1] - q[1]) / d) * 4);
    };
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle = p.color;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ext(A, A2); ext(B, B2);
    ctx.moveTo(A2[0], A2[1]); ctx.lineTo(B2[0], B2[1]);
    ctx.stroke();
    for (const [q, sg] of [[A2, 1], [B2, -1]] as [Pt, number][]) {
      ctx.beginPath();
      ctx.moveTo(q[0], q[1]);
      ctx.lineTo(q[0] + sg * ux * 7 - uy * 2.5, q[1] + sg * uy * 7 + ux * 2.5);
      ctx.lineTo(q[0] + sg * ux * 7 + uy * 2.5, q[1] + sg * uy * 7 - ux * 2.5);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    let ang = Math.atan2(uy, ux);
    if (ang > Math.PI / 2) ang -= Math.PI; else if (ang < -Math.PI / 2) ang += Math.PI;
    // the text sits on the line, on the side away from the part
    const side = Math.sign(p.off) || 1;
    const nS: Pt = [this.S([n[0], n[1]])[0] - this.S([0, 0])[0], this.S([n[0], n[1]])[1] - this.S([0, 0])[1]];
    const nl = Math.hypot(...nS) || 1;
    const mid: Pt = [(A2[0] + B2[0]) / 2 + (nS[0] / nl) * 9 * side, (A2[1] + B2[1]) / 2 + (nS[1] / nl) * 9 * side];
    this.textBox(p.text, mid, p.color, { size: 11, angle: ang });
  }

  private drawLabel(p: Extract<Prim, { k: 'note' | 'text' }>) {
    if (this.view.s < (p.k === 'note' ? 0.6 : 0.35)) return; // zoomed far out: labels would only clutter
    if (p.k === 'text') { this.textBox(p.text, this.S(p.at), p.color, { size: p.size, bold: p.bold, angle: p.angle }); return; }
    const { ctx } = this;
    const A = this.S(p.at), T = this.S(p.textAt);
    ctx.save();
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(T[0], T[1]); ctx.stroke();
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(A[0], A[1], 2, 0, 2 * Math.PI); ctx.fill();
    ctx.restore();
    this.textBox(p.text, T, p.color, { size: 11, align: p.align ?? (T[0] < A[0] ? 'right' : 'left') });
  }

  private drawScaleBar() {
    const sc = this.scene!;
    // a round length that's 60–150 px long
    const per = sc.xScale / this.view.s; // mm per px, horizontally
    const target = 100 * per;
    const p10 = 10 ** Math.floor(Math.log10(target));
    const len = [1, 2, 5, 10].map((k) => k * p10).find((v) => v >= target * 0.6) ?? p10 * 10;
    const px = len / per;
    const { ctx } = this;
    const x = this.w - px - 20, y = this.h - 22;
    ctx.save();
    ctx.strokeStyle = C.muted;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y - 4); ctx.lineTo(x, y); ctx.lineTo(x + px, y); ctx.lineTo(x + px, y - 4);
    ctx.stroke();
    ctx.restore();
    this.textBox(`${len >= 1 ? len : len.toFixed(2)} mm${sc.xScale !== 1 ? ' (lateral)' : ''}`, [x + px / 2, y - 12], C.muted, { size: 11 });
  }

  private drawMeasure(sc: Scene) {
    if (!this.measuring) return;
    const { ctx } = this;
    const hoverSnap = this.hover ? this.snap(this.hover) : undefined;
    const a = this.ma, b = this.mb ?? (a ? hoverSnap : undefined);
    const mark = (q: Pt) => {
      const [x, y] = this.S(q);
      ctx.beginPath(); ctx.arc(x, y, 4, 0, 2 * Math.PI); ctx.stroke();
    };
    ctx.save();
    ctx.strokeStyle = C.measure;
    ctx.lineWidth = 1.5;
    if (hoverSnap && !this.mb) mark(hoverSnap);
    if (a) mark(a);
    if (a && b) {
      mark(b);
      const A = this.S(a), B = this.S(b);
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
      const dx = (b[0] - a[0]) / sc.xScale, dy = b[1] - a[1], L = Math.hypot(dx, dy);
      const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
      this.textBox(`${mmIn(L, 2)} · Δx ${dx.toFixed(2)} · Δy ${dy.toFixed(2)} mm · ${ang.toFixed(1)}°`,
        [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2 - 16], C.measure, { size: 12, bold: true });
    }
    ctx.restore();
    if (!a) this.textBox('Click two points to measure (they snap to corners and hole centres) · Esc to stop', [this.w / 2, this.h - 50], C.measure, { size: 12 });
  }
}


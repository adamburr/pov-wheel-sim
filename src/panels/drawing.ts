// The panels' drafting view: the part on the wheel over every spoke, as cut, with the dimensions
// needed to check or rebuild it. Pan by dragging, zoom with the wheel or a pinch, double-click (or
// F) to fit, and M to measure between snapped points.
import { flatExtras, type HoleKind, type PanelDesign, type SideResult } from './design';
import { pmod, pol, type Pt, rot } from './geom';

interface Style { stroke?: string; fill?: string; width?: number; dash?: number[]; alpha?: number }
type Prim =
  | { k: 'path'; rings: Pt[][]; closed: boolean; s: Style }
  | { k: 'dot'; c: Pt; r: number; fill: string }
  | { k: 'dim'; a: Pt; b: Pt; off: number; text: string; color: string }
  | { k: 'note'; at: Pt; textAt: Pt; text: string; color: string; align?: 'left' | 'right' }
  | { k: 'text'; at: Pt; text: string; color: string; size?: number; bold?: boolean; angle?: number };
interface Scene { prims: Prim[]; snaps: Pt[]; bounds: [Pt, Pt]; title: string; hint: string }

const C = {
  bg: '#0b0e15', grid: '#161b26', gridText: '#4b5466', part: '#1c2330', edge: '#c5cfdd', hole: '#8d98aa',
  dim: '#6fb3ff', led: '#ff9f1c', angle: '#c08cff', sensor: '#b07cd8', red: '#ff5a67', measure: '#ffd166',
  text: '#d8dde6', muted: '#8b93a3', spokeIn: '#8a949c', spokeOut: '#c08a2c', spokeOther: '#262c38', tie: '#4fd1a5', board: '#ff7ab6', wire: '#f2c94c',
};

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
const HOLE: Record<HoleKind, string> = { strip: C.hole, spoke: C.tie, disc: C.angle, sensor: C.board, wire: C.wire };
const LEGEND = 'holes: grey strip ties, green spoke ties, purple disc ties round the spoke crossings, pink hall sensor ties, yellow wire slots';

/**
 * The panel on the wheel, seen from the right with blade 1 pointing right, over every spoke: the part as
 * cut (it lies flat on the spokes' shallow dish), with the dimensions needed to check or rebuild it.
 */
function partScene(d: PanelDesign, s: SideResult): Scene {
  const wh = d.wheel, { g } = s, pp = d.spec, sm = s.summary;
  const a0 = g.arms[0], R = (p: Pt) => rot(p, -a0), Pol = (r: number, a: number) => pol(r, a - a0);
  const prims: Prim[] = [];
  // the spokes: the other side's faint, this side's by direction, then the part over them
  const DIR: Record<number, string> = { 1: C.spokeIn, [-1]: C.spokeOut };
  const spokes = [...wh.spokes].sort((a, b) => Number(a.side === s.side) - Number(b.side === s.side));
  for (const sp of spokes) {
    const own = sp.side === s.side;
    prims.push({ k: 'path', rings: [[R(sp.a), R(sp.b)]], closed: false, s: { stroke: own ? DIR[sp.direction] : C.spokeOther, width: own ? 1.2 : 0.8 } });
  }
  prims.push({ k: 'path', rings: [circle(wh.p.rimWallR, 360)], closed: true, s: { stroke: '#4b5466', width: 1, dash: [6, 5] } });
  prims.push(partPath([g.outline.pts.map(R), ...g.holes.filter((h) => !h.slot).map((h) => h.ring.pts.map(R)), g.bore.ring.pts.map(R)]));
  const tied = new Set(s.spokeTies.map((t) => t.spoke));
  for (const sp of wh.spokes) if (tied.has(sp.i)) prims.push({ k: 'path', rings: [[R(sp.a), R(sp.b)]], closed: false, s: { stroke: C.tie, width: 1.2, alpha: 0.6 } });
  for (const sp of wh.spokes) if (sp.side === s.side) prims.push({ k: 'path', rings: [[R(sp.a), R(sp.b)]], closed: false, s: { stroke: DIR[sp.direction], width: 0.8, dash: [4, 4], alpha: 0.5 } });
  // a slot is open into the bore: drawn as its U, not closed across the mouth
  for (const h of g.holes) prims.push({ k: 'path', rings: [h.ring.pts.map(R)], closed: !h.slot, s: { stroke: HOLE[h.kind], width: 1.4 } });
  const { sensors } = flatExtras(d, s);
  for (const b of sensors) prims.push({ k: 'path', rings: [b.map(R)], closed: true, s: { fill: C.sensor, alpha: 0.55 } });
  for (const sp of wh.spokes) prims.push({ k: 'dot', c: Pol(wh.p.erd / 2, sp.rimDeg), r: 2.5, fill: sp.side === s.side ? C.edge : '#4b5466' });
  const vd = wh.valveDeg(), rw = wh.p.rimWallR;
  prims.push({ k: 'path', rings: [[Pol(rw + 6, vd), Pol(rw - pp.valveLen, vd)]], closed: false, s: { stroke: C.angle, width: 5 } });
  prims.push({ k: 'text', at: Pol(rw + 22, vd), text: 'valve', color: C.angle });
  g.arms.forEach((a, i) => prims.push({ k: 'text', at: Pol(rw + 24, a), text: `blade ${i + 1} · ${a.toFixed(2)}°`, color: C.text }));
  const rel = g.arms.map((a) => pmod(a - a0, 360));
  for (const r of rel) { // LED lanes
    for (const sg of [1, -1]) {
      prims.push({ k: 'path', rings: [[rot([g.rhoLed0, (sg * pp.stripW) / 2], r), rot([g.rhoLed1, (sg * pp.stripW) / 2], r)]], closed: false, s: { stroke: C.led, width: 1, dash: [6, 4] } });
    }
  }
  const E = g.rhoEnd, w = g.bladeW, hole = pp.tieW + pp.tieClear, y = pp.stripW / 2;
  const dim = (a: Pt, b: Pt, off: number, text: string) => prims.push({ k: 'dim', a, b, off, text, color: C.dim });
  const note = (at: Pt, textAt: Pt, text: string, align?: 'left' | 'right') => prims.push({ k: 'note', at, textAt, text, color: C.dim, align });
  prims.push({ k: 'text', at: [(g.rhoLed0 + g.rhoLed1) / 2, 0], text: `LED strip ${mmIn(pp.stripW)} · ${sm.ledsPerStrip} LEDs`, color: C.led });
  dim([E, -w / 2], [E, w / 2], -12, `blade ${mmIn(w)}`);
  const below = -w / 2 - Math.max(0, ...s.spokeTies.filter((t) => t.blade === 0 && t.sg < 0).map((t) => t.earMm));
  dim([0, below], [E, below], -18, `centre to tip ${mmIn(E)}`);
  // the disc, measured between two blades
  const between = rel.length > 1 ? rel[1] / 2 : 90;
  dim(pol(g.rhoDisc, between), pol(g.rhoDisc, between + 180), 0, `disc Ø ${mmIn(2 * g.rhoDisc)}`);
  note(pol(g.rBore, between + 90), pol(g.rhoDisc + 40, between + 120), `Ø ${mmIn(2 * g.rBore, 2)} bore`);
  const st = g.stripTieRhos[0];
  if (st.length >= 3) {
    dim([st.at(-3)!, y], [st.at(-2)!, y], 10 + hole / 2, `strip ties every ${mmIn(st.at(-2)! - st.at(-3)!, 2)}`);
    dim([st.at(-3)!, -y], [st.at(-3)!, y], -8, `${mmIn(2 * y)}`);
  }
  note([st.at(-1) ?? E, -y - hole / 2], [(st.at(-1) ?? E) - 40, -w / 2 - 34], `□ ${mmIn(hole)} holes, R${pp.cutCornerR} corners`, 'right');
  if (rel.length > 1) { // angle between the first two blades
    prims.push({ k: 'path', rings: [Array.from({ length: 41 }, (_, k) => pol(g.rhoDisc + 25, 6 + (k * (rel[1] - 12)) / 40))], closed: false, s: { stroke: C.angle, width: 1 } });
    prims.push({ k: 'text', at: pol(g.rhoDisc + 42, rel[1] / 2), text: `${d.armSpacing.toFixed(2)}°`, color: C.angle, size: 13 });
  }
  const tie = s.spokeTies.find((t) => t.blade === 0);
  if (tie) {
    const [p, q] = tie.holes.map(R);
    note(p, [p[0] - 30, p[1] + tie.sg * 50], tie.over
      ? 'spoke tie over the strip, between LEDs (the spoke runs under the strip): fit after the strip'
      : `spoke tie: holes ${mmIn(Math.hypot(q[0] - p[0], q[1] - p[1]))} apart, either side of the spoke, on its own tab`, 'right');
  }
  const sb = g.sensors.find((b) => b.blade === 0);
  if (sb) {
    const at = pol(sb.rho, sb.a - a0), out = pol(sb.rho + 60, sb.a - a0 + 12);
    note(at, out, `hall sensor (US5881, marked face out, leads in) ${g.arms.length > 1 ? 'midway between strips' : 'opposite the blade'}, r ${sm.sensorR[0]} mm: a tie across its body, one across its leads`, 'left');
  }
  const dt = s.discTies[0];
  if (dt) { const p = R(dt.holes[0]); note(p, [p[0] - 60, p[1] - 70], `disc tie round the spoke crossing at r ${dt.r.toFixed(1)} mm`, 'right'); }
  if (g.slots.length && d.tipSlot) {
    const a = d.wheel.spokes[g.slots[0].rimHole].rimDeg - a0, at = pol(E - d.tipSlot.depthMm / 2, a), out = pol(E + 30, a);
    note(at, [out[0], out[1] + 40], `nipple slot ${d.tipSlot.widthMm.toFixed(1)} wide × ${d.tipSlot.depthMm.toFixed(1)} deep`);
  }
  const snaps: Pt[] = [[0, 0], ...[0, 90, 180, 270].map((a) => pol(g.rBore, a)), ...g.outlineBulge.map((p) => R([p[0], p[1]])),
    ...g.holes.flatMap((h) => [R(h.c), ...h.bulge.map((p) => R([p[0], p[1]]))]), ...wh.spokes.map((sp) => Pol(wh.p.erd / 2, sp.rimDeg))];
  return {
    prims, snaps, bounds: boundsOf(prims),
    title: `${s.label} panel on the wheel, from the right · ${sm.partSizeIn[0]} × ${sm.partSizeIn[1]} in · ${sm.holesTotal} holes · ${sm.massG} g`
      + ` · ${d.identical ? 'cut 2 of one part' : `cut one ${s.label}`}`,
    hint: `Blade 1 points right; mm (inches). Spokes: grey heads-in, amber heads-out, green tied, faint the other side's`
      + `${sensors.length ? ' · purple: hall sensors' : ''} · ${LEGEND}.`,
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
  private sideBtns: HTMLButtonElement[] = [];
  private measureBtn: HTMLButtonElement;
  private design?: PanelDesign;
  private scene?: Scene;
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
      <div class="pv-head">
      <div class="pv-bar">
        <button type="button" data-act="back" title="Back to the ride">← Ride</button>
        <span class="pv-group" role="group" aria-label="Side" data-sides>
          <button type="button" data-side="LEFT">Left</button>
          <button type="button" data-side="RIGHT">Right</button>
        </span>
        <button type="button" data-act="measure" title="Measure between two points (M); snaps to corners and hole centres">📏 Measure</button>
        <button type="button" data-act="fit" title="Fit the drawing (F, or double-click)">Fit</button>
      </div>
      <div class="pv-title"></div>
      <div class="pv-hint"></div>
      </div>
      <div class="pv-status" hidden></div>
      <div class="pv-readout"></div>`;
    host.appendChild(this.canvas);
    const q = <T extends HTMLElement>(s: string) => host.querySelector<T>(s)!;
    this.titleEl = q('.pv-title'); this.hintEl = q('.pv-hint'); this.readout = q('.pv-readout'); this.status = q('.pv-status');
    this.measureBtn = q('[data-act="measure"]');
    q<HTMLButtonElement>('[data-act="back"]').onclick = onBack;
    q<HTMLButtonElement>('[data-act="fit"]').onclick = () => this.fit();
    this.measureBtn.onclick = () => this.setMeasuring(!this.measuring);
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
    this.scene = partScene(d, d.sides[this.side]);
    this.titleEl.textContent = this.scene.title;
    this.hintEl.textContent = this.scene.hint;
    this.ma = this.mb = undefined;
    if (fit) this.fit(); else this.request();
  }

  private syncButtons() {
    for (const b of this.sideBtns) b.setAttribute('aria-pressed', String(b.dataset.side === this.side));
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
    // room for the toolbar, title and hint (they wrap on narrow screens), and for labels past the drawing
    const head = this.host.querySelector<HTMLElement>('.pv-head')!;
    const top = Math.max(70, head.offsetTop + head.offsetHeight + 8), pad = this.w < 500 ? 24 : 60;
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
    this.drawMeasure();
    // cursor position
    if (this.hover) {
      const [x, y] = this.W(this.hover);
      this.readout.textContent = `x ${x.toFixed(1)} · y ${y.toFixed(1)} mm · r ${Math.hypot(x, y).toFixed(1)} mm`;
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
    // a round length that's 60–150 px long
    const per = 1 / this.view.s; // mm per px
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
    this.textBox(`${len >= 1 ? len : len.toFixed(2)} mm`, [x + px / 2, y - 12], C.muted, { size: 11 });
  }

  private drawMeasure() {
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
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
      const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
      this.textBox(`${mmIn(L, 2)} · Δx ${dx.toFixed(2)} · Δy ${dy.toFixed(2)} mm · ${ang.toFixed(1)}°`,
        [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2 - 16], C.measure, { size: 12, bold: true });
    }
    ctx.restore();
    if (!a) this.textBox('Click two points to measure (they snap to corners and hole centres) · Esc to stop', [this.w / 2, this.h - 50], C.measure, { size: 12 });
  }
}


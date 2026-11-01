// The electronics drawings in the main area while the Electronics tab is open: one sheet at a time,
// fitted to the view, with drag to pan and wheel or pinch to zoom.
import type { Electronics } from './design';
import { drawSheet, type SheetId, SHEETS } from './sheets';

export class ElecView {
  private stage: HTMLElement;
  private head: HTMLElement;
  private titleEl: HTMLElement;
  private sheetBtns: HTMLButtonElement[];
  private sheet: SheetId = 'circuit';
  private e?: Electronics;
  private spokes = 32;
  private size = { w: 1, h: 1 };
  private view = { x: 0, y: 0, s: 1 };
  private fitted = true;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch?: { d: number; s: number };

  constructor(private host: HTMLElement, onBack: () => void) {
    host.innerHTML = `
      <div class="pv-head">
      <div class="pv-bar">
        <button type="button" data-act="back" title="Back to the ride">← Ride</button>
        <span class="pv-group" role="group" aria-label="Sheet">
          ${SHEETS.map((s) => `<button type="button" data-sheet="${s.id}" title="${s.title}">${s.label}</button>`).join('')}
        </span>
        <button type="button" data-act="fit" title="Fit the sheet (F, or double-click)">Fit</button>
      </div>
      <div class="pv-title"></div>
      </div>
      <div class="ev-stage"></div>`;
    const q = <T extends HTMLElement>(s: string) => host.querySelector<T>(s)!;
    this.stage = q('.ev-stage');
    this.head = q('.pv-head');
    this.titleEl = q('.pv-title');
    q<HTMLButtonElement>('[data-act="back"]').onclick = onBack;
    q<HTMLButtonElement>('[data-act="fit"]').onclick = () => this.fit();
    this.sheetBtns = [...host.querySelectorAll<HTMLButtonElement>('[data-sheet]')];
    for (const b of this.sheetBtns) b.onclick = () => { this.sheet = b.dataset.sheet as SheetId; this.render(true); };
    new ResizeObserver(() => { if (this.fitted) this.fit(); }).observe(host);
    this.bindInput();
  }

  show(e: Electronics, spokes: number) {
    this.e = e;
    this.spokes = spokes;
    this.render(this.fitted);
  }

  private render(refit: boolean) {
    for (const b of this.sheetBtns) b.setAttribute('aria-pressed', String(b.dataset.sheet === this.sheet));
    if (!this.e) return;
    const s = drawSheet(this.sheet, this.e, this.spokes);
    this.size = { w: s.w, h: s.h };
    this.stage.innerHTML = s.svg;
    const svg = this.stage.firstElementChild as SVGSVGElement;
    svg.setAttribute('width', String(s.w));
    svg.setAttribute('height', String(s.h));
    this.titleEl.textContent = SHEETS.find((x) => x.id === this.sheet)!.title;
    if (refit) this.fit(); else this.apply();
  }

  fit() {
    // The bar and the title wrap on a narrow view: fit the sheet below them.
    const top = this.head.offsetTop + this.head.offsetHeight + 8;
    const W = this.host.clientWidth, H = this.host.clientHeight - top;
    const s = Math.min(W / this.size.w, H / this.size.h) * 0.96;
    this.view = { s, x: (W - this.size.w * s) / 2, y: top + (H - this.size.h * s) / 2 };
    this.fitted = true;
    this.apply();
  }

  private apply() {
    this.stage.style.transform = `translate(${this.view.x}px, ${this.view.y}px) scale(${this.view.s})`;
  }

  private zoomAt(x: number, y: number, k: number) {
    const s = Math.min(20, Math.max(0.05, this.view.s * k));
    k = s / this.view.s;
    this.view = { s, x: x - (x - this.view.x) * k, y: y - (y - this.view.y) * k };
    this.fitted = false;
    this.apply();
  }

  private bindInput() {
    const h = this.host;
    const local = (e: { clientX: number; clientY: number }) => { const r = h.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    h.addEventListener('wheel', (e) => {
      if ((e.target as HTMLElement).closest('.pv-bar')) return;
      e.preventDefault();
      const p = local(e);
      this.zoomAt(p.x, p.y, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
    }, { passive: false });
    h.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('.pv-bar')) return;
      h.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, local(e));
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s: this.view.s };
      }
    });
    h.addEventListener('pointermove', (e) => {
      const prev = this.pointers.get(e.pointerId);
      if (!prev) return;
      const p = local(e);
      this.pointers.set(e.pointerId, p);
      if (this.pointers.size === 2 && this.pinch) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, (this.pinch.s * d) / this.pinch.d / this.view.s);
        return;
      }
      this.view.x += p.x - prev.x;
      this.view.y += p.y - prev.y;
      this.fitted = false;
      this.apply();
    });
    const up = (e: PointerEvent) => { this.pointers.delete(e.pointerId); if (this.pointers.size < 2) this.pinch = undefined; };
    h.addEventListener('pointerup', up);
    h.addEventListener('pointercancel', up);
    h.addEventListener('dblclick', (e) => { if (!(e.target as HTMLElement).closest('.pv-bar')) this.fit(); });
    window.addEventListener('keydown', (e) => {
      if (!h.offsetParent || (e.target as HTMLElement).matches('input, textarea, select')) return;
      if (e.key === 'f' || e.key === 'F') this.fit();
    });
  }
}

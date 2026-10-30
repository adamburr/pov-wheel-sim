// The Panels tab in the settings: the panel build's own settings, what the design came out as,
// and the downloads (the cut file, a reference drawing and the full report).
import GUI from 'lil-gui';
import type { Params } from '../params';
import { derive, LED_RIM_CLEAR_MM } from '../sim/timing';
import { designReport, type PanelDesign } from './design';
import { cutFiles, referenceDxf } from './dxf';
import { applyToSim, PANEL_STRIPS } from './fromParams';

export interface PanelsState { design?: PanelDesign; error?: string; busy?: boolean }

export interface PanelsTab {
  gui: GUI;
  show: (s: PanelsState) => void;
  /** Redraw the summary (the simulator's strip settings may have changed). */
  refresh: () => void;
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function buildPanelsTab(p: Params, pane: HTMLElement, onChange: (key: string) => void): PanelsTab {
  const actions = pane.querySelector<HTMLElement>('.panels-actions')!;
  const summary = pane.querySelector<HTMLElement>('.panels-result')!;
  const gui = new GUI({ container: pane.querySelector<HTMLElement>('.gui')!, autoPlace: false });
  gui.add(p, 'stripCount', 1, 4, 1).name('Strips per side');
  gui.add(p, 'panelTipRadiusMm', 0, 400, 0.05).name('Tip radius (mm, 0 = rim)');
  gui.add(p, 'panelBoreMm', 10, 80, 0.1).name('Bore Ø, at least (mm)');
  gui.add(p, 'panelTipSlot', { 'Where a nipple is under a tip': 'auto', 'None: stop short of the nipples': 'none' }).name('Nipple slot');
  const ties = gui.addFolder('Spoke ties').close();
  ties.add(p, 'panelDiscCross', 0, 4, 1).name('Disc to spoke cross (0 = outermost)');
  ties.add(p, 'panelTieSpanMm', 30, 200, 1).name('Ties at most every (mm)');
  ties.add(p, 'panelTipTieMm', 5, 80, 1).name('Tie within this of each tip (mm)');
  ties.add(p, 'panelTabMaxMm', 0, 120, 1).name('Tab reach beyond blade (mm, 0 = auto)');
  const holes = gui.addFolder('Strip, holes and blade').close();
  holes.add(p, 'panelStripWidthMm', 5, 30, 0.5).name('Strip width (mm)');
  holes.add(p, 'panelStripMinMm', 15, 120, 1).name('Strips no closer than r (mm)');
  holes.add(p, 'panelStripThickMm', 1, 10, 0.1).name('Strip thickness (mm)');
  holes.add(p, 'panelTieWidthMm', 1.5, 8, 0.1).name('Tie width (mm)');
  holes.add(p, 'panelTieClearMm', 0, 3, 0.1).name('Hole clearance (mm)');
  holes.add(p, 'panelHolesEvery', 1, 6, 1).name('Strip ties every N pixels');
  holes.add(p, 'panelEdgeMm', 1, 10, 0.1).name('Hole to edge (mm)');
  holes.add(p, 'panelCornerMm', 0.5, 10, 0.1).name('Corner radius (mm)');
  holes.add(p, 'panelBladeWidthMm', 0, 80, 1).name('Blade width (mm, 0 = narrowest)');
  const hub = gui.addFolder('Hub and fork (typical values)').close();
  hub.add(p, 'spokeCrosses', 0, 4, 1).name('Spoke crosses');
  hub.add(p, 'hubFlangePcdMm', 30, 80, 0.5).name('Flange hole circle Ø (mm)');
  hub.add(p, 'hubFlangeOffsetMm', 15, 50, 0.5).name('Centre to flange (mm)');
  hub.add(p, 'hubOldMm', 90, 150, 1).name('Over-locknut width (mm)');
  hub.add(p, 'forkCrownRadiusMm', 200, 450, 1).name('Fork crown radius (mm)');
  hub.add(p, 'forkCrownHalfMm', 10, 40, 0.5).name('Fork half-width at crown (mm)');
  gui.onChange((e) => queueMicrotask(() => onChange(e.property)));

  let state: PanelsState = { busy: true };

  function render() {
    const d = state.design;
    actions.innerHTML = d ? `
      <button type="button" class="primary" data-act="cut" title="SendCutSend-ready: inches, one layer, closed outlines">⬇ Cut file${d.identical ? '' : 's'} (DXF, inches)</button>
      <button type="button" data-act="ref" title="Both panels in mm, with LED strips, sensors and labels. Not for cutting.">Reference DXF (mm)</button>
      <button type="button" data-act="report" title="Every computed number">Report (JSON)</button>
      ${d.identical ? '<p class="hint order-note">📝 Left and right are mirror images: cut two and turn one over.</p>' : ''}` : '';
    if (!PANEL_STRIPS.includes(p.stripCount)) {
      summary.innerHTML = `<p class="hint">The panels come with 1 to 4 blades per side, one per strip. The hardware has ${p.stripCount} strips: pick 1–4 below.</p>`;
      return;
    }
    if (!d) {
      summary.innerHTML = `<p class="hint">${state.error ? `<span class="warn">${esc(state.error)}</span>` : 'Designing the panels…'}</p>`;
      return;
    }
    const L = d.sides.LEFT.summary, R = d.sides.RIGHT.summary, pp = d.spec;
    const both = (f: (s: typeof L) => string) => (f(L) === f(R) ? f(L) : `${f(L)} (left) · ${f(R)} (right)`);
    const fc = (L.forkClearance.minMm <= R.forkClearance.minMm ? L : R).forkClearance;
    const rows: [string, string][] = [
      ['Order', d.identical ? '2 of one part (left and right are mirror images)' : 'one LEFT and one RIGHT part'],
      ['Part', both((s) => `${s.partSizeIn[0]} × ${s.partSizeIn[1]} in (${s.partSizeMm[0]} × ${s.partSizeMm[1]} mm)`)],
      ['Material', `${pp.label}, ${pp.thickness.toFixed(2)} mm`],
      ['Mass', both((s) => `${s.massG} g`) + ' per panel'],
      ['Blades', `${d.arms.length} × ${L.bladeW} mm wide, ${d.arms.length > 1 ? `${d.armSpacing}° apart, ` : ''}at ${d.arms.map((a) => `${a.toFixed(2)}°`).join(', ')}`],
      ['LEDs', `${L.ledsPerStrip} per blade, r ${L.ledStartR}–${L.ledEndR} mm`],
      ['Bore', `Ø ${pp.boreD.toFixed(1)} mm: out to ${pp.boreToStrip} mm inside the strips' inner ends${pp.boreD <= pp.boreMinD + 1e-6 ? ` (held at the ${pp.boreMinD} mm minimum)` : ''}`],
      ['Disc', `Ø ${L.discD} mm${d.wheel.p.crosses ? ` to spoke cross ${L.discCross}` : ', tied to the spokes'}: ${both((s) => `${s.discTies}`)} ties at r ${L.discTieR ?? '–'} mm`
        + (L.discTiesUnderStrips || R.discTiesUnderStrips ? ` (${Math.max(L.discTiesUnderStrips, R.discTiesUnderStrips)} under a strip left out)` : '')],
      ['Sensors', pp.sensor ? `a hall switch (US5881) ${d.arms.length > 1 ? 'midway between each pair of strips' : 'opposite the blade'}, marked face out, tied on`
        + ` (${both((s) => `${s.sensorsOnDisc} on the disc`)}), r ${both((s) => s.sensorR.join('/'))} mm · the strip's field there ≤ ${Math.max(L.sensorFieldUT ?? 0, R.sensorFieldUT ?? 0)} µT`
        + ` at full white; the switch releases at ${pp.sensorReleaseMT} mT or more · ${Math.min(L.forkClearance.sensorFaceToForkMm ?? 0, R.forkClearance.sensorFaceToForkMm ?? 0)} mm from its face to the fork for the magnet` : 'none'],
      ['Spoke ties', both((s) => `${s.spokeTiesPerBlade.join('/')} per blade`) + ` · tabs up to ${Math.max(L.maxEarMm, R.maxEarMm)} mm`],
      ['Spans', `≤ ${Math.max(L.longestSpanMm, R.longestSpanMm)} mm between ties · tips ${Math.max(L.tipOverhangMm, R.tipOverhangMm)} mm past the last`],
      ['Holes', both((s) => `${s.holesTotal} (${s.holes.strip} strip, ${s.holes.spoke} spoke, ${s.holes.disc} disc, ${s.holes.sensor} sensor, ${s.holes.wire} wire slot${s.holes.wire === 1 ? '' : 's'})`) + ` · □ ${(pp.tieW + pp.tieClear).toFixed(1)} mm`],
      ['Wire slots', pp.wireHoleD > 0 ? `${pp.wireHoleD} mm wide, one per strip from just inside its hall sensor's leads straight in to the bore (cut with it), for the sensor's and the strip's wires to the inner side; they open the disc so it bends to the spokes' cone`
        + (L.holes.wire > [...d.sides.LEFT.g.holes].filter((h) => h.slot).length ? ' (a round hole where a slot doesn\'t fit)' : '') : 'none'],
      ['Fork', `${fc.minMm} mm (${fc.governedBy}) · bare panel ${Math.min(L.forkClearance.panelFaceMm, R.forkClearance.panelFaceMm)} mm`],
      ['Valve', `${Math.min(L.valveClearMm, R.valveClearMm)} mm clear`],
    ];
    const over = [d.sides.LEFT, d.sides.RIGHT].reduce((n, s) => n + s.spokeTies.filter((t) => t.over).length, 0);
    const notes = [d.rimNote,
      over ? `${over} spoke tie${over > 1 ? 's go' : ' goes'} over the strip between two LEDs, where a spoke runs under the strip and no tab reaches another: fit ${over > 1 ? 'them' : 'it'} after the strip.` : '',
      d.tipSlot ? `Nipple slot ${d.tipSlot.widthMm} wide × ${d.tipSlot.depthMm} mm deep where a nipple is under a tip (from the assumed rim and nipple: confirm).` : '',
      'The hub (the bore\'s 1.5" minimum) and the tip radius are measured; the other wheel, hub and fork values are typical until measured.'].filter(Boolean);
    // where the simulator's strips are, against where these panels hold the LEDs
    const sd = derive(p);
    const simRim = p.bsdMm / 2 - LED_RIM_CLEAR_MM - (d.sim.stripStartMm + d.sim.stripLengthMm) < p.rimDepthMm;
    const simStart = Math.round(sd.rStart * 1000), simEnd = Math.round(sd.rEnd * 1000);
    const matches = !p.autoLength && p.stripStartMm === d.sim.stripStartMm && p.stripLengthMm === d.sim.stripLengthMm
      && p.ledDensity === d.sim.ledDensity && sd.ledsPerStrip === L.ledsPerStrip;
    summary.innerHTML = `
      <table class="kv">${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
      ${d.warnings.length ? `<ul class="warn">${d.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
      <p class="hint">${notes.map(esc).join('<br>')}</p>
      <div class="panels-sim">${matches
        ? '✓ The simulator\'s strips match these panels.'
        : `The simulator shows ${sd.ledsPerStrip} LEDs per strip at r ${simStart}–${simEnd} mm; these panels hold ${L.ledsPerStrip} at r ${d.sim.stripStartMm}–${d.sim.stripStartMm + d.sim.stripLengthMm} mm.
           <button type="button" data-act="sim" title="Sets the simulator's strip start and length${simRim ? ', and the rim depth so the outer LEDs fit' : ''}">Use in simulator</button>`}</div>
      ${state.busy ? '<p class="hint">Updating…</p>' : ''}`;
    const on = (act: string, fn: () => void) => { const b = pane.querySelector<HTMLElement>(`[data-act="${act}"]`); if (b) b.onclick = fn; };
    on('cut', () => cutFiles(d).forEach((f, i) => setTimeout(() => download(f.name, f.text, 'application/dxf'), i * 400)));
    on('ref', () => download(`${d.name}_reference_mm.dxf`, referenceDxf(d), 'application/dxf'));
    on('report', () => download(`${d.name}_report.json`, JSON.stringify(designReport(d), null, 1), 'application/json'));
    on('sim', () => { applyToSim(p, d); onChange('stripStartMm'); });
  }

  return {
    gui,
    show: (s) => { state = { ...s, design: s.design ?? (s.busy ? state.design : undefined) }; render(); },
    refresh: render,
  };
}

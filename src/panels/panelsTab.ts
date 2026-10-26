// The Panels tab in the settings: the panel build's own settings, what the design came out as,
// and the downloads (the cut file, a reference drawing and the full report).
import GUI from 'lil-gui';
import type { Params } from '../params';
import { derive } from '../sim/timing';
import { designReport, MATERIALS, type PanelDesign } from './design';
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
  gui.add(p, 'stripCount', 2, 4, 1).name('Strips per side');
  const materials: Record<string, string> = {};
  for (const [k, m] of Object.entries(MATERIALS)) materials[`${m.label} · ${m.role}`] = k;
  gui.add(p, 'panelMaterial', materials).name('Material');
  gui.add(p, 'panelTipRadiusMm', 0, 400, 0.05).name('Tip radius (mm, 0 = rim)');
  gui.add(p, 'panelBoreMm', 10, 80, 0.1).name('Bore Ø (mm)');
  gui.add(p, 'panelTipSlot', { 'Every tip': 'all', 'Only a tip on a spoke': 'auto', 'None': 'none' }).name('Nipple slot');
  const holes = gui.addFolder('Holes and strip').close();
  holes.add(p, 'panelStripWidthMm', 5, 30, 0.5).name('Strip width (mm)');
  holes.add(p, 'panelStripThickMm', 1, 10, 0.1).name('Strip thickness (mm)');
  holes.add(p, 'panelTieWidthMm', 1.5, 8, 0.1).name('Tie width (mm)');
  holes.add(p, 'panelTieClearMm', 0, 3, 0.1).name('Hole clearance (mm)');
  holes.add(p, 'panelHolesEvery', 1, 6, 1).name('Holes every N pixels');
  holes.add(p, 'panelEdgeMm', 1, 10, 0.1).name('Hole to edge (mm)');
  holes.add(p, 'panelBoreEdgeMm', 0.5, 10, 0.1).name('Hole to bore (mm)');
  holes.add(p, 'panelCornerMm', 0.5, 10, 0.1).name('Corner radius (mm)');
  const plate = gui.addFolder('Electronics plate').close();
  plate.add(p, 'panelPlateHalfWidthMm', 15, 80, 0.1).name('Half width (mm)');
  plate.add(p, 'panelPlateLengthMm', 10, 120, 1).name('Length from centre (mm)');
  plate.add(p, 'panelTaperCols', 0, 10, 1).name('Taper over N hole columns');
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
      <button type="button" data-act="report" title="Every computed number">Report (JSON)</button>` : '';
    if (!PANEL_STRIPS.includes(p.stripCount)) {
      summary.innerHTML = `<p class="hint">The panels come with 2, 3 or 4 blades per side, one per strip. The hardware has ${p.stripCount} strips: pick 2–4 below.</p>`;
      return;
    }
    if (!d) {
      summary.innerHTML = `<p class="hint">${state.error ? `<span class="warn">${esc(state.error)}</span>` : 'Designing the panels…'}</p>`;
      return;
    }
    const L = d.sides.LEFT.summary, R = d.sides.RIGHT.summary, pp = d.spec;
    const fc = (L.forkClearance.minMm <= R.forkClearance.minMm ? L : R).forkClearance;
    const th = L.tieHeadsInside;
    const rows: [string, string][] = [
      ['Order', d.identical ? '2 of one part (left and right are identical)' : 'one LEFT and one RIGHT part'],
      ['Part', `${L.partSizeIn[0]} × ${L.partSizeIn[1]} in (${L.partSizeMm[0]} × ${L.partSizeMm[1]} mm)`],
      ['Material', `${pp.label}, ${pp.thickness.toFixed(2)} mm`],
      ['Holes', `${L.holesTotal}${L.holesPerBlade ? ` (${L.holesPerBlade.join('/')} per blade)` : ''} · □ ${(pp.tieW + pp.tieClear).toFixed(1)} mm`],
      ['Mass', `${L.massG} g per panel`],
      ['Blades', `${d.arms.map((a) => `${a.toFixed(2)}°`).join(', ')}`],
      ['LEDs', `${L.ledsPerStrip} per blade, r ${L.ledStartR}–${L.ledEndR} mm`],
      ['Bending', `tip force ${L.tipForceN} N · clamp ${L.clampForceOnHubN} N`],
      ['Stress', `${Math.max(L.sigmaMaxMPa, R.sigmaMaxMPa)} MPa (target ≤ ${pp.sigmaAllow})`],
      ['Spokes', `${Math.min(L.spokeClearance.minGapMm, R.spokeClearance.minGapMm)} mm gap · tips ${R.spokeClearance.tipsSideClearMm} mm sideways`
        + ` · ${L.spokeClearance.collisionPoints + R.spokeClearance.collisionPoints} collisions`],
      ['Fork', `${fc.minMm} mm (${fc.governedBy}) · bare panel ${Math.min(L.forkClearance.panelFaceMm, R.forkClearance.panelFaceMm)} mm`],
      ['Tie heads', th.nMoveOutside ? `${th.nMoveOutside} go on the outer face (at r ${[...new Set(th.moveOutside.map((m) => m.r))].join(', ')} mm)` : 'all fit on the inner face'],
      ['Shake', `${d.lateralGBeforeAPanelLifts} g sideways before a panel lifts`],
    ];
    const notes = [d.spacingNote, d.rimNote,
      d.tipSlot ? `Nipple slot ${d.tipSlot.widthMm} wide × ${d.tipSlot.depthMm} mm deep in ${pp.tipSlot === 'all' ? 'every tip' : 'the tips'} (from the assumed rim and nipple: confirm).` : '',
      'Bore and tip radius are measured; the other wheel, hub and fork values are typical until measured.'].filter(Boolean);
    // where the simulator's strips are, against where these panels hold the LEDs
    const sd = derive(p);
    const simRim = p.bsdMm / 2 - 8 - (d.sim.stripStartMm + d.sim.stripLengthMm) < p.rimDepthMm;
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

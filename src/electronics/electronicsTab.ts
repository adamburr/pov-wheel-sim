// The Electronics tab in the settings: the battery and hub settings, what the electronics came out as,
// and the shopping list (shown here, and as a CSV download).
import GUI from 'lil-gui';
import type { Params } from '../params';
import type { Electronics } from './design';

export interface ElectronicsTab {
  gui: GUI;
  show: (e: Electronics) => void;
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const usd = (x: number) => `$${x.toFixed(2)}`;

export function buildElectronicsTab(p: Params, pane: HTMLElement, onChange: (key: string) => void): ElectronicsTab {
  const actions = pane.querySelector<HTMLElement>('.panels-actions')!;
  const summary = pane.querySelector<HTMLElement>('.elec-result')!;
  const list = pane.querySelector<HTMLElement>('.elec-shopping')!;
  const gui = new GUI({ container: pane.querySelector<HTMLElement>('.gui')!, autoPlace: false });
  gui.add(p, 'cells', 1, 4, 1).name('18650 cells');
  gui.add(p, 'cellMah', 1500, 5000, 50).name('Cell capacity (mAh)');
  gui.add(p, 'ledCapA', 0.5, 8, 0.1).name('Current limit (A)');
  gui.onChange((ev) => queueMicrotask(() => onChange(ev.property)));

  let current: Electronics | undefined;

  function show(e: Electronics) {
    current = e;
    actions.innerHTML = `
      <button type="button" class="primary" data-act="csv" title="Every part with quantity, source, price and link">⬇ Shopping list (CSV)</button>
      <button type="button" data-act="copy" title="Copy the list as plain text">Copy list</button>`;
    const w = e.power;
    const rows: [string, string][] = [
      ['Controller', 'Feather RP2350 (8 MB PSRAM): one PIO program sends every strip its own data on GP0–7, a clock per side; all wired from the headers'],
      ['Controls', 'in the electronics box\'s lid: preset button (A1) and brightness button (D25, on the power latch)'],
      ['Strips', `${e.n} per side × 2 sides, ${e.leds} LEDs each (${e.totalLeds} in all)`],
      ['Lanes', e.lanes.map((l) => `${l.net} GP${l.gpio}`).join(' · ') + ' · clocks GP10/11'],
      ['Level shifters', `${e.shifters.length} × 74AHCT125 at 5 V, 33 Ω in series with each output`],
      ['Hall sensors', `${e.halls} × US5881 on the left panel, from the battery through a filter, 10k pull-ups to 3.3 V`],
      ['LED power', `full white ${w.peakA} A · limited to ${w.capA} A by the firmware · boost gives ~${w.boostMaxA} A`],
      ['Battery', `${p.cells} × 18650 (1S${p.cells}P), ${w.ah} Ah · ${w.battA} A at the limit (${w.perCellA} A a cell) · ≥ ${w.runtimeAtCapH} h even at the limit`],
      ['Charging', `~${w.chargeA} A through J1 with the right panel off: ~${w.chargeH} h from empty`],
      ['Right connector', `Weipu SP13 9-pin, IP68: ${w.perSideA} A on two 5 V contacts (${w.perPinA} A each, rated 3 A)`],
      ['On/off', 'double-click the brightness button; the firmware also turns off after a while stopped'],
      ['Hub module', `one stack in a printed bracket on a Ø${2 * e.hub.shellR} mm shell: ${e.hub.moduleG} g, centre ${e.hub.moduleR} mm out`],
      ['Balance', `${e.hub.counterweight.massG} g on the rim's inner face ${e.hub.counterweight.angleDeg === 180 ? 'opposite the '
        + 'module' : 'on the module\'s side'} (module opposite the ${e.n === 1 ? 'blades, valve' : 'valve'} and J1)`],
      ['Strips idle', `${w.idleMa} mA with the LEDs dark: the firmware turns the boost off when stopped`],
    ];
    summary.innerHTML = `
      <table class="kv">${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
      ${e.warnings.length ? `<ul class="warn">${e.warnings.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      <ul class="notes">${e.notes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
    const groups = [...new Set(e.bom.map((b) => b.group))];
    list.innerHTML = groups.map((g) => {
      const lines = e.bom.filter((b) => b.group === g);
      const sum = lines.reduce((s, b) => s + (b.each ? b.qty * b.each : 0), 0);
      return `<div class="bom-group">${esc(g)}${sum ? ` <span>${usd(sum)} known</span>` : ''}</div>
        <table class="bom">${lines.map((b) => `<tr>
          <td class="qty">${b.qty}×</td>
          <td>${esc(b.item)}<div class="src">${b.url ? `<a href="${b.url}" target="_blank" rel="noopener">${esc(b.source)} `
            + `${esc(b.part)}</a>` : `${esc(b.source)}${b.part !== '—' ? ` · ${esc(b.part)}` : ''}`}${b.note ? ` · ${esc(b.note)}` : ''}</div></td>
          <td class="price">${b.each ? usd(b.qty * b.each) : ''}</td></tr>`).join('')}</table>`;
    }).join('') + `<p class="hint">Known prices for the wheel: ${usd(e.knownCost)} (Adafruit and Pololu, single quantities). Parts without a price come from any supplier.</p>`;
    const on = (act: string, fn: () => void) => { const b = pane.querySelector<HTMLElement>(`[data-act="${act}"]`); if (b) b.onclick = fn; };
    on('csv', async () => {
      const { bomCsv } = await import('./design'); // loaded already, with the sheets
      const url = URL.createObjectURL(new Blob([bomCsv(e)], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(p.setupName || 'wheel').replace(/[^\w-]+/g, '_')}_shopping_list.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    on('copy', () => {
      if (!current) return;
      const text = current.bom.map((b) => `${b.qty} × ${b.item} — ${b.source}${b.part !== '—' ? ` ${b.part}` : ''}${b.url ? ` ${b.url}` : ''}`).join('\n');
      void navigator.clipboard?.writeText(text);
    });
  }

  return { gui, show };
}

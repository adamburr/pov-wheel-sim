// The Panels and Electronics views: the panel designer (in a worker), the panel drawing and the
// electronics sheets. They are a good part of the app's code and most visits never open them, so
// main.ts loads this module the first time either tab opens.
import type { Params } from './params';
import type { Ui } from './ui';
import { PanelDrawing } from './panels/drawing';
import { designElectronics } from './electronics/design';
import { ElecView } from './electronics/view';
import { type PackedDesign, unpackDesign } from './panels/transport';
import { PANEL_STRIPS, panelInputs, panelKey } from './panels/fromParams';

export interface Workshop {
  drawing: PanelDrawing;
  elecView: ElecView;
  /** Design the panels for the current settings, unless they're designed already. */
  updatePanels: () => void;
  updateElectronics: () => void;
}

export function createWorkshop(p: Params, ui: Ui): Workshop {
  const back = () => ui.openTab('presets', false);

  // ---- Panels: the flat-cut supports for the strips, designed while their tab is open ----
  // A design takes most of a second, so a worker does it, one at a time, always on the latest settings.
  const drawing = new PanelDrawing(document.getElementById('panels-view')!, back);
  const designer = new Worker(new URL('./panels/worker.ts', import.meta.url), { type: 'module' });
  let designKey = '';
  let designing = 0; // id of the request in progress (0: none)
  let designQueued = false;
  let designId = 0;
  function showError(msg: string) {
    ui.panels.show({ error: msg });
    drawing.setDesign(undefined, msg);
  }
  function sendDesign() {
    designQueued = false;
    designing = ++designId;
    designer.postMessage({ id: designing, ...panelInputs(p) });
  }
  designer.onmessage = (e: MessageEvent<{ id: number; design?: PackedDesign; error?: string }>) => {
    if (e.data.id !== designing) return;
    designing = 0;
    if (designQueued) { sendDesign(); return; } // the settings changed meanwhile
    if (e.data.design) {
      const d = unpackDesign(e.data.design);
      ui.panels.show({ design: d });
      drawing.setDesign(d);
    } else {
      showError(`Couldn't design the panels: ${e.data.error}`);
    }
  };
  // The worker failed to load or stopped with an error it couldn't report: say so rather than
  // design forever. The next change to the settings tries again.
  function failed(why: string) {
    designing = 0;
    designQueued = false;
    showError(`Couldn't design the panels: ${why}.`);
  }
  designer.onerror = (e) => { e.preventDefault(); failed(e.message || 'the designer stopped'); };
  designer.onmessageerror = () => failed('its result could not be read');
  function updatePanels() {
    const key = panelKey(p);
    if (key === designKey) return;
    designKey = key;
    if (!PANEL_STRIPS.includes(p.stripCount)) {
      designQueued = false;
      designing = 0; // a design still running is for other settings
      showError(`The panels come with 1 to 4 blades per side, one per strip; the hardware has ${p.stripCount} strips.`);
      return;
    }
    ui.panels.show({ busy: true });
    drawing.setDesign(undefined, 'Designing…');
    if (designing) designQueued = true; else sendDesign();
  }

  // ---- Electronics: worked out at once from the settings while their tab is open ----
  const elecView = new ElecView(document.getElementById('elec-view')!, back);
  function updateElectronics() {
    const e = designElectronics(p);
    ui.electronics.show(e);
    elecView.show(e, p.spokes);
  }

  return { drawing, elecView, updatePanels, updateElectronics };
}

// Designs the panels off the page's thread: a design takes most of a second.
import { designPanels, type PanelSpec, type WheelInput } from './design';
import { packDesign } from './transport';

export interface DesignRequest { id: number; wheel: WheelInput; panel: Partial<PanelSpec> }

self.onmessage = (e: MessageEvent<DesignRequest>) => {
  const { id, wheel, panel } = e.data;
  try {
    self.postMessage({ id, design: packDesign(designPanels(wheel, panel)) });
  } catch (err) {
    self.postMessage({ id, error: (err as Error).message });
  }
};

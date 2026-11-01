// The app's own settings (0.8 mm polypropylene), with the strip count and any others changed: a design
// for each, made once per test file and shared by its tests.
import { defaultParams } from '../src/params';
import { designPanels, type PanelDesign } from '../src/panels/design';
import { panelInputs } from '../src/panels/fromParams';

const designs = new Map<string, PanelDesign>();
export const design = (strips: number, more: Partial<ReturnType<typeof defaultParams>> = {}) => {
  const key = JSON.stringify([strips, more]);
  if (!designs.has(key)) {
    const { wheel, panel } = panelInputs({ ...defaultParams(), stripCount: strips, ...more });
    designs.set(key, designPanels(wheel, panel));
  }
  return designs.get(key)!;
};

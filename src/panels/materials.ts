// Sheet material for the panels. The panels lie on the spokes and are tied to them, so they carry
// almost no load: thickness and weight are what count, and thin, flexible sheet follows the dished
// spokes best.
export interface Material {
  label: string;
  role: string;
  thickness: number;   // mm
  density: number;     // g/cm³
  cutCornerR: number;  // radius on the tie holes' corners
  /** Smallest piece of material the cutter leaves reliably (mm). */
  minFeature?: number;
  /** Largest part the cutter takes (in, short side × long side). */
  maxPartIn?: [number, number];
}

export const MATERIALS: Record<string, Material> = {
  // Polypropylene sheet: tough, flexible and weatherproof; laser, CNC drag knife or vinyl cutter.
  pp_08: { label: 'Polypropylene 0.8 mm', role: 'laser or knife', thickness: 0.8, density: 0.905, cutCornerR: 0.4 },
};

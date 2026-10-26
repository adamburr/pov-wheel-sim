// Sheet materials for the panels. Typical values, not tested ones.
export interface Material {
  label: string;
  role: string;
  thickness: number;   // mm
  E: number;           // MPa, bending; along the face grain for plywood
  density: number;     // g/cm³
  sigmaAllow: number;  // MPa, bending stress target; along the face grain for plywood
  cutCornerR: number;  // radius on the tie holes' corners
  /** Plywood: bending stiffness and stress target ACROSS the face grain (blades in between follow Hankinson's formula). */
  ETrans?: number;
  sigmaAllowTrans?: number;
  /** Creep factor (Eurocode 5 k_def): under the tie preload the clamp relaxes to 1 / (1 + creep) of its first value. */
  creep?: number;
  /** Smallest piece of material the cutter leaves reliably (mm). */
  minFeature?: number;
  /** Largest part the cutter takes (in, short side × long side). */
  maxPartIn?: [number, number];
}

export const MATERIALS: Record<string, Material> = {
  g10_063: { label: 'G-10/FR-4 1/16"', role: 'waterjet', thickness: 1.6, E: 18000, density: 1.85, sigmaAllow: 60, cutCornerR: 1.0 },
  // SendCutSend .125" Baltic birch (B/BB, 3-ply, 3.18 mm, laser cut). Bending values: Metsä Wood's declared
  // performance for 4 mm 3-ply birch plywood, mean E 16 471 / 1 029 MPa and characteristic strength 65.9 /
  // 10.6 MPa along / across the face grain. Stress targets are Eurocode 5 design strengths for a permanent
  // load: 0.6 × characteristic / 1.2. Creep: k_def 1.0 (plywood, service class 2: seal the panels). SendCutSend
  // keeps features 0.08" or more and takes parts up to 30" × 44".
  birch_125: {
    label: 'Baltic birch 1/8"', role: 'SendCutSend, laser (blades along the face grain)', thickness: 3.18, E: 16471, density: 0.68,
    sigmaAllow: 33.0, cutCornerR: 0.4, ETrans: 1029, sigmaAllowTrans: 5.3, creep: 1.0, minFeature: 2.03, maxPartIn: [30, 44],
  },
  // Prototypes: the stress targets are SHORT-TERM (about 1/3 of typical bending strength): fit checks and test rides only.
  hardboard_125: { label: 'Hardboard 1/8"', role: 'prototype, laser', thickness: 3.175, E: 4500, density: 0.95, sigmaAllow: 15, cutCornerR: 0.4 },
  delrin_125: { label: 'Delrin 150 1/8"', role: 'laser', thickness: 3.175, E: 2900, density: 1.41, sigmaAllow: 20, cutCornerR: 0.4 },
};

/**
 * Bending stiffness and stress target of a blade at `deg` degrees to the face grain. Plywood is far
 * stiffer and stronger along its face grain; in between, Hankinson's formula (n = 2). Other materials
 * are the same every way.
 */
export function atGrain(m: Material, deg: number): { E: number; sigmaAllow: number } {
  if (!m.ETrans || !m.sigmaAllowTrans) return { E: m.E, sigmaAllow: m.sigmaAllow };
  const s2 = Math.sin((deg * Math.PI) / 180) ** 2, c2 = 1 - s2;
  const hank = (along: number, across: number) => (along * across) / (along * s2 + across * c2);
  return { E: hank(m.E, m.ETrans), sigmaAllow: hank(m.sigmaAllow, m.sigmaAllowTrans) };
}

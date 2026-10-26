// Sheet materials for the panels. Typical values, not tested ones.
export interface Material {
  label: string;
  role: string;
  thickness: number;   // mm
  E: number;           // MPa
  density: number;     // g/cm³
  sigmaAllow: number;  // MPa, bending stress target
  cutCornerR: number;  // radius on the tie holes' corners
}

export const MATERIALS: Record<string, Material> = {
  g10_063: { label: 'G-10/FR-4 1/16"', role: 'final, waterjet', thickness: 1.6, E: 18000, density: 1.85, sigmaAllow: 60, cutCornerR: 1.0 },
  // Prototypes: the stress targets are SHORT-TERM (about 1/3 of typical bending strength): fit checks and test rides only.
  birch_125: { label: 'Baltic birch 1/8"', role: 'prototype, laser (blades along the face grain)', thickness: 3.175, E: 9000, density: 0.68, sigmaAllow: 25, cutCornerR: 0.4 },
  hardboard_125: { label: 'Hardboard 1/8"', role: 'prototype, laser', thickness: 3.175, E: 4500, density: 0.95, sigmaAllow: 15, cutCornerR: 0.4 },
  delrin_125: { label: 'Delrin 150 1/8"', role: 'laser', thickness: 3.175, E: 2900, density: 1.41, sigmaAllow: 20, cutCornerR: 0.4 },
};

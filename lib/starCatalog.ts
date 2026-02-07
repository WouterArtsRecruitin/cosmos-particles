/**
 * Star Catalog Module
 * Generates per-particle colors and sizes matching the original
 * GlobularClusterVisualization's realistic star distribution.
 *
 * Usage:
 *   const { colors, sizes } = generateStarCatalog(55000);
 *   // colors: Float32Array of r,g,b triples
 *   // sizes:  Float32Array of per-particle sizes
 */

// Stellar color palette (same as original GlobularClusterVisualization)
const STAR_COLORS: Record<string, [number, number, number]> = {
  blueGiant:    [0.62, 0.73, 0.95],
  brightBlue:   [0.55, 0.68, 0.92],
  mainSequence: [0.88, 0.87, 0.78],
  warmWhite:    [0.92, 0.89, 0.75],
  paleYellow:   [0.96, 0.91, 0.68],
  deepOrange:   [0.95, 0.72, 0.45],
  paleOrange:   [0.92, 0.78, 0.58],
  amber:        [0.98, 0.65, 0.35],
  redDwarf:     [0.92, 0.52, 0.38],
  deepRed:      [0.85, 0.45, 0.35],
  darkRed:      [0.78, 0.38, 0.32],
  fadedOrange:  [0.82, 0.68, 0.52],
  dimYellow:    [0.85, 0.78, 0.58],
  neutralGray:  [0.70, 0.72, 0.75],
  faintBlue:    [0.58, 0.62, 0.72],
  dustyRose:    [0.75, 0.58, 0.55],
};

function getColor(type: string, variation: number): [number, number, number] {
  const base = STAR_COLORS[type] || [1, 1, 1];
  return [
    Math.max(0, Math.min(1, base[0] + variation)),
    Math.max(0, Math.min(1, base[1] + variation * 0.7)),
    Math.max(0, Math.min(1, base[2] + variation * 0.5)),
  ];
}

export interface StarCatalogResult {
  colors: Float32Array;     // r,g,b per particle (count * 3)
  sizes: Float32Array;      // per particle size   (count)
  brightnesses: Float32Array; // per particle alpha (count)
}

/**
 * Generate realistic star colors and sizes for a given particle count.
 * First 20% are "core" stars (brighter, more variety), rest are "halo" stars.
 */
export function generateStarCatalog(count: number): StarCatalogResult {
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const brightnesses = new Float32Array(count);

  const coreCount = Math.floor(count * 0.2);

  for (let i = 0; i < count; i++) {
    const isCore = i < coreCount;
    const random = Math.random();
    let rgb: [number, number, number];
    let size: number;
    let brightness: number;

    if (isCore) {
      // Core: mix of all star types (same distribution as original)
      if (random < 0.05) {
        rgb = getColor('blueGiant', Math.random() * 0.1 - 0.05);
        size = 0.006 + Math.pow(Math.random(), 1.3) * 0.018;
        brightness = 0.7 + Math.random() * 0.3;
      } else if (random < 0.12) {
        rgb = getColor('brightBlue', Math.random() * 0.08 - 0.04);
        size = 0.005 + Math.pow(Math.random(), 1.5) * 0.015;
        brightness = 0.6 + Math.random() * 0.25;
      } else if (random < 0.25) {
        rgb = getColor('paleYellow', Math.random() * 0.1 - 0.05);
        size = 0.004 + Math.pow(Math.random(), 1.6) * 0.013;
        brightness = 0.45 + Math.random() * 0.3;
      } else if (random < 0.40) {
        rgb = getColor('mainSequence', Math.random() * 0.08 - 0.04);
        size = 0.003 + Math.pow(Math.random(), 1.7) * 0.012;
        brightness = 0.4 + Math.random() * 0.3;
      } else if (random < 0.60) {
        rgb = getColor('deepOrange', Math.random() * 0.1 - 0.05);
        size = 0.003 + Math.pow(Math.random(), 1.6) * 0.013;
        brightness = 0.35 + Math.random() * 0.3;
      } else if (random < 0.75) {
        rgb = getColor('amber', Math.random() * 0.09 - 0.045);
        size = 0.003 + Math.pow(Math.random(), 1.7) * 0.011;
        brightness = 0.32 + Math.random() * 0.28;
      } else if (random < 0.88) {
        rgb = getColor('redDwarf', Math.random() * 0.08 - 0.04);
        size = 0.002 + Math.pow(Math.random(), 2.0) * 0.010;
        brightness = 0.28 + Math.random() * 0.25;
      } else if (random < 0.95) {
        rgb = getColor('deepRed', Math.random() * 0.07 - 0.035);
        size = 0.002 + Math.pow(Math.random(), 2.1) * 0.009;
        brightness = 0.22 + Math.random() * 0.22;
      } else {
        rgb = getColor('darkRed', Math.random() * 0.06 - 0.03);
        size = 0.002 + Math.pow(Math.random(), 2.2) * 0.008;
        brightness = 0.18 + Math.random() * 0.20;
      }
    } else {
      // Halo: older, dimmer stars (same distribution as original)
      if (random < 0.08) {
        rgb = getColor('faintBlue', Math.random() * 0.08 - 0.04);
        size = 0.002 + Math.pow(Math.random(), 2.2) * 0.008;
        brightness = 0.25 + Math.random() * 0.20;
      } else if (random < 0.25) {
        rgb = getColor('fadedOrange', Math.random() * 0.07 - 0.035);
        size = 0.002 + Math.pow(Math.random(), 2.3) * 0.008;
        brightness = 0.20 + Math.random() * 0.22;
      } else if (random < 0.45) {
        rgb = getColor('dimYellow', Math.random() * 0.08 - 0.04);
        size = 0.002 + Math.pow(Math.random(), 2.2) * 0.009;
        brightness = 0.22 + Math.random() * 0.24;
      } else if (random < 0.70) {
        rgb = getColor('redDwarf', Math.random() * 0.07 - 0.035);
        size = 0.002 + Math.pow(Math.random(), 2.4) * 0.007;
        brightness = 0.18 + Math.random() * 0.20;
      } else if (random < 0.85) {
        rgb = getColor('darkRed', Math.random() * 0.06 - 0.03);
        size = 0.001 + Math.pow(Math.random(), 2.5) * 0.007;
        brightness = 0.15 + Math.random() * 0.18;
      } else {
        rgb = getColor('neutralGray', Math.random() * 0.06 - 0.03);
        size = 0.001 + Math.pow(Math.random(), 2.5) * 0.006;
        brightness = 0.12 + Math.random() * 0.15;
      }
    }

    // Distance-based dimming (halo index maps to distance)
    const distRatio = isCore ? (i / coreCount) * 0.33 : 0.33 + ((i - coreCount) / (count - coreCount)) * 0.67;
    brightness *= (1.2 - distRatio * 0.4);
    brightness = Math.max(0.1, Math.min(1.8, brightness));

    const i3 = i * 3;
    colors[i3] = rgb[0];
    colors[i3 + 1] = rgb[1];
    colors[i3 + 2] = rgb[2];
    sizes[i] = size;
    brightnesses[i] = brightness;
  }

  return { colors, sizes, brightnesses };
}

import { ShapeType } from '../types';

export const TRAIL_LENGTH = 5;

function jitter(v: number, amount: number): number {
  return v + (Math.random() - 0.5) * amount;
}

function generateSphere(count: number): Float32Array {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = Math.pow(Math.random(), 0.33) * 10;
    positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  return positions;
}

function generateCluster(count: number): Float32Array {
  const positions = new Float32Array(count * 3);

  // Sub-clusters: center position + radius + particle share
  const clusters = [
    { x: 0, y: 0, z: 0, r: 4, weight: 0.30 },           // dense core
    { x: 7, y: 3, z: -2, r: 3, weight: 0.12 },           // satellite 1
    { x: -6, y: -4, z: 3, r: 2.5, weight: 0.10 },        // satellite 2
    { x: -3, y: 5, z: -6, r: 2, weight: 0.08 },          // satellite 3
    { x: 5, y: -5, z: 5, r: 2, weight: 0.08 },           // satellite 4
    { x: -8, y: 2, z: -4, r: 1.5, weight: 0.05 },        // small cluster
  ];
  const filamentShare = 0.12;
  const fieldShare = 0.15;

  let idx = 0;

  // Generate clustered particles
  for (const cl of clusters) {
    const n = Math.floor(count * cl.weight);
    for (let i = 0; i < n && idx < count; i++, idx++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      // Concentrated toward center (power distribution)
      const r = Math.pow(Math.random(), 0.6) * cl.r;
      positions[idx * 3]     = cl.x + r * Math.sin(phi) * Math.cos(theta);
      positions[idx * 3 + 1] = cl.y + r * Math.sin(phi) * Math.sin(theta);
      positions[idx * 3 + 2] = cl.z + r * Math.cos(phi);
    }
  }

  // Filaments connecting clusters (cosmic web strands)
  const filamentCount = Math.floor(count * filamentShare);
  const filamentPairs = [
    [clusters[0], clusters[1]],
    [clusters[0], clusters[2]],
    [clusters[0], clusters[3]],
    [clusters[1], clusters[4]],
    [clusters[2], clusters[5]],
  ];
  for (let i = 0; i < filamentCount && idx < count; i++, idx++) {
    const pair = filamentPairs[i % filamentPairs.length];
    const t = Math.random();
    const spread = 0.8 + Math.random() * 0.6;
    positions[idx * 3]     = pair[0].x + (pair[1].x - pair[0].x) * t + (Math.random() - 0.5) * spread;
    positions[idx * 3 + 1] = pair[0].y + (pair[1].y - pair[0].y) * t + (Math.random() - 0.5) * spread;
    positions[idx * 3 + 2] = pair[0].z + (pair[1].z - pair[0].z) * t + (Math.random() - 0.5) * spread;
  }

  // Scattered field particles (background stars)
  for (; idx < count; idx++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 3 + Math.random() * 15;
    positions[idx * 3]     = r * Math.sin(phi) * Math.cos(theta);
    positions[idx * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[idx * 3 + 2] = r * Math.cos(phi);
  }

  return positions;
}

function generateHeart(count: number): Float32Array {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const t = Math.random() * Math.PI * 2;
    const s = Math.random() * Math.PI;
    const r = 0.3 + Math.random() * 0.7;

    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    const z = (Math.random() - 0.5) * 8 * Math.sin(s);

    positions[i * 3]     = jitter(x * 0.55 * r, 0.8);
    positions[i * 3 + 1] = jitter(y * 0.55 * r, 0.8);
    positions[i * 3 + 2] = jitter(z * 0.55 * r, 0.8);
  }
  return positions;
}

function generateFlower(count: number): Float32Array {
  const positions = new Float32Array(count * 3);
  const petals = 5;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5)); // ~137.5°

  for (let i = 0; i < count; i++) {
    // Phyllotaxis arrangement
    const theta = i * goldenAngle;
    const r = Math.sqrt(i / count) * 10;
    const height = (Math.random() - 0.5) * 2;

    positions[i * 3]     = r * Math.cos(theta) + jitter(0, 0.3);
    positions[i * 3 + 1] = height;
    positions[i * 3 + 2] = r * Math.sin(theta) + jitter(0, 0.3);
  }
  return positions;
}

function generateSaturn(count: number): Float32Array {
  const positions = new Float32Array(count * 3);
  const planetCount = Math.floor(count * 0.45);

  // Planet sphere
  for (let i = 0; i < planetCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = Math.pow(Math.random(), 0.33) * 5;
    positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.9;
    positions[i * 3 + 2] = r * Math.cos(phi);
  }

  // Ring disk
  for (let i = planetCount; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const r = 6 + Math.random() * 5;
    positions[i * 3]     = r * Math.cos(theta);
    positions[i * 3 + 1] = jitter(0, 0.15);
    positions[i * 3 + 2] = r * Math.sin(theta);
  }
  return positions;
}

function generateBuddha(count: number): Float32Array {
  const positions = new Float32Array(count * 3);
  const scale = 9;

  for (let i = 0; i < count; i++) {
    const section = Math.random();
    let x: number, y: number, z: number;

    if (section < 0.2) {
      // Head sphere
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = Math.pow(Math.random(), 0.33) * scale * 0.22;
      x = r * Math.sin(phi) * Math.cos(theta);
      y = scale * 0.7 + r * Math.sin(phi) * Math.sin(theta);
      z = r * Math.cos(phi);
    } else if (section < 0.35) {
      // Ushnisha
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = Math.pow(Math.random(), 0.33) * scale * 0.1;
      x = r * Math.sin(phi) * Math.cos(theta);
      y = scale * 0.95 + r * Math.sin(phi) * Math.sin(theta);
      z = r * Math.cos(phi);
    } else if (section < 0.55) {
      // Body ellipsoid
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = Math.pow(Math.random(), 0.33);
      x = r * Math.sin(phi) * Math.cos(theta) * scale * 0.35;
      y = scale * 0.35 + r * Math.sin(phi) * Math.sin(theta) * scale * 0.3;
      z = r * Math.cos(phi) * scale * 0.25;
    } else if (section < 0.75) {
      // Crossed legs base
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = Math.pow(Math.random(), 0.33);
      x = r * Math.sin(phi) * Math.cos(theta) * scale * 0.5;
      y = scale * -0.05 + r * Math.sin(phi) * Math.sin(theta) * scale * 0.15;
      z = r * Math.cos(phi) * scale * 0.3;
    } else if (section < 0.85) {
      // Left arm
      const t = Math.random();
      const armR = scale * 0.06;
      x = -scale * 0.3 * (1 - t) + jitter(0, armR);
      y = scale * 0.2 + t * scale * 0.15 + jitter(0, armR);
      z = jitter(0, armR);
    } else if (section < 0.95) {
      // Right arm
      const t = Math.random();
      const armR = scale * 0.06;
      x = scale * 0.3 * (1 - t) + jitter(0, armR);
      y = scale * 0.2 + t * scale * 0.15 + jitter(0, armR);
      z = jitter(0, armR);
    } else {
      // Halo
      const theta = Math.random() * Math.PI * 2;
      const r = scale * (0.3 + Math.random() * 0.15);
      x = r * Math.cos(theta);
      y = scale * 0.7 + r * Math.sin(theta) * 0.6;
      z = -scale * 0.15;
    }

    positions[i * 3]     = x;
    positions[i * 3 + 1] = y - scale * 0.3;
    positions[i * 3 + 2] = z;
  }
  return positions;
}

function generateFireworks(count: number): Float32Array {
  const positions = new Float32Array(count * 3);
  const burstCount = 3 + Math.floor(Math.random() * 3);
  const perBurst = Math.floor(count / burstCount);

  for (let b = 0; b < burstCount; b++) {
    const cx = (Math.random() - 0.5) * 14;
    const cy = (Math.random() - 0.3) * 10;
    const cz = (Math.random() - 0.5) * 8;
    const burstRadius = 4 + Math.random() * 5;

    for (let i = 0; i < perBurst; i++) {
      const idx = b * perBurst + i;
      if (idx >= count) break;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = Math.pow(Math.random(), 0.5) * burstRadius;

      positions[idx * 3]     = cx + r * Math.sin(phi) * Math.cos(theta);
      positions[idx * 3 + 1] = cy + r * Math.sin(phi) * Math.sin(theta);
      positions[idx * 3 + 2] = cz + r * Math.cos(phi);
    }
  }

  for (let i = burstCount * perBurst; i < count; i++) {
    positions[i * 3]     = (Math.random() - 0.5) * 2;
    positions[i * 3 + 1] = -3 + Math.random() * 2;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 2;
  }
  return positions;
}

/**
 * Generate geometry positions for a given shape.
 * Returns a Float32Array of length (count * TRAIL_LENGTH * 3).
 * Trail copies start at the same position as the real particle.
 */
export function generateGeometry(type: ShapeType, count: number): Float32Array {
  let base: Float32Array;
  switch (type) {
    case 'sphere':    base = generateSphere(count); break;
    case 'heart':     base = generateHeart(count); break;
    case 'flower':    base = generateFlower(count); break;
    case 'saturn':    base = generateSaturn(count); break;
    case 'buddha':    base = generateBuddha(count); break;
    case 'fireworks': base = generateFireworks(count); break;
    case 'cluster':   base = generateCluster(count); break;
    default:          base = generateSphere(count); break;
  }

  // Multiply by TRAIL_LENGTH: each real particle gets trailing copies
  const totalVerts = count * TRAIL_LENGTH;
  const expanded = new Float32Array(totalVerts * 3);

  for (let i = 0; i < count; i++) {
    const bx = base[i * 3];
    const by = base[i * 3 + 1];
    const bz = base[i * 3 + 2];
    for (let t = 0; t < TRAIL_LENGTH; t++) {
      const idx = (i * TRAIL_LENGTH + t) * 3;
      expanded[idx]     = bx;
      expanded[idx + 1] = by;
      expanded[idx + 2] = bz;
    }
  }

  return expanded;
}

/**
 * Generate target positions (same layout as generateGeometry, for morphing).
 */
export function generateTargetPositions(type: ShapeType, count: number): Float32Array {
  return generateGeometry(type, count);
}

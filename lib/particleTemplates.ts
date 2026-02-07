import * as THREE from 'three';

export interface ParticleTemplate {
  id: string;
  name: string;
  icon: string;
  generate: (count: number, scale: number) => Float32Array;
}

// Helper: generate random point on surface of shape with some volume scatter
function jitter(v: number, amount: number): number {
  return v + (Math.random() - 0.5) * amount;
}

// Heart shape (parametric 3D heart)
function generateHeart(count: number, scale: number): Float32Array {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const t = Math.random() * Math.PI * 2;
    const s = Math.random() * Math.PI;
    const r = 0.3 + Math.random() * 0.7; // volume fill

    // Parametric heart
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    const z = (Math.random() - 0.5) * 8 * Math.sin(s);

    positions[i * 3] = jitter(x * 0.06 * scale * r, 0.15 * scale);
    positions[i * 3 + 1] = jitter(y * 0.06 * scale * r, 0.15 * scale);
    positions[i * 3 + 2] = jitter(z * 0.06 * scale * r, 0.15 * scale);
  }
  return positions;
}

// Flower shape (5-petal rose curve in 3D)
function generateFlower(count: number, scale: number): Float32Array {
  const positions = new Float32Array(count * 3);
  const petals = 5;

  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const r = Math.cos(petals * theta) * scale;
    const volumeR = Math.abs(r) * (0.3 + Math.random() * 0.7);
    const height = (Math.random() - 0.5) * scale * 0.5;

    positions[i * 3] = jitter(volumeR * Math.cos(theta), 0.1 * scale);
    positions[i * 3 + 1] = jitter(height, 0.1 * scale);
    positions[i * 3 + 2] = jitter(volumeR * Math.sin(theta), 0.1 * scale);
  }

  // Add stem particles
  const stemCount = Math.floor(count * 0.1);
  for (let i = 0; i < stemCount && i < count; i++) {
    const y = -Math.random() * scale * 1.5;
    positions[i * 3] = jitter(0, 0.05 * scale);
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = jitter(0, 0.05 * scale);
  }

  return positions;
}

// Saturn (sphere with ring)
function generateSaturn(count: number, scale: number): Float32Array {
  const positions = new Float32Array(count * 3);
  const planetCount = Math.floor(count * 0.45);
  const ringCount = count - planetCount;

  // Planet sphere
  for (let i = 0; i < planetCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = Math.pow(Math.random(), 0.33) * scale * 0.5;

    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.9; // slight oblate
    positions[i * 3 + 2] = r * Math.cos(phi);
  }

  // Ring
  for (let i = 0; i < ringCount; i++) {
    const idx = planetCount + i;
    const theta = Math.random() * Math.PI * 2;
    const r = scale * (0.7 + Math.random() * 0.6);

    positions[idx * 3] = r * Math.cos(theta);
    positions[idx * 3 + 1] = jitter(0, 0.03 * scale); // thin ring
    positions[idx * 3 + 2] = r * Math.sin(theta);
  }

  return positions;
}

// Buddha silhouette (stylized seated figure)
function generateBuddha(count: number, scale: number): Float32Array {
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const section = Math.random();
    let x: number, y: number, z: number;

    if (section < 0.2) {
      // Head (sphere at top)
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = Math.pow(Math.random(), 0.33) * scale * 0.22;
      x = r * Math.sin(phi) * Math.cos(theta);
      y = scale * 0.7 + r * Math.sin(phi) * Math.sin(theta);
      z = r * Math.cos(phi);
    } else if (section < 0.35) {
      // Ushnisha (bump on top of head)
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = Math.pow(Math.random(), 0.33) * scale * 0.1;
      x = r * Math.sin(phi) * Math.cos(theta);
      y = scale * 0.95 + r * Math.sin(phi) * Math.sin(theta);
      z = r * Math.cos(phi);
    } else if (section < 0.55) {
      // Body/torso (ellipsoid)
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = Math.pow(Math.random(), 0.33);
      x = r * Math.sin(phi) * Math.cos(theta) * scale * 0.35;
      y = scale * 0.35 + r * Math.sin(phi) * Math.sin(theta) * scale * 0.3;
      z = r * Math.cos(phi) * scale * 0.25;
    } else if (section < 0.75) {
      // Crossed legs base (wide ellipsoid)
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = Math.pow(Math.random(), 0.33);
      x = r * Math.sin(phi) * Math.cos(theta) * scale * 0.5;
      y = scale * -0.05 + r * Math.sin(phi) * Math.sin(theta) * scale * 0.15;
      z = r * Math.cos(phi) * scale * 0.3;
    } else if (section < 0.85) {
      // Left arm reaching to center (meditation pose)
      const t = Math.random();
      const armR = scale * 0.06;
      const theta = Math.random() * Math.PI * 2;
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
      // Halo/aura behind head
      const theta = Math.random() * Math.PI * 2;
      const r = scale * (0.3 + Math.random() * 0.15);
      x = r * Math.cos(theta);
      y = scale * 0.7 + r * Math.sin(theta) * 0.6;
      z = -scale * 0.15;
    }

    // Center the figure vertically
    positions[i * 3] = x;
    positions[i * 3 + 1] = y - scale * 0.3;
    positions[i * 3 + 2] = z;
  }

  return positions;
}

// Fireworks explosion
function generateFireworks(count: number, scale: number): Float32Array {
  const positions = new Float32Array(count * 3);
  const burstCount = 3 + Math.floor(Math.random() * 3); // 3-5 bursts
  const perBurst = Math.floor(count / burstCount);

  for (let b = 0; b < burstCount; b++) {
    // Random burst center
    const cx = (Math.random() - 0.5) * scale * 1.5;
    const cy = (Math.random() - 0.3) * scale * 1.2;
    const cz = (Math.random() - 0.5) * scale * 0.8;
    const burstRadius = scale * (0.3 + Math.random() * 0.5);

    for (let i = 0; i < perBurst; i++) {
      const idx = b * perBurst + i;
      if (idx >= count) break;

      // Trails radiating outward
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = Math.pow(Math.random(), 0.5) * burstRadius;

      positions[idx * 3] = cx + r * Math.sin(phi) * Math.cos(theta);
      positions[idx * 3 + 1] = cy + r * Math.sin(phi) * Math.sin(theta);
      positions[idx * 3 + 2] = cz + r * Math.cos(phi);
    }
  }

  // Fill remaining particles as trailing sparks
  for (let i = burstCount * perBurst; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * scale * 0.3;
    positions[i * 3 + 1] = -scale * 0.5 + Math.random() * scale * 0.3;
    positions[i * 3 + 2] = (Math.random() - 0.5) * scale * 0.3;
  }

  return positions;
}

// Star shape (5-pointed 3D star)
function generateStar(count: number, scale: number): Float32Array {
  const positions = new Float32Array(count * 3);
  const points = 5;

  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const pointAngle = (Math.PI * 2) / points;
    const nearestPoint = Math.round(theta / pointAngle) * pointAngle;
    const angleDiff = Math.abs(theta - nearestPoint);

    // Modulate radius based on angle (star shape)
    const outerR = scale;
    const innerR = scale * 0.4;
    const blend = Math.pow(Math.cos(angleDiff * points), 2);
    const r = (innerR + (outerR - innerR) * blend) * (0.3 + Math.random() * 0.7);

    const depth = (Math.random() - 0.5) * scale * 0.4;

    positions[i * 3] = r * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(theta);
    positions[i * 3 + 2] = depth;
  }

  return positions;
}

// Galaxy spiral
function generateGalaxy(count: number, scale: number): Float32Array {
  const positions = new Float32Array(count * 3);
  const arms = 3;
  const coreCount = Math.floor(count * 0.25);

  // Core
  for (let i = 0; i < coreCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = Math.pow(Math.random(), 0.5) * scale * 0.2;

    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.3; // flattened
    positions[i * 3 + 2] = r * Math.cos(phi);
  }

  // Spiral arms
  for (let i = coreCount; i < count; i++) {
    const arm = Math.floor(Math.random() * arms);
    const armOffset = (arm / arms) * Math.PI * 2;
    const t = Math.pow(Math.random(), 0.7);
    const r = t * scale;
    const theta = armOffset + t * Math.PI * 2.5; // spiral winding
    const spread = 0.15 * scale * t; // spread increases with distance

    positions[i * 3] = r * Math.cos(theta) + jitter(0, spread);
    positions[i * 3 + 1] = jitter(0, 0.05 * scale * (1 - t * 0.5));
    positions[i * 3 + 2] = r * Math.sin(theta) + jitter(0, spread);
  }

  return positions;
}

// DNA double helix
function generateDNA(count: number, scale: number): Float32Array {
  const positions = new Float32Array(count * 3);
  const helixCount = Math.floor(count * 0.7);
  const connectorCount = count - helixCount;

  for (let i = 0; i < helixCount; i++) {
    const strand = i % 2;
    const t = (i / helixCount) * Math.PI * 6; // number of twists
    const y = ((i / helixCount) - 0.5) * scale * 2;
    const r = scale * 0.3;
    const offset = strand * Math.PI;

    positions[i * 3] = jitter(r * Math.cos(t + offset), 0.05 * scale);
    positions[i * 3 + 1] = jitter(y, 0.03 * scale);
    positions[i * 3 + 2] = jitter(r * Math.sin(t + offset), 0.05 * scale);
  }

  // Connectors between strands
  for (let i = 0; i < connectorCount; i++) {
    const idx = helixCount + i;
    const t = (i / connectorCount) * Math.PI * 6;
    const y = ((i / connectorCount) - 0.5) * scale * 2;
    const lerp = Math.random();
    const r = scale * 0.3;

    const x1 = r * Math.cos(t);
    const z1 = r * Math.sin(t);
    const x2 = r * Math.cos(t + Math.PI);
    const z2 = r * Math.sin(t + Math.PI);

    positions[idx * 3] = x1 + (x2 - x1) * lerp;
    positions[idx * 3 + 1] = jitter(y, 0.02 * scale);
    positions[idx * 3 + 2] = z1 + (z2 - z1) * lerp;
  }

  return positions;
}

// Cosmos cluster (matches original GlobularClusterVisualization distribution)
function generateCosmos(count: number, scale: number): Float32Array {
  const CORE_RADIUS = scale;
  const HALO_RADIUS = scale * 3;
  const positions = new Float32Array(count * 3);
  const coreCount = Math.floor(count * 0.2);

  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    let r: number;

    if (i < coreCount) {
      r = Math.pow(Math.random(), 0.5) * CORE_RADIUS;
    } else {
      r = CORE_RADIUS + Math.pow(Math.random(), 1.2) * (HALO_RADIUS - CORE_RADIUS);
    }

    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }

  return positions;
}

export const PARTICLE_TEMPLATES: ParticleTemplate[] = [
  { id: 'cosmos', name: 'Cosmos', icon: '✦', generate: generateCosmos },
  { id: 'heart', name: 'Hart', icon: '♥', generate: generateHeart },
  { id: 'saturn', name: 'Saturnus', icon: '♄', generate: generateSaturn },
  { id: 'dna', name: 'DNA', icon: '⧬', generate: generateDNA },
];

export const PRESET_COLORS = [
  { name: 'Cosmos Goud', hex: '#FFD700', rgb: [1.0, 0.84, 0.0] },
  { name: 'Nebula Blauw', hex: '#4A90D9', rgb: [0.29, 0.56, 0.85] },
  { name: 'Aurora Groen', hex: '#00E676', rgb: [0.0, 0.9, 0.46] },
  { name: 'Supernova Rood', hex: '#FF4444', rgb: [1.0, 0.27, 0.27] },
  { name: 'Plasma Paars', hex: '#B388FF', rgb: [0.7, 0.53, 1.0] },
  { name: 'Zon Oranje', hex: '#FF9100', rgb: [1.0, 0.57, 0.0] },
  { name: 'Ster Wit', hex: '#E8E8FF', rgb: [0.91, 0.91, 1.0] },
  { name: 'Roze Nevel', hex: '#FF69B4', rgb: [1.0, 0.41, 0.71] },
];

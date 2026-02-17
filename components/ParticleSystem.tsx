'use client';

import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ShapeType } from '../types';
import { generateGeometry, TRAIL_LENGTH } from '../utils/geometryFactory';

interface ParticleSystemProps {
  shape: ShapeType;
  colors: [number, number, number][];  // array of [r,g,b] normalized
  particleCount: number;
  tension: number;      // visual tension: 0 = contracted, 1 = expanded
  explosion: number;    // 0-1 explosion intensity
}

// Simplex noise GLSL implementation (Ashima Arts)
const SIMPLEX_NOISE_GLSL = `
// Simplex 3D Noise - Ashima Arts
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
`;

const vertexShader = `
${SIMPLEX_NOISE_GLSL}

attribute vec3 targetPos;
attribute float randomness;
attribute float pScale;
attribute float trailIdx;
attribute vec3 particleColor;

uniform float uTime;
uniform float uTension;      // visual tension: 0 = contracted, 1 = expanded
uniform float uExplosion;
uniform float uMorph;        // 0-1 morph progress to new shape

varying float vTrailIdx;
varying float vAlpha;
varying vec3 vColor;

void main() {
  // Morph toward target position
  vec3 pos = mix(position, targetPos, uMorph);

  // Trail lag: older trail segments lag behind
  float trailLag = trailIdx / ${TRAIL_LENGTH.toFixed(1)};
  pos = mix(pos, position, trailLag * 0.3);

  // Breathing effect - strong cosmic pulse
  float breathe = sin(uTime * 0.5 + randomness * 6.28) * 0.3;

  // Simplex noise turbulence - dramatic
  float noiseScale = 0.4 + uTension * 1.2;
  vec3 noisePos = pos * 0.15 + vec3(uTime * 0.12);
  float nx = snoise(noisePos) * noiseScale;
  float ny = snoise(noisePos + vec3(100.0)) * noiseScale;
  float nz = snoise(noisePos + vec3(200.0)) * noiseScale;

  // Visual tension controls expansion/contraction - extreme range
  // uTension = 1 means expanded (open hand), uTension = 0 means contracted (fist)
  float scaleFactor = 0.15 + uTension * 3.0; // 0.15 (tiny ball) to 3.15 (huge cosmos)
  pos *= scaleFactor;

  // Add noise displacement (scales with tension for more chaos when expanded)
  pos += vec3(nx, ny, nz) * (0.5 + uTension * 1.5);

  // Breathing scales with expansion
  pos *= 1.0 + breathe * (0.3 + uTension * 0.7);

  // Gravity pull when contracted (fist pulls particles down)
  float gravity = (1.0 - uTension) * 0.8;
  pos.y -= gravity;

  // Swirl effect that intensifies with tension
  float swirlAngle = uTime * 0.3 * uTension;
  float cosA = cos(swirlAngle * 0.1);
  float sinA = sin(swirlAngle * 0.1);
  vec3 swirlPos = vec3(
    pos.x * cosA - pos.z * sinA,
    pos.y,
    pos.x * sinA + pos.z * cosA
  );
  pos = mix(pos, swirlPos, uTension * 0.3);

  // Explosion: real blast — particles fly everywhere
  if (uExplosion > 0.01) {
    float power = uExplosion * uExplosion;

    // Radial outward force
    vec3 dir = normalize(pos + vec3(0.001));
    float dist = length(pos);
    pos += dir * power * (50.0 + randomness * 80.0) * (1.0 + dist * 0.6);

    // Random scatter: each particle gets a unique chaotic direction
    vec3 scatterSeed = pos * 0.3 + vec3(randomness * 100.0);
    pos += vec3(
      snoise(scatterSeed) * power * 30.0,
      snoise(scatterSeed + vec3(37.0)) * power * 30.0,
      snoise(scatterSeed + vec3(71.0)) * power * 30.0
    );

    // Extra upward burst for some particles (like debris flying up)
    pos.y += power * randomness * 20.0;
  }

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

  // Point size: dramatic range, flash bigger during explosion
  float explosionSize = 1.0 + uExplosion * 3.0;
  float baseSize = pScale * (3.0 + uTension * 3.0) * explosionSize;
  float trailFade = 1.0 - trailLag * 0.6;
  gl_PointSize = baseSize * trailFade * (350.0 / -mvPosition.z);

  gl_Position = projectionMatrix * mvPosition;

  // Pass to fragment - brighter when expanded, flash white during explosion
  vTrailIdx = trailIdx;
  float explosionBright = min(1.0, uExplosion * 2.0);
  vAlpha = trailFade * (0.5 + uTension * 0.5 + explosionBright * 0.5);
  vColor = mix(particleColor, vec3(1.0), explosionBright * 0.6);
}
`;

const fragmentShader = `
varying float vTrailIdx;
varying float vAlpha;
varying vec3 vColor;

void main() {
  // Circular point with soft glow
  vec2 center = gl_PointCoord - vec2(0.5);
  float dist = length(center);

  if (dist > 0.5) discard;

  // Soft glow: hot center fading to color at edges
  float glow = 1.0 - smoothstep(0.0, 0.5, dist);
  float coreBright = smoothstep(0.3, 0.0, dist);

  // Hot center (white/luminous) blending to particle color at edges
  vec3 coreColor = vec3(1.0, 1.0, 1.0);
  vec3 color = mix(vColor, coreColor, coreBright * 0.7);

  // Trail fade
  float trailAlpha = 1.0 - vTrailIdx / ${TRAIL_LENGTH.toFixed(1)};
  float alpha = glow * vAlpha * trailAlpha;

  gl_FragColor = vec4(color, alpha);
}
`;

export default function ParticleSystem({
  shape,
  colors,
  particleCount,
  tension,
  explosion,
}: ParticleSystemProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const prevShapeRef = useRef<ShapeType>(shape);
  const morphRef = useRef(1.0);

  // Generate initial geometry with attributes
  const { positions, targetPositions, randomness, pScale, trailIdx, particleColors } = useMemo(() => {
    const totalVerts = particleCount * TRAIL_LENGTH;
    const pos = generateGeometry(shape, particleCount);
    const target = new Float32Array(pos);
    const rand = new Float32Array(totalVerts);
    const scale = new Float32Array(totalVerts);
    const trail = new Float32Array(totalVerts);
    const pColors = new Float32Array(totalVerts * 3);

    for (let i = 0; i < particleCount; i++) {
      const randVal = Math.random();
      // More dramatic size variation: tiny background stars to bright large ones
      const sizeRoll = Math.random();
      const scaleVal = sizeRoll < 0.6 ? 0.1 + Math.random() * 0.3
                     : sizeRoll < 0.9 ? 0.3 + Math.random() * 0.5
                     : 0.6 + Math.random() * 0.8;

      // Pick a random color from the palette
      const col = colors[Math.floor(Math.random() * colors.length)];

      for (let t = 0; t < TRAIL_LENGTH; t++) {
        const idx = i * TRAIL_LENGTH + t;
        rand[idx] = randVal;
        scale[idx] = scaleVal;
        trail[idx] = t;
        pColors[idx * 3]     = col[0];
        pColors[idx * 3 + 1] = col[1];
        pColors[idx * 3 + 2] = col[2];
      }
    }

    return {
      positions: pos,
      targetPositions: target,
      randomness: rand,
      pScale: scale,
      trailIdx: trail,
      particleColors: pColors,
    };
  }, [particleCount, colors]);

  // Handle shape changes: update target positions and trigger morph
  useEffect(() => {
    if (shape !== prevShapeRef.current) {
      prevShapeRef.current = shape;
      morphRef.current = 0;

      if (pointsRef.current) {
        const newTarget = generateGeometry(shape, particleCount);
        const geom = pointsRef.current.geometry;
        geom.setAttribute('targetPos', new THREE.BufferAttribute(newTarget, 3));
      }
    }
  }, [shape, particleCount]);

  // Animation loop
  useFrame((state) => {
    if (!materialRef.current) return;

    const t = state.clock.elapsedTime;

    // Morph progress
    if (morphRef.current < 1.0) {
      morphRef.current = Math.min(1.0, morphRef.current + 0.02);
    }

    materialRef.current.uniforms.uTime.value = t;
    materialRef.current.uniforms.uTension.value = tension;
    materialRef.current.uniforms.uExplosion.value = explosion;
    materialRef.current.uniforms.uMorph.value = morphRef.current;
  });

  const totalVerts = particleCount * TRAIL_LENGTH;

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-targetPos"
          args={[targetPositions, 3]}
        />
        <bufferAttribute
          attach="attributes-randomness"
          args={[randomness, 1]}
        />
        <bufferAttribute
          attach="attributes-pScale"
          args={[pScale, 1]}
        />
        <bufferAttribute
          attach="attributes-trailIdx"
          args={[trailIdx, 1]}
        />
        <bufferAttribute
          attach="attributes-particleColor"
          args={[particleColors, 3]}
        />
      </bufferGeometry>
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={{
          uTime: { value: 0 },
          uTension: { value: 0.5 },
          uExplosion: { value: 0 },
          uMorph: { value: 1.0 },
        }}
      />
    </points>
  );
}

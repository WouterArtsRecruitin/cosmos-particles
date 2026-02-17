'use client';

import React, { useRef, useCallback, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import ParticleSystem from './ParticleSystem';
import HandTracker from './HandTracker';
import { HandStats } from '../types';
import * as THREE from 'three';

const PARTICLE_COUNT = 55000;

// Cosmic color palette: hot blue stars, white dwarfs, sun-like yellow,
// red giants, nebula purple/cyan — each as normalized [r,g,b]
const PALETTE: [number, number, number][] = [
  '#9BB0FF', // hot blue-white
  '#AABFFF', // blue-white
  '#FFFFFF', // white dwarf
  '#FFD700', // sun gold
  '#FFCC6F', // warm yellow
  '#FF8C42', // orange giant
  '#FF4444', // red giant
  '#B388FF', // nebula purple
  '#00E5FF', // nebula cyan
].map(hex => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b] as [number, number, number];
});

// Shared mutable values — written by hand tracker, read by shader.
// Bypasses React state entirely so there's zero render latency.
export interface ShaderValues {
  tension: number;   // visual tension: 0 = contracted (fist), 1 = expanded (open)
  explosion: number; // 0-1 explosion intensity
}

export default function ZenParticles() {
  // Direct ref: hand tracker writes, shader reads — no React state involved
  const shaderValues = useRef<ShaderValues>({ tension: 0.5, explosion: 0 });

  const explosionDecayRef = useRef(0);
  const rawTensionRef = useRef(0);
  const recentLowRef = useRef(1);
  const explosionCooldownRef = useRef(0);

  const handleHandUpdate = useCallback((stats: HandStats) => {
    const t = stats.tension;
    rawTensionRef.current = t;

    // Write visual tension directly (inverted: open hand = 1, fist = 0)
    shaderValues.current.tension = 1 - t;

    const low = recentLowRef.current;

    // Track recent low: drops instantly with hand, drifts up slowly
    if (t < low) {
      recentLowRef.current = t;
    } else {
      recentLowRef.current = low + (t - low) * 0.03;
    }

    // Cooldown timer (decrements each frame)
    if (explosionCooldownRef.current > 0) {
      explosionCooldownRef.current--;
    }

    // Fist explosion: detect open-hand → fist transition
    const delta = t - recentLowRef.current;
    if (
      explosionCooldownRef.current === 0 &&
      recentLowRef.current < 0.35 &&
      t > 0.4 &&
      delta > 0.2
    ) {
      explosionDecayRef.current = 1.0;
      shaderValues.current.explosion = 1.0;
      recentLowRef.current = t;
      explosionCooldownRef.current = 30;
    }
  }, []);

  // Explosion decay loop — writes directly to shaderValues ref
  useEffect(() => {
    let frame: number;
    const decay = () => {
      if (explosionDecayRef.current > 0.01) {
        const openness = 1 - rawTensionRef.current;
        const rate = 0.98 - openness * 0.10;
        explosionDecayRef.current *= rate;
        shaderValues.current.explosion = explosionDecayRef.current;
      } else if (explosionDecayRef.current > 0) {
        explosionDecayRef.current = 0;
        shaderValues.current.explosion = 0;
      }
      frame = requestAnimationFrame(decay);
    };
    frame = requestAnimationFrame(decay);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="w-screen h-screen bg-gradient-to-b from-gray-950 via-black to-gray-950 overflow-hidden">
      {/* Three.js Canvas */}
      <Canvas
        camera={{ position: [0, 0, 30], fov: 60 }}
        gl={{ antialias: true, alpha: true }}
        style={{ position: 'absolute', top: 0, left: 0 }}
      >
        <ambientLight intensity={0.3} />
        <ParticleSystem
          shape="cluster"
          colors={PALETTE}
          particleCount={PARTICLE_COUNT}
          shaderValues={shaderValues}
        />
        <OrbitControls
          enablePan={false}
          enableZoom={true}
          enableRotate={true}
          autoRotate
          autoRotateSpeed={0.5}
          minDistance={10}
          maxDistance={80}
        />
      </Canvas>

      {/* Hand tracker with camera preview */}
      <HandTracker onUpdate={handleHandUpdate} />
    </div>
  );
}

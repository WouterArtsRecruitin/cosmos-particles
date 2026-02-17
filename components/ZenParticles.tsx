'use client';

import React, { useRef, useCallback, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import ParticleSystem from './ParticleSystem';
import HandTracker from './HandTracker';
import { HandStats } from '../types';
import { shaderState } from '../utils/shaderState';
import * as THREE from 'three';

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

function isMobile(): boolean {
  if (typeof window === 'undefined') return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

export default function ZenParticles() {
  const [particleCount] = useState(() => isMobile() ? 15000 : 55000);

  const explosionDecayRef = useRef(0);
  const rawTensionRef = useRef(0);
  const recentLowRef = useRef(1);
  const explosionCooldownRef = useRef(0);

  const handleHandUpdate = useCallback((stats: HandStats) => {
    const t = stats.tension;
    rawTensionRef.current = t;

    // Write visual tension directly to module-level state (no React)
    shaderState.tension = 1 - t;

    const low = recentLowRef.current;

    // Track recent low: drops instantly with hand, drifts up slowly
    if (t < low) {
      recentLowRef.current = t;
    } else {
      recentLowRef.current = low + (t - low) * 0.03;
    }

    // Cooldown timer
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
      shaderState.explosion = 1.0;
      recentLowRef.current = t;
      explosionCooldownRef.current = 30;
    }
  }, []);

  // Explosion decay loop — writes directly to module-level shaderState
  useEffect(() => {
    let frame: number;
    const decay = () => {
      if (explosionDecayRef.current > 0.01) {
        const openness = 1 - rawTensionRef.current;
        const rate = 0.98 - openness * 0.10;
        explosionDecayRef.current *= rate;
        shaderState.explosion = explosionDecayRef.current;
      } else if (explosionDecayRef.current > 0) {
        explosionDecayRef.current = 0;
        shaderState.explosion = 0;
      }
      frame = requestAnimationFrame(decay);
    };
    frame = requestAnimationFrame(decay);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="w-screen h-screen bg-gradient-to-b from-gray-950 via-black to-gray-950 overflow-hidden" style={{ touchAction: 'none' }}>
      {/* Three.js Canvas */}
      <Canvas
        camera={{ position: [0, 0, 30], fov: 60 }}
        gl={{ antialias: !isMobile(), alpha: true }}
        dpr={isMobile() ? 1 : undefined}
        style={{ position: 'absolute', top: 0, left: 0 }}
      >
        <ambientLight intensity={0.3} />
        <ParticleSystem
          shape="cluster"
          colors={PALETTE}
          particleCount={particleCount}
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

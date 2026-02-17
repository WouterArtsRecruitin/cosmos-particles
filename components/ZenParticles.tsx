'use client';

import React, { useRef, useCallback, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import ParticleSystem from './ParticleSystem';
import HandTracker from './HandTracker';
import { HandStats } from '../types';
import { shaderState } from '../utils/shaderState';

// Realistic 15-type stellar classification colors (normalized RGB)
const PALETTE: [number, number, number][] = [
  [0.62, 0.73, 0.95],  // O-class blue giant
  [0.55, 0.68, 0.92],  // B-class bright blue
  [0.58, 0.62, 0.72],  // faint blue (old star)
  [0.70, 0.72, 0.75],  // neutral gray
  [0.92, 0.89, 0.75],  // warm white (A-class)
  [0.88, 0.87, 0.78],  // F-class main sequence
  [0.96, 0.91, 0.68],  // G-class pale yellow (sun-like)
  [0.85, 0.78, 0.58],  // dim yellow
  [0.82, 0.68, 0.52],  // faded orange
  [0.92, 0.78, 0.58],  // K-class pale orange
  [0.95, 0.72, 0.45],  // deep orange
  [0.98, 0.65, 0.35],  // amber giant
  [0.92, 0.52, 0.38],  // M-class red dwarf
  [0.85, 0.45, 0.35],  // deep red
  [0.78, 0.38, 0.32],  // dark red (coolest stars)
];

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

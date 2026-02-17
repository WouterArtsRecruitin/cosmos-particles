'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
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

export default function ZenParticles() {
  const [tension, setTension] = useState(0);
  const [explosion, setExplosion] = useState(0);

  const explosionDecayRef = useRef<number>(0);
  // Tracks the lowest recent tension (open hand state)
  // Follows tension downward instantly, drifts upward slowly
  const recentLowRef = useRef(1);
  const explosionCooldownRef = useRef(0);

  // Visual tension = inverted hand tension
  // Open hand (low hand tension) → high visual tension (expansion)
  // Closed fist (high hand tension) → low visual tension (contraction)
  const visualTension = 1 - tension;

  const handleHandUpdate = useCallback((stats: HandStats) => {
    setTension(stats.tension);

    const t = stats.tension;
    const low = recentLowRef.current;

    // Track recent low: drops instantly with hand, drifts up slowly
    if (t < low) {
      recentLowRef.current = t;
    } else {
      recentLowRef.current = low + (t - low) * 0.02;
    }

    // Cooldown timer (decrements each frame)
    if (explosionCooldownRef.current > 0) {
      explosionCooldownRef.current--;
    }

    // Fist explosion: recent low was open hand, now making a fist
    if (
      explosionCooldownRef.current === 0 &&
      recentLowRef.current < 0.3 &&
      t > 0.55
    ) {
      setExplosion(1.0);
      explosionDecayRef.current = 1.0;
      recentLowRef.current = t; // reset so it doesn't re-trigger
      explosionCooldownRef.current = 30; // ~0.5s cooldown at 60fps
    }
  }, []);

  // Explosion decay
  useEffect(() => {
    let frame: number;
    const decay = () => {
      if (explosionDecayRef.current > 0.01) {
        explosionDecayRef.current *= 0.95;
        setExplosion(explosionDecayRef.current);
      } else if (explosionDecayRef.current > 0) {
        explosionDecayRef.current = 0;
        setExplosion(0);
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
          tension={visualTension}
          explosion={explosion}
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

'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import ParticleSystem from './ParticleSystem';
import HandTracker from './HandTracker';
import { HandStats } from '../types';

const PARTICLE_COUNT = 55000;
const COLOR = '#FFD700';

export default function ZenParticles() {
  const [tension, setTension] = useState(0);
  const [explosion, setExplosion] = useState(0);

  const prevTensionRef = useRef(0);
  const explosionDecayRef = useRef<number>(0);

  // Visual tension = inverted hand tension
  // Open hand (low hand tension) → high visual tension (expansion)
  // Closed fist (high hand tension) → low visual tension (contraction)
  const visualTension = 1 - tension;

  const handleHandUpdate = useCallback((stats: HandStats) => {
    setTension(stats.tension);

    // Clap detection: rapid tension spike
    const prevT = prevTensionRef.current;
    if (prevT < 0.3 && stats.tension > 0.7) {
      setExplosion(1.0);
      explosionDecayRef.current = 1.0;
    }
    prevTensionRef.current = stats.tension;
  }, []);

  // Explosion decay
  useEffect(() => {
    let frame: number;
    const decay = () => {
      if (explosionDecayRef.current > 0.01) {
        explosionDecayRef.current *= 0.92;
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
          shape="sphere"
          color={COLOR}
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

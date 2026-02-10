'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import ParticleSystem from './ParticleSystem';
import HandTracker from './HandTracker';
import Controls from './Controls';
import { ShapeType, HandStats } from '../types';

const SESSION_KEY = 'zen-particles-session';
const PARTICLE_COUNT = 55000;

interface SavedSession {
  shape: ShapeType;
  color: string;
}

function loadSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data && typeof data.shape === 'string' && typeof data.color === 'string') {
      return data as SavedSession;
    }
  } catch {}
  return null;
}

function saveSession(session: SavedSession) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {}
}

export default function ZenParticles() {
  const saved = useRef(loadSession()).current;
  const [shape, setShape] = useState<ShapeType>(saved?.shape || 'sphere');
  const [color, setColor] = useState(saved?.color || '#FFD700');
  const [tension, setTension] = useState(0);
  const [explosion, setExplosion] = useState(0);

  // For clap detection
  const prevTensionRef = useRef(0);
  const explosionDecayRef = useRef<number>(0);

  // Visual tension = inverted hand tension
  // Open hand (low hand tension) → high visual tension (expansion)
  // Closed fist (high hand tension) → low visual tension (contraction)
  const visualTension = 1 - tension;

  const handleShapeChange = useCallback((s: ShapeType) => {
    setShape(s);
    saveSession({ shape: s, color });
  }, [color]);

  const handleColorChange = useCallback((c: string) => {
    setColor(c);
    saveSession({ shape, color: c });
  }, [shape]);

  const handleHandUpdate = useCallback((stats: HandStats) => {
    setTension(stats.tension);

    // Clap detection: rapid tension spike
    const prevT = prevTensionRef.current;
    if (prevT < 0.35 && stats.tension > 0.8) {
      // Trigger explosion
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
      {/* Title */}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 text-center pointer-events-none">
        <h1 className="text-3xl font-bold tracking-[0.3em] text-white/80 mb-1">
          ZEN PARTICLES
        </h1>
        <p className="text-sm text-white/40 tracking-wider">
          Open hand to expand &middot; Fist to contract &middot; Clap to explode
        </p>
      </div>

      {/* Three.js Canvas */}
      <Canvas
        camera={{ position: [0, 0, 20], fov: 60 }}
        gl={{ antialias: true, alpha: true }}
        style={{ position: 'absolute', top: 0, left: 0 }}
      >
        <ambientLight intensity={0.3} />
        <ParticleSystem
          shape={shape}
          color={color}
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
          minDistance={5}
          maxDistance={50}
        />
      </Canvas>

      {/* Hand tracker with camera preview */}
      <HandTracker onUpdate={handleHandUpdate} />

      {/* Controls panel */}
      <Controls
        shape={shape}
        color={color}
        tension={tension}
        onShapeChange={handleShapeChange}
        onColorChange={handleColorChange}
      />
    </div>
  );
}

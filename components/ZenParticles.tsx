'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
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

// Inner scene component: runs inside Canvas and uses useFrame to
// move/rotate the cluster directly based on hand position and tilt.
interface CosmosSceneProps {
  handRef: React.MutableRefObject<HandStats>;
  shape: ShapeType;
  color: string;
  particleCount: number;
  tension: number;
  explosion: number;
}

function CosmosScene({ handRef, shape, color, particleCount, tension, explosion }: CosmosSceneProps) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    if (!groupRef.current) return;
    const hand = handRef.current;

    if (hand.handsDetected > 0) {
      // centerX from MediaPipe is raw (unmirrored): 0 = camera-left = user's right
      // Negate so user moving hand right → cluster moves right on screen
      const targetX = (0.5 - hand.centerX) * 40; // -20 to +20
      // centerY: 0 = top, 1 = bottom → invert for natural feel
      const targetY = (0.5 - hand.centerY) * 30; // +15 to -15

      // Smooth follow — 0.12 = snappy but not jittery
      groupRef.current.position.x += (targetX - groupRef.current.position.x) * 0.12;
      groupRef.current.position.y += (targetY - groupRef.current.position.y) * 0.12;

      // Hand tilt → cluster Y rotation
      const targetRotY = hand.rotation * Math.PI * 0.6;
      groupRef.current.rotation.y += (targetRotY - groupRef.current.rotation.y) * 0.08;
    } else {
      // No hand detected: drift back to center
      groupRef.current.position.x *= 0.95;
      groupRef.current.position.y *= 0.95;
      groupRef.current.rotation.y *= 0.97;
    }
  });

  return (
    <group ref={groupRef}>
      <ParticleSystem
        shape={shape}
        color={color}
        particleCount={particleCount}
        tension={tension}
        explosion={explosion}
      />
    </group>
  );
}

export default function ZenParticles() {
  const saved = useRef(loadSession()).current;
  const [shape, setShape] = useState<ShapeType>(saved?.shape || 'globular');
  const [color, setColor] = useState(saved?.color || '#FFD700');
  const [tension, setTension] = useState(0);
  const [explosion, setExplosion] = useState(0);

  // Ref updated on every MediaPipe frame — read by CosmosScene's useFrame
  const handRef = useRef<HandStats>({
    tension: 0,
    handsDetected: 0,
    centerX: 0.5,
    centerY: 0.5,
    rotation: 0,
  });

  const prevTensionRef = useRef(0);
  const explosionDecayRef = useRef<number>(0);

  // Open hand = high visual tension (expanded), fist = contracted
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
    // Write to ref so CosmosScene's useFrame can read without React delay
    handRef.current = stats;
    setTension(stats.tension);

    // Clap detection: rapid tension spike (open → closed)
    const prevT = prevTensionRef.current;
    if (prevT < 0.35 && stats.tension > 0.8) {
      setExplosion(1.0);
      explosionDecayRef.current = 1.0;
    }
    prevTensionRef.current = stats.tension;
  }, []);

  // Explosion decay loop
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
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 text-center">
        <h1 className="text-3xl font-bold tracking-[0.3em] text-white/80 mb-1 pointer-events-none">
          COSMOS
        </h1>
        <p className="text-sm text-white/40 tracking-wider pointer-events-none">
          Beweeg hand → cluster volgt &middot; Open = uitdijen &middot; Vuist = samentrekken &middot; Kantel = draaien &middot; Klap = explosie
        </p>
        <div className="mt-3 flex gap-3 justify-center">
          <a
            href="/data-explosion"
            className="px-4 py-1.5 text-xs tracking-widest uppercase text-cyan-400/70 border border-cyan-400/20 rounded-full hover:text-cyan-300 hover:border-cyan-400/50 hover:bg-cyan-400/5 transition-all duration-300"
          >
            Data Explosion
          </a>
          <a
            href="/mobile-sphere"
            className="px-4 py-1.5 text-xs tracking-widest uppercase text-cyan-400/70 border border-cyan-400/20 rounded-full hover:text-cyan-300 hover:border-cyan-400/50 hover:bg-cyan-400/5 transition-all duration-300"
          >
            Mobile Sphere
          </a>
        </div>
      </div>

      {/* Three.js Canvas */}
      <Canvas
        camera={{ position: [0, 0, 30], fov: 60 }}
        gl={{ antialias: true, alpha: true }}
        style={{ position: 'absolute', top: 0, left: 0 }}
      >
        <ambientLight intensity={0.3} />
        <CosmosScene
          handRef={handRef}
          shape={shape}
          color={color}
          particleCount={PARTICLE_COUNT}
          tension={visualTension}
          explosion={explosion}
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

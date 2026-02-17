'use client';

export type ShapeType = 'sphere' | 'heart' | 'flower' | 'saturn' | 'buddha' | 'fireworks' | 'cluster';

export interface HandStats {
  tension: number;        // 0.0 = open hand, 1.0 = closed fist
  handsDetected: number;
  centerX: number;        // normalized 0-1
  centerY: number;        // normalized 0-1
}

export interface ParticleProps {
  shape: ShapeType;
  color: string;
  particleCount: number;
  tension: number;        // visual tension (inverted from hand)
  explosion: number;      // 0-1 explosion intensity
}

export const SHAPES: { type: ShapeType; label: string }[] = [
  { type: 'sphere', label: 'Sphere' },
  { type: 'heart', label: 'Heart' },
  { type: 'flower', label: 'Flower' },
  { type: 'saturn', label: 'Saturn' },
  { type: 'buddha', label: 'Buddha' },
  { type: 'fireworks', label: 'Fireworks' },
];

export const PRESET_COLORS = [
  '#FFD700', // Gold
  '#4A90D9', // Blue
  '#00E676', // Green
  '#FF4444', // Red
  '#B388FF', // Purple
  '#FF9100', // Orange
  '#E8E8FF', // White
  '#FF69B4', // Pink
];

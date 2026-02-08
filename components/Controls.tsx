'use client';

import React from 'react';
import { ShapeType, SHAPES, PRESET_COLORS } from '../types';
import {
  Circle,
  Heart,
  Flower2,
  Orbit,
  User,
  Sparkles,
} from 'lucide-react';

interface ControlsProps {
  shape: ShapeType;
  color: string;
  tension: number;        // current hand tension 0-1
  onShapeChange: (shape: ShapeType) => void;
  onColorChange: (color: string) => void;
}

const SHAPE_ICONS: Record<ShapeType, React.ReactNode> = {
  sphere: <Circle size={18} />,
  heart: <Heart size={18} />,
  flower: <Flower2 size={18} />,
  saturn: <Orbit size={18} />,
  buddha: <User size={18} />,
  fireworks: <Sparkles size={18} />,
};

export default function Controls({
  shape,
  color,
  tension,
  onShapeChange,
  onColorChange,
}: ControlsProps) {
  // Tension bar color
  const tensionColor = tension < 0.35
    ? '#4ade80'   // green (relaxed)
    : tension < 0.65
    ? '#fbbf24'   // amber (medium)
    : '#ef4444';  // red (high tension)

  const tensionLabel = tension < 0.35
    ? 'Relaxed'
    : tension < 0.65
    ? 'Active'
    : 'Intense';

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div className="bg-black/30 backdrop-blur-xl border border-white/10 rounded-2xl px-6 py-4 shadow-2xl">
        {/* Shape selector */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-white/50 text-xs uppercase tracking-wider mr-2">Shape</span>
          {SHAPES.map(({ type, label }) => (
            <button
              key={type}
              onClick={() => onShapeChange(type)}
              className={`
                p-2 rounded-lg transition-all duration-300
                ${shape === type
                  ? 'bg-white/20 text-white shadow-lg shadow-white/10 scale-110'
                  : 'text-white/40 hover:text-white/70 hover:bg-white/5'
                }
              `}
              title={label}
            >
              {SHAPE_ICONS[type]}
            </button>
          ))}
        </div>

        {/* Color picker */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-white/50 text-xs uppercase tracking-wider mr-2">Color</span>
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => onColorChange(c)}
              className={`
                w-6 h-6 rounded-full transition-all duration-200 border-2
                ${color === c
                  ? 'border-white scale-125 shadow-lg'
                  : 'border-white/20 hover:border-white/50 hover:scale-110'
                }
              `}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        {/* Tension bar */}
        <div className="flex items-center gap-3">
          <span className="text-white/50 text-xs uppercase tracking-wider">Tension</span>
          <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-150"
              style={{
                width: `${tension * 100}%`,
                backgroundColor: tensionColor,
                boxShadow: `0 0 8px ${tensionColor}`,
              }}
            />
          </div>
          <span
            className="text-xs font-medium min-w-[60px] text-right"
            style={{ color: tensionColor }}
          >
            {tensionLabel}
          </span>
        </div>
      </div>
    </div>
  );
}

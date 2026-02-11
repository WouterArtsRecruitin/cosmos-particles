'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { HandStats } from '../types';

interface HandTrackerProps {
  onUpdate: (stats: HandStats) => void;
}

// Hand skeleton connections for drawing overlay
const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

// Fingertip colors
const FINGERTIP_COLORS: Record<number, string> = {
  4: '#00ffff',
  8: '#ff00ff',
  12: '#ffff00',
  16: '#00ff80',
  20: '#ff4444',
};

export default function HandTracker({ onUpdate }: HandTrackerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const handLandmarkerRef = useRef<any>(null);
  const animFrameRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

  // Use refs for the callback so the detection loop always has the latest version
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const smoothedRef = useRef({
    tension: 0,
    centerX: 0.5,
    centerY: 0.5,
  });

  function calculateTension(landmarks: any[]): number {
    const wrist = landmarks[0];
    const fingerTips = [4, 8, 12, 16, 20];
    const fingerBases = [2, 5, 9, 13, 17];

    const middleMcp = landmarks[9];
    const palmSize = Math.sqrt(
      (middleMcp.x - wrist.x) ** 2 +
      (middleMcp.y - wrist.y) ** 2 +
      (middleMcp.z - wrist.z) ** 2
    );

    if (palmSize < 0.001) return 0;

    let totalOpenness = 0;
    for (let i = 0; i < fingerTips.length; i++) {
      const tip = landmarks[fingerTips[i]];
      const base = landmarks[fingerBases[i]];
      const tipDist = Math.sqrt(
        (tip.x - wrist.x) ** 2 + (tip.y - wrist.y) ** 2 + (tip.z - wrist.z) ** 2
      );
      const baseDist = Math.sqrt(
        (base.x - wrist.x) ** 2 + (base.y - wrist.y) ** 2 + (base.z - wrist.z) ** 2
      );
      const ratio = baseDist > 0 ? tipDist / baseDist : 0;
      const openness = Math.max(0, Math.min(1, (ratio - 1.0) / 1.0));
      totalOpenness += openness;
    }

    const avgOpenness = totalOpenness / fingerTips.length;
    return Math.max(0, Math.min(1, 1 - avgOpenness));
  }

  function drawLandmarks(allLandmarks: any[][]) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (allLandmarks.length === 0) return;

    for (const lm of allLandmarks) {
      // Draw connections
      ctx.lineWidth = 3;
      for (const [a, b] of HAND_CONNECTIONS) {
        const pa = lm[a];
        const pb = lm[b];
        if (!pa || !pb) continue;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.beginPath();
        ctx.moveTo(pa.x * w, pa.y * h);
        ctx.lineTo(pb.x * w, pb.y * h);
        ctx.stroke();
      }

      // Draw dots
      for (let i = 0; i < lm.length; i++) {
        const pt = lm[i];
        if (!pt) continue;
        const color = FINGERTIP_COLORS[i];
        const isTip = !!color;
        const dotColor = color || '#ffffff';
        const radius = isTip ? 10 : 6;

        // Glow for fingertips
        if (isTip) {
          ctx.beginPath();
          ctx.arc(pt.x * w, pt.y * h, radius + 4, 0, Math.PI * 2);
          ctx.fillStyle = dotColor.replace(')', ', 0.3)').replace('rgb', 'rgba').replace('#', '');
          // Simpler glow: just a larger semi-transparent circle
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = dotColor;
          ctx.fill();
          ctx.globalAlpha = 1.0;
        }

        ctx.beginPath();
        ctx.arc(pt.x * w, pt.y * h, radius, 0, Math.PI * 2);
        ctx.fillStyle = dotColor;
        ctx.fill();

        // White border
        ctx.beginPath();
        ctx.arc(pt.x * w, pt.y * h, radius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
  }

  function processResults(landmarks: any[][], _handedness: any[]) {
    drawLandmarks(landmarks);

    const handsDetected = landmarks.length;

    if (handsDetected === 0) {
      const s = smoothedRef.current;
      s.tension = s.tension * 0.92;
      s.centerX = s.centerX + (0.5 - s.centerX) * 0.05;
      s.centerY = s.centerY + (0.5 - s.centerY) * 0.05;

      onUpdateRef.current({
        tension: s.tension,
        handsDetected: 0,
        centerX: s.centerX,
        centerY: s.centerY,
      });
      return;
    }

    let totalTension = 0;
    let totalX = 0;
    let totalY = 0;

    for (let i = 0; i < landmarks.length; i++) {
      const lm = landmarks[i];
      totalTension += calculateTension(lm);
      const wrist = lm[0];
      const middleMcp = lm[9];
      totalX += (wrist.x + middleMcp.x) / 2;
      totalY += (wrist.y + middleMcp.y) / 2;
    }

    const tension = totalTension / handsDetected;
    const centerX = totalX / handsDetected;
    const centerY = totalY / handsDetected;

    // Near-instant response
    const smooth = 0.7;
    const s = smoothedRef.current;
    s.tension = s.tension + (tension - s.tension) * smooth;
    s.centerX = s.centerX + (centerX - s.centerX) * smooth;
    s.centerY = s.centerY + (centerY - s.centerY) * smooth;

    onUpdateRef.current({
      tension: s.tension,
      handsDetected,
      centerX: s.centerX,
      centerY: s.centerY,
    });
  }

  const startTracking = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);

      let useTasksVision = false;
      try {
        const tasksVision = await import('@mediapipe/tasks-vision');
        useTasksVision = !!tasksVision.HandLandmarker;
      } catch {
        useTasksVision = false;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      if (useTasksVision) {
        const { HandLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');

        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );

        const handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minTrackingConfidence: 0.4,
        });

        handLandmarkerRef.current = handLandmarker;
        setLoading(false);

        const detect = () => {
          if (!videoRef.current || !handLandmarkerRef.current) return;
          if (videoRef.current.readyState < 2) {
            animFrameRef.current = requestAnimationFrame(detect);
            return;
          }

          const results = handLandmarkerRef.current.detectForVideo(
            videoRef.current,
            performance.now()
          );

          processResults(results.landmarks || [], results.handedness || []);
          animFrameRef.current = requestAnimationFrame(detect);
        };

        animFrameRef.current = requestAnimationFrame(detect);
      } else {
        const { Hands } = await import('@mediapipe/hands');
        const { Camera } = await import('@mediapipe/camera_utils');

        const hands = new Hands({
          locateFile: (file: string) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`,
        });

        hands.setOptions({
          maxNumHands: 2,
          modelComplexity: 1,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.4,
        });

        hands.onResults((results: any) => {
          const landmarks = results.multiHandLandmarks || [];
          const handedness = results.multiHandedness || [];
          processResults(landmarks, handedness);
        });

        handLandmarkerRef.current = hands;

        const camera = new Camera(videoRef.current!, {
          onFrame: async () => {
            if (handLandmarkerRef.current && videoRef.current) {
              await handLandmarkerRef.current.send({ image: videoRef.current });
            }
          },
          width: 640,
          height: 480,
        });

        await camera.start();
        setLoading(false);
      }
    } catch (err: any) {
      console.error('Hand tracker init failed:', err);
      setError(err.message || 'Camera access denied');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    startTracking();

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      if (handLandmarkerRef.current) {
        if (typeof handLandmarkerRef.current.close === 'function') {
          handLandmarkerRef.current.close();
        }
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [startTracking]);

  return (
    <div className="fixed top-4 right-4 z-50">
      <div className="relative w-48 h-36 rounded-xl overflow-hidden border-2 border-white/30 bg-black/50 backdrop-blur-md shadow-2xl">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          playsInline
          muted
          style={{ transform: 'scaleX(-1)' }}
        />
        <canvas
          ref={canvasRef}
          width={640}
          height={480}
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ transform: 'scaleX(-1)', zIndex: 10 }}
        />

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60" style={{ zIndex: 20 }}>
            <div className="text-white/70 text-xs">Loading camera...</div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 p-2" style={{ zIndex: 20 }}>
            <div className="text-red-400 text-xs mb-2 text-center">{error}</div>
            <button
              onClick={() => startTracking()}
              className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-white text-xs transition-colors"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

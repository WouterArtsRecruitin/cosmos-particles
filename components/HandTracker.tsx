'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { HandStats } from '../types';

interface HandTrackerProps {
  onUpdate: (stats: HandStats) => void;
}

export default function HandTracker({ onUpdate }: HandTrackerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const handLandmarkerRef = useRef<any>(null);
  const animFrameRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);

  const smoothedRef = useRef({
    tension: 0,
    centerX: 0.5,
    centerY: 0.5,
  });

  const calculateTension = useCallback((landmarks: any[]): number => {
    // landmarks is array of 21 hand landmarks
    // Fingertip indices: 4 (thumb), 8 (index), 12 (middle), 16 (ring), 20 (pinky)
    // Wrist: 0
    const wrist = landmarks[0];
    const fingerTips = [4, 8, 12, 16, 20];
    const fingerBases = [2, 5, 9, 13, 17];

    // Palm size = distance from wrist to middle finger MCP
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
      const openness = Math.max(0, Math.min(1, (ratio - 1.0) / 1.2));
      totalOpenness += openness;
    }

    const avgOpenness = totalOpenness / fingerTips.length;
    // Tension = inverted openness: closed fist = 1.0, open hand = 0.0
    return Math.max(0, Math.min(1, 1 - avgOpenness));
  }, []);

  const startTracking = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);

      // Use the older @mediapipe/hands if tasks-vision is not available
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
          minHandDetectionConfidence: 0.6,
          minTrackingConfidence: 0.5,
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
        // Fallback to @mediapipe/hands
        const { Hands } = await import('@mediapipe/hands');
        const { Camera } = await import('@mediapipe/camera_utils');

        const hands = new Hands({
          locateFile: (file: string) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`,
        });

        hands.setOptions({
          maxNumHands: 2,
          modelComplexity: 1,
          minDetectionConfidence: 0.6,
          minTrackingConfidence: 0.5,
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

  const processResults = useCallback((landmarks: any[][], handedness: any[]) => {
    const handsDetected = landmarks.length;

    if (handsDetected === 0) {
      // Smoothly decay to default
      const s = smoothedRef.current;
      s.tension = s.tension * 0.95;
      s.centerX = s.centerX + (0.5 - s.centerX) * 0.05;
      s.centerY = s.centerY + (0.5 - s.centerY) * 0.05;

      onUpdate({
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

      // Center point from wrist and middle MCP
      const wrist = lm[0];
      const middleMcp = lm[9];
      totalX += (wrist.x + middleMcp.x) / 2;
      totalY += (wrist.y + middleMcp.y) / 2;
    }

    const tension = totalTension / handsDetected;
    const centerX = totalX / handsDetected;
    const centerY = totalY / handsDetected;

    // Smooth values
    const smooth = 0.35;
    const s = smoothedRef.current;
    s.tension  = s.tension  + (tension  - s.tension)  * smooth;
    s.centerX  = s.centerX  + (centerX  - s.centerX)  * smooth;
    s.centerY  = s.centerY  + (centerY  - s.centerY)  * smooth;

    onUpdate({
      tension: s.tension,
      handsDetected,
      centerX: s.centerX,
      centerY: s.centerY,
    });
  }, [calculateTension, onUpdate]);

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
      {/* Camera preview */}
      <div className="relative w-40 h-30 rounded-xl overflow-hidden border border-white/20 bg-black/40 backdrop-blur-md shadow-lg">
        <video
          ref={videoRef}
          className="w-full h-full object-cover mirror"
          playsInline
          muted
          style={{ transform: 'scaleX(-1)' }}
        />

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <div className="text-white/70 text-xs">Loading camera...</div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 p-2">
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

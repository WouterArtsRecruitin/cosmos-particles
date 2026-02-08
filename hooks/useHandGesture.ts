'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';

export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

export interface GestureState {
  leftHand: HandLandmark[] | null;
  rightHand: HandLandmark[] | null;
  handsDetected: number;
  distance: number;        // normalized distance between hands (0-1)
  leftOpenness: number;    // 0 = closed fist, 1 = fully open
  rightOpenness: number;
  averageOpenness: number;
  tension: number;         // 0 = open hand, 1 = closed fist (inverse of openness)
  scale: number;           // combined scale factor from distance + openness
  centerX: number;         // center point between hands (normalized 0-1)
  centerY: number;
  isActive: boolean;       // whether gesture detection is running
  videoElement: HTMLVideoElement | null; // for camera preview
}

const DEFAULT_STATE: GestureState = {
  leftHand: null,
  rightHand: null,
  handsDetected: 0,
  distance: 0.5,
  leftOpenness: 0,
  rightOpenness: 0,
  averageOpenness: 0,
  tension: 0,
  scale: 1,
  centerX: 0.5,
  centerY: 0.5,
  isActive: false,
  videoElement: null,
};

// Hand skeleton connections for drawing overlay
export const HAND_CONNECTIONS: [number, number][] = [
  // Thumb
  [0, 1], [1, 2], [2, 3], [3, 4],
  // Index
  [0, 5], [5, 6], [6, 7], [7, 8],
  // Middle
  [5, 9], [9, 10], [10, 11], [11, 12],
  // Ring
  [9, 13], [13, 14], [14, 15], [15, 16],
  // Pinky
  [13, 17], [17, 18], [18, 19], [19, 20],
  // Palm base
  [0, 17],
];

function calculateFingerOpenness(landmarks: HandLandmark[]): number {
  // Finger tip indices: thumb=4, index=8, middle=12, ring=16, pinky=20
  // Finger MCP (base) indices: thumb=2, index=5, middle=9, ring=13, pinky=17
  // Wrist: 0
  const wrist = landmarks[0];

  const fingerTips = [4, 8, 12, 16, 20];
  const fingerBases = [2, 5, 9, 13, 17];

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
    // ratio > ~2 means finger extended, < ~1.2 means curled
    const openness = Math.max(0, Math.min(1, (ratio - 1.0) / 1.2));
    totalOpenness += openness;
  }

  return totalOpenness / fingerTips.length;
}

function getHandCenter(landmarks: HandLandmark[]): { x: number; y: number } {
  // Use palm center (average of wrist and middle finger MCP)
  const wrist = landmarks[0];
  const middleMcp = landmarks[9];
  return {
    x: (wrist.x + middleMcp.x) / 2,
    y: (wrist.y + middleMcp.y) / 2,
  };
}

export interface UseHandGestureReturn {
  gesture: GestureState;
  /** Direct ref updated synchronously in MediaPipe callback — use in animation loops to avoid React state delay */
  dataRef: React.MutableRefObject<GestureState>;
}

export function useHandGesture(enabled: boolean = true): UseHandGestureReturn {
  const [gesture, setGesture] = useState<GestureState>(DEFAULT_STATE);
  const dataRef = useRef<GestureState>(DEFAULT_STATE);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handsRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const animFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const smoothedRef = useRef({
    distance: 0.5,
    leftOpenness: 0,
    rightOpenness: 0,
    scale: 1,
    centerX: 0.5,
    centerY: 0.5,
  });

  const cleanup = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (cameraRef.current) {
      cameraRef.current.stop();
      cameraRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (handsRef.current) {
      handsRef.current.close();
      handsRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      cleanup();
      setGesture(prev => ({ ...prev, isActive: false }));
      return;
    }

    let isMounted = true;

    async function initHandDetection() {
      try {
        const { Hands } = await import('@mediapipe/hands');
        const { Camera } = await import('@mediapipe/camera_utils');

        if (!isMounted) return;

        // Create video element
        const video = document.createElement('video');
        video.setAttribute('playsinline', '');
        video.style.display = 'none';
        document.body.appendChild(video);
        videoRef.current = video;

        // Create canvas for debug drawing
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 240;
        canvas.style.display = 'none';
        document.body.appendChild(canvas);
        canvasRef.current = canvas;

        const hands = new Hands({
          locateFile: (file: string) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`;
          },
        });

        hands.setOptions({
          maxNumHands: 2,
          modelComplexity: 1,
          minDetectionConfidence: 0.6,
          minTrackingConfidence: 0.5,
        });

        hands.onResults((results: any) => {
          if (!isMounted) return;

          const multiHandLandmarks = results.multiHandLandmarks || [];
          const multiHandedness = results.multiHandedness || [];

          let leftHand: HandLandmark[] | null = null;
          let rightHand: HandLandmark[] | null = null;

          for (let i = 0; i < multiHandLandmarks.length; i++) {
            const landmarks = multiHandLandmarks[i] as HandLandmark[];
            const label = multiHandedness[i]?.label;
            // MediaPipe mirrors the video, so 'Left' in result = right hand visually
            if (label === 'Left') {
              rightHand = landmarks;
            } else {
              leftHand = landmarks;
            }
          }

          const handsDetected = multiHandLandmarks.length;
          let distance = smoothedRef.current.distance;
          let leftOpenness = 0;
          let rightOpenness = 0;
          let centerX = smoothedRef.current.centerX;
          let centerY = smoothedRef.current.centerY;

          if (leftHand) {
            leftOpenness = calculateFingerOpenness(leftHand);
          }
          if (rightHand) {
            rightOpenness = calculateFingerOpenness(rightHand);
          }

          if (leftHand && rightHand) {
            const leftCenter = getHandCenter(leftHand);
            const rightCenter = getHandCenter(rightHand);

            // Calculate distance between hand centers (normalized to 0-1)
            const dx = leftCenter.x - rightCenter.x;
            const dy = leftCenter.y - rightCenter.y;
            const rawDist = Math.sqrt(dx * dx + dy * dy);
            distance = Math.min(1, rawDist / 0.8); // normalize

            centerX = (leftCenter.x + rightCenter.x) / 2;
            centerY = (leftCenter.y + rightCenter.y) / 2;
          } else if (leftHand || rightHand) {
            const hand = leftHand || rightHand!;
            const c = getHandCenter(hand);
            centerX = c.x;
            centerY = c.y;
          }

          const averageOpenness = handsDetected > 0
            ? ((leftHand ? leftOpenness : 0) + (rightHand ? rightOpenness : 0)) / handsDetected
            : 0;

          // Scale combines distance (how far apart hands are) and openness
          const distanceScale = 0.3 + distance * 1.7; // 0.3 to 2.0
          const opennessScale = 0.5 + averageOpenness * 0.5; // 0.5 to 1.0
          const rawScale = distanceScale * opennessScale;

          // Smooth values (light smoothing only — animation loop does its own lerp)
          const smooth = 0.35;
          const s = smoothedRef.current;
          s.distance = s.distance + (distance - s.distance) * smooth;
          s.leftOpenness = s.leftOpenness + (leftOpenness - s.leftOpenness) * smooth;
          s.rightOpenness = s.rightOpenness + (rightOpenness - s.rightOpenness) * smooth;
          s.scale = s.scale + (rawScale - s.scale) * smooth;
          s.centerX = s.centerX + (centerX - s.centerX) * smooth;
          s.centerY = s.centerY + (centerY - s.centerY) * smooth;

          // Tension: 0 = open hand, 1 = closed fist (inverted openness)
          const tension = Math.max(0, Math.min(1, 1 - averageOpenness));

          const newState: GestureState = {
            leftHand,
            rightHand,
            handsDetected,
            distance: s.distance,
            leftOpenness: s.leftOpenness,
            rightOpenness: s.rightOpenness,
            averageOpenness,
            tension,
            scale: s.scale,
            centerX: s.centerX,
            centerY: s.centerY,
            isActive: true,
            videoElement: videoRef.current,
          };

          // Write directly to ref (synchronous, no React delay)
          dataRef.current = newState;
          // Also update React state for UI components
          setGesture(newState);
        });

        handsRef.current = hands;

        // Start camera
        const camera = new Camera(video, {
          onFrame: async () => {
            if (handsRef.current) {
              await handsRef.current.send({ image: video });
            }
          },
          width: 640,
          height: 480,
        });

        cameraRef.current = camera;
        await camera.start();

        // Store stream reference for cleanup
        if (video.srcObject instanceof MediaStream) {
          streamRef.current = video.srcObject;
        }

        if (isMounted) {
          setGesture(prev => ({ ...prev, isActive: true, videoElement: videoRef.current }));
        }
      } catch (err) {
        console.error('Hand detection init failed:', err);
        if (isMounted) {
          setGesture(prev => ({ ...prev, isActive: false }));
        }
      }
    }

    initHandDetection();

    return () => {
      isMounted = false;
      cleanup();
      // Remove dynamically created elements
      if (videoRef.current && videoRef.current.parentNode) {
        videoRef.current.parentNode.removeChild(videoRef.current);
      }
      if (canvasRef.current && canvasRef.current.parentNode) {
        canvasRef.current.parentNode.removeChild(canvasRef.current);
      }
    };
  }, [enabled, cleanup]);

  return { gesture, dataRef };
}

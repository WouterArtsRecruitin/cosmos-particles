'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { useHandGesture, HAND_CONNECTIONS, HandLandmark } from '@/hooks/useHandGesture';
import { PARTICLE_TEMPLATES, PRESET_COLORS } from '@/lib/particleTemplates';
import { generateStarCatalog } from '@/lib/starCatalog';

const PARTICLE_COUNT = 55000;
const TRAIL_LENGTH = 2;
const TRAIL_PARTICLE_COUNT = PARTICLE_COUNT * TRAIL_LENGTH;
const BASE_SCALE = 15;       // matches original CORE_RADIUS=15, HALO_RADIUS=45
const LERP_SPEED = 0.06;     // faster response for gesture control
const SESSION_KEY = 'cosmos-particles-session';

type TransitionMode = 'morph' | 'explode' | 'vortex';

interface SessionData {
  selectedTemplate: string;
  selectedColor: { name: string; hex: string; rgb: number[] };
  customColor: string;
  transitionMode: TransitionMode;
  showPanel: boolean;
}

function loadSession(): SessionData | null {
  try {
    const data = localStorage.getItem(SESSION_KEY);
    if (!data) return null;
    const parsed = JSON.parse(data);
    if (typeof parsed.selectedTemplate !== 'string') return null;
    if (!parsed.selectedColor?.hex || !Array.isArray(parsed.selectedColor?.rgb)) return null;
    if (typeof parsed.customColor !== 'string') return null;
    if (!['morph', 'explode', 'vortex'].includes(parsed.transitionMode)) return null;
    if (typeof parsed.showPanel !== 'boolean') return null;
    // Validate template exists
    if (!PARTICLE_TEMPLATES.find(t => t.id === parsed.selectedTemplate)) return null;
    return parsed as SessionData;
  } catch {
    return null;
  }
}

function saveSession(data: SessionData): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  } catch {
    // localStorage may be full or disabled
  }
}

const TRANSITION_MODES: { id: TransitionMode; name: string; icon: string }[] = [
  { id: 'morph', name: 'Morph', icon: '~' },
  { id: 'explode', name: 'Explode', icon: '✺' },
  { id: 'vortex', name: 'Vortex', icon: '◎' },
];

export default function ParticleGestureSystem() {
  const savedSessionRef = useRef(loadSession());
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const particlesRef = useRef<THREE.Points | null>(null);
  const trailPointsRef = useRef<THREE.Points | null>(null);
  const animationIdRef = useRef<number | null>(null);
  const currentPositionsRef = useRef<Float32Array | null>(null);
  const targetPositionsRef = useRef<Float32Array | null>(null);
  const velocitiesRef = useRef<Float32Array | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const trailMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
  const trailPositionsRef = useRef<Float32Array | null>(null);
  const trailAlphasRef = useRef<Float32Array | null>(null);

  // Explosion / transition state (kept in refs for animation loop access)
  const explosionRef = useRef({
    active: false,
    phase: 'idle' as 'idle' | 'exploding' | 'reforming',
    progress: 0,
    burstVelocities: null as Float32Array | null,
    pendingTarget: null as Float32Array | null,
  });

  // Pulse wave state
  const pulseRef = useRef({
    active: false,
    origin: new THREE.Vector3(0, 0, 0),
    progress: 0,
    strength: 0,
  });

  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>(
    savedSessionRef.current?.selectedTemplate ?? 'cosmos'
  );
  const [selectedColor, setSelectedColor] = useState(
    savedSessionRef.current?.selectedColor ?? PRESET_COLORS[0]
  );
  const [customColor, setCustomColor] = useState(
    savedSessionRef.current?.customColor ?? '#FFD700'
  );
  const [showPanel, setShowPanel] = useState(
    savedSessionRef.current?.showPanel ?? true
  );
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [gestureInfo, setGestureInfo] = useState('');
  const [transitionMode, setTransitionMode] = useState<TransitionMode>(
    savedSessionRef.current?.transitionMode ?? 'explode'
  );
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [captureFlash, setCaptureFlash] = useState(false);
  const [showCameraPreview, setShowCameraPreview] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const gestureScaleRef = useRef(1.0);
  const gestureOffsetRef = useRef({ x: 0, y: 0, z: 0 });
  const prevHandsRef = useRef(0);
  const transitionModeRef = useRef<TransitionMode>('explode');

  const { gesture, dataRef: gestureDataRef } = useHandGesture(cameraEnabled);

  // Keep ref in sync with state
  useEffect(() => {
    transitionModeRef.current = transitionMode;
  }, [transitionMode]);

  // Trigger explosion + reform when template changes
  const triggerTransition = useCallback((newTarget: Float32Array) => {
    const current = currentPositionsRef.current;
    const vel = velocitiesRef.current;
    if (!current || !vel) {
      console.log('[Cosmos] triggerTransition blocked - refs not ready');
      return;
    }

    const mode = transitionModeRef.current;
    const exp = explosionRef.current;
    console.log('[Cosmos] triggerTransition starting -', 'mode:', mode, 'exp.active:', exp.active);

    if (mode === 'morph') {
      // Simple morph: just set target, spring physics does the rest
      targetPositionsRef.current = newTarget;
      console.log('[Cosmos] Morph mode - target set');
      return;
    }

    // Create burst velocities
    const burstVel = new Float32Array(PARTICLE_COUNT * 3);

    if (mode === 'explode') {
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const i3 = i * 3;
        const x = current[i3];
        const y = current[i3 + 1];
        const z = current[i3 + 2];
        const dist = Math.sqrt(x * x + y * y + z * z) || 0.01;
        // EXTREME EXPLOSIE: deeltjes vliegen OVER HET SCHERM!!!
        const force = 50.0 + Math.random() * 100.0; // ENORM: 50-150 (was 5-13)!
        const chaos = (Math.random() - 0.5) * 30.0; // chaos 30 (was 6.0)!
        burstVel[i3] = (x / dist) * force + chaos;
        burstVel[i3 + 1] = (y / dist) * force + chaos;
        burstVel[i3 + 2] = (z / dist) * force + chaos;
      }
    } else if (mode === 'vortex') {
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const i3 = i * 3;
        const x = current[i3];
        const y = current[i3 + 1];
        const z = current[i3 + 2];
        // Tangential velocity (spinning outward)
        const force = 0.2 + Math.random() * 0.3;
        burstVel[i3] = -z * force + (Math.random() - 0.5) * 0.1;
        burstVel[i3 + 1] = (Math.random() - 0.5) * 0.2;
        burstVel[i3 + 2] = x * force + (Math.random() - 0.5) * 0.1;
      }
    }

    exp.burstVelocities = burstVel;
    exp.pendingTarget = newTarget;
    exp.phase = 'exploding';
    exp.progress = 0;
    exp.active = true;
    setIsTransitioning(true);
  }, []);

  // Generate new target positions when template changes
  const generateTemplate = useCallback((templateId: string, scale: number) => {
    const template = PARTICLE_TEMPLATES.find(t => t.id === templateId);
    if (!template) return;
    const positions = template.generate(PARTICLE_COUNT, scale);
    triggerTransition(positions);
  }, [triggerTransition]);

  // Update particle tint color (blends with star catalog colors)
  const updateColor = useCallback((rgb: number[]) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTintColor.value.set(rgb[0], rgb[1], rgb[2]);
      materialRef.current.uniforms.uTintAmount.value = 0.55; // blend tint with star colors
    }
    if (trailMaterialRef.current) {
      trailMaterialRef.current.uniforms.uColor.value.set(rgb[0], rgb[1], rgb[2]);
    }
  }, []);

  const handleTemplateChange = useCallback((templateId: string) => {
    // Don't block - just set the template, useEffect will handle the transition
    setSelectedTemplate(templateId);
  }, []);

  const handleColorChange = useCallback((color: typeof PRESET_COLORS[0]) => {
    setSelectedColor(color);
    setCustomColor(color.hex);
    updateColor(color.rgb);
  }, [updateColor]);

  const handleCustomColorChange = useCallback((hex: string) => {
    setCustomColor(hex);
    const c = new THREE.Color(hex);
    const rgb = [c.r, c.g, c.b];
    setSelectedColor({ name: 'Custom', hex, rgb });
    updateColor(rgb);
  }, [updateColor]);

  // Fire a pulse wave from center
  const firePulse = useCallback((strength: number = 1.0) => {
    const p = pulseRef.current;
    p.active = true;
    p.progress = 0;
    p.strength = strength;
    p.origin.set(0, 0, 0);
  }, []);

  // Capture screenshot from WebGL canvas
  const captureScreenshot = useCallback(() => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera) return;

    // Render one clean frame
    renderer.render(scene, camera);
    const dataUrl = renderer.domElement.toDataURL('image/png');

    // Trigger download
    const link = document.createElement('a');
    link.download = `cosmos-particles-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();

    // Flash effect
    setCaptureFlash(true);
    firePulse(0.5);
    setTimeout(() => setCaptureFlash(false), 300);
  }, [firePulse]);

  // ─── Main Three.js setup ────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    // Loading timeout: if setup takes too long, show error
    const loadingTimeout = setTimeout(() => {
      setIsLoading(false);
      setLoadError(true);
    }, 15000);

    try {

    // Scene (matches original cosmos - pure black, no fog)
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    sceneRef.current = scene;

    // Camera (matches original: FOV=45, z=90)
    const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 90);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // ── Main particles (55k with original cosmos star catalog) ──
    const saved = savedSessionRef.current;
    const initTemplate = (saved ? PARTICLE_TEMPLATES.find(t => t.id === saved.selectedTemplate) : null) ?? PARTICLE_TEMPLATES[0];
    const initialPositions = initTemplate.generate(PARTICLE_COUNT, BASE_SCALE);
    currentPositionsRef.current = new Float32Array(initialPositions);
    targetPositionsRef.current = new Float32Array(initialPositions);
    velocitiesRef.current = new Float32Array(PARTICLE_COUNT * 3);

    // Generate star catalog colors/sizes (same as original GlobularCluster)
    const catalog = generateStarCatalog(PARTICLE_COUNT);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(currentPositionsRef.current, 3));
    geometry.setAttribute('aColor', new THREE.Float32BufferAttribute(catalog.colors, 3));
    geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(catalog.sizes, 1));
    geometry.setAttribute('aBrightness', new THREE.Float32BufferAttribute(catalog.brightnesses, 1));

    const randoms = new Float32Array(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      randoms[i] = Math.random();
    }
    geometry.setAttribute('aRandom', new THREE.Float32BufferAttribute(randoms, 1));

    const initColor = saved?.selectedColor ?? PRESET_COLORS[0];
    const initTintAmount = saved?.selectedColor ? 0.55 : 0.0;

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uTintColor: { value: new THREE.Vector3(initColor.rgb[0], initColor.rgb[1], initColor.rgb[2]) },
        uTintAmount: { value: initTintAmount },  // 0 = star colors, 1 = full tint
        uScale: { value: 1.0 },
        uExplosion: { value: 0.0 },
        uPulse: { value: 0.0 },
        uPulseRadius: { value: 0.0 },
      },
      vertexShader: `
        uniform float uTime;
        uniform float uScale;
        uniform float uExplosion;
        uniform float uPulse;
        uniform float uPulseRadius;
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aBrightness;
        attribute float aRandom;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vRandom;

        void main() {
          vColor = aColor;
          vRandom = aRandom;

          vec3 pos = position;

          // Subtle floating animation (scaled for larger coordinate space)
          float floatOffset = aRandom * 6.28318;
          pos.x += sin(uTime * 0.3 + floatOffset) * 0.15;
          pos.y += cos(uTime * 0.25 + floatOffset * 1.3) * 0.15;
          pos.z += sin(uTime * 0.2 + floatOffset * 0.7) * 0.15;

          // Pulse wave displacement (scaled for larger space)
          float distFromCenter = length(pos);
          float pulseHit = smoothstep(uPulseRadius - 8.0, uPulseRadius, distFromCenter)
                         * smoothstep(uPulseRadius + 8.0, uPulseRadius, distFromCenter);
          vec3 pulseDir = distFromCenter > 0.01 ? normalize(pos) : vec3(0.0, 1.0, 0.0);
          pos += pulseDir * pulseHit * uPulse * 3.0;

          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

          // EXTREME explosion size boost
          float sizeBoost = 1.0 + uExplosion * 4.0; // was 0.8, now 4.0 = 5x groter!
          gl_PointSize = aSize * 200.0 * uScale * sizeBoost * (400.0 / -mvPosition.z);
          gl_PointSize = max(gl_PointSize, 0.3);
          gl_Position = projectionMatrix * mvPosition;

          vAlpha = aBrightness;
          vAlpha *= (1.0 + uExplosion * 4.0); // was 1.5, now 4.0 = 5x helderder!
          vAlpha = min(vAlpha, 3.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uTintColor;
        uniform float uTintAmount;
        uniform float uTime;
        uniform float uExplosion;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vRandom;

        void main() {
          vec2 center = gl_PointCoord - 0.5;
          float dist = length(center);

          float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
          alpha *= vAlpha;

          if (alpha < 0.08) discard;

          // Mix star catalog color with tint color
          vec3 color = mix(vColor * vAlpha, uTintColor, uTintAmount);

          // EXTREME white-hot explosion effect
          float heat = uExplosion * exp(-dist * 2.0) * 2.5; // was 0.7, now 2.5!
          color += vec3(heat, heat * 0.9, heat * 0.7);

          // Extra oranje glow tijdens explosie
          color += vec3(uExplosion * 0.8, uExplosion * 0.4, 0.0);

          // Twinkle
          float twinkle = 0.88 + 0.12 * sin(uTime * 2.0 + vRandom * 50.0);
          alpha *= twinkle;

          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,  // matches original (NOT Additive)
    });

    materialRef.current = material;
    const particles = new THREE.Points(geometry, material);
    scene.add(particles);
    particlesRef.current = particles;

    // ── Trail system ──
    const trailPositions = new Float32Array(TRAIL_PARTICLE_COUNT * 3);
    const trailAlphas = new Float32Array(TRAIL_PARTICLE_COUNT);
    const trailRandoms = new Float32Array(TRAIL_PARTICLE_COUNT);

    // Initialize trail positions to current
    for (let t = 0; t < TRAIL_LENGTH; t++) {
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const srcIdx = i * 3;
        const dstIdx = (t * PARTICLE_COUNT + i) * 3;
        trailPositions[dstIdx] = initialPositions[srcIdx];
        trailPositions[dstIdx + 1] = initialPositions[srcIdx + 1];
        trailPositions[dstIdx + 2] = initialPositions[srcIdx + 2];
        trailAlphas[t * PARTICLE_COUNT + i] = 0;
        trailRandoms[t * PARTICLE_COUNT + i] = randoms[i];
      }
    }
    trailPositionsRef.current = trailPositions;
    trailAlphasRef.current = trailAlphas;

    const trailGeometry = new THREE.BufferGeometry();
    trailGeometry.setAttribute('position', new THREE.Float32BufferAttribute(trailPositions, 3));
    trailGeometry.setAttribute('aAlpha', new THREE.Float32BufferAttribute(trailAlphas, 1));
    trailGeometry.setAttribute('aRandom', new THREE.Float32BufferAttribute(trailRandoms, 1));

    const trailMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Vector3(initColor.rgb[0], initColor.rgb[1], initColor.rgb[2]) },
        uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      },
      vertexShader: `
        uniform float uPixelRatio;
        attribute float aAlpha;
        attribute float aRandom;
        varying float vAlpha;
        varying float vRandom;

        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = 0.003 * 100.0 * (400.0 / -mvPosition.z);
          gl_PointSize = max(gl_PointSize, 0.2);
          gl_Position = projectionMatrix * mvPosition;
          vAlpha = aAlpha * smoothstep(300.0, 20.0, -mvPosition.z);
          vRandom = aRandom;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying float vAlpha;
        varying float vRandom;

        void main() {
          float dist = length(gl_PointCoord - 0.5);
          float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
          alpha *= vAlpha;
          if (alpha < 0.05) discard;
          vec3 color = uColor * 0.5;
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    trailMaterialRef.current = trailMaterial;
    const trailPoints = new THREE.Points(trailGeometry, trailMaterial);
    scene.add(trailPoints);
    trailPointsRef.current = trailPoints;

    // ── Background dust (scaled for larger coordinate space) ──
    const dustCount = 2000;
    const dustGeometry = new THREE.BufferGeometry();
    const dustPositions = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      dustPositions[i * 3] = (Math.random() - 0.5) * 300;
      dustPositions[i * 3 + 1] = (Math.random() - 0.5) * 300;
      dustPositions[i * 3 + 2] = (Math.random() - 0.5) * 300;
    }
    dustGeometry.setAttribute('position', new THREE.Float32BufferAttribute(dustPositions, 3));
    const dustMaterial = new THREE.PointsMaterial({
      size: 0.08, color: 0x334466, transparent: true, opacity: 0.2,
      depthWrite: false, blending: THREE.NormalBlending,
    });
    const dust = new THREE.Points(dustGeometry, dustMaterial);
    scene.add(dust);

    clearTimeout(loadingTimeout);
    setIsLoading(false);

    // ── Mouse / touch interaction ──
    let isDragging = false;
    let lastMouse = { x: 0, y: 0 };
    let autoRotate = true;
    let autoRotateTimeout: NodeJS.Timeout | null = null;

    const handleMouseDown = (e: MouseEvent) => {
      isDragging = true; autoRotate = false;
      lastMouse = { x: e.clientX, y: e.clientY };
      if (autoRotateTimeout) clearTimeout(autoRotateTimeout);
    };
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - lastMouse.x;
      const dy = e.clientY - lastMouse.y;
      particles.rotation.y += dx * 0.005;
      particles.rotation.x += dy * 0.005;
      trailPoints.rotation.y = particles.rotation.y;
      trailPoints.rotation.x = particles.rotation.x;
      dust.rotation.y += dx * 0.002;
      dust.rotation.x += dy * 0.002;
      lastMouse = { x: e.clientX, y: e.clientY };
    };
    const handleMouseUp = () => {
      isDragging = false;
      autoRotateTimeout = setTimeout(() => { autoRotate = true; }, 2000);
    };
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      camera.position.z = Math.max(40, Math.min(200, camera.position.z + e.deltaY * 0.08));
    };
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    container.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    container.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('resize', handleResize);

    let lastTouchDist = 0;
    container.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        isDragging = true; autoRotate = false;
        lastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        if (autoRotateTimeout) clearTimeout(autoRotateTimeout);
      } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastTouchDist = Math.sqrt(dx * dx + dy * dy);
      }
    }, { passive: true });
    container.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1 && isDragging) {
        const dx = e.touches[0].clientX - lastMouse.x;
        const dy = e.touches[0].clientY - lastMouse.y;
        particles.rotation.y += dx * 0.005;
        particles.rotation.x += dy * 0.005;
        trailPoints.rotation.y = particles.rotation.y;
        trailPoints.rotation.x = particles.rotation.x;
        lastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        camera.position.z = Math.max(40, Math.min(200, camera.position.z + (lastTouchDist - dist) * 0.15));
        lastTouchDist = dist;
      }
    }, { passive: true });
    container.addEventListener('touchend', () => {
      isDragging = false;
      autoRotateTimeout = setTimeout(() => { autoRotate = true; }, 2000);
    }, { passive: true });

    // ── Animation loop ──
    const clock = new THREE.Clock();
    let trailFrame = 0;

    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();
      const dt = Math.min(clock.getDelta(), 0.05);

      material.uniforms.uTime.value = elapsed;

      const current = currentPositionsRef.current;
      const target = targetPositionsRef.current;
      const vel = velocitiesRef.current;
      const trailPos = trailPositionsRef.current;
      const trailAlpha = trailAlphasRef.current;
      const exp = explosionRef.current;
      const pulse = pulseRef.current;

      if (!current || !target || !vel || !trailPos || !trailAlpha) {
        renderer.render(scene, camera);
        return;
      }

      // ── Pulse wave ──
      if (pulse.active) {
        pulse.progress += dt * 3.0;
        const radius = pulse.progress * 8.0;
        const fade = Math.max(0, 1.0 - pulse.progress * 0.4);
        material.uniforms.uPulse.value = pulse.strength * fade;
        material.uniforms.uPulseRadius.value = radius;
        if (fade <= 0) {
          pulse.active = false;
          material.uniforms.uPulse.value = 0;
        }
      }

      // ── Gesture: update offset + scale (before physics so offset is available) ──
      const g = gestureDataRef.current;
      const offset = gestureOffsetRef.current;
      if (g.handsDetected > 0) {
        gestureScaleRef.current += (g.scale - gestureScaleRef.current) * 0.18;

        const handWorldX = (0.5 - g.centerX) * 50;
        const handWorldY = (0.5 - g.centerY) * 35;
        const followSpeed = 0.06 + g.averageOpenness * 0.08;
        offset.x += (handWorldX - offset.x) * followSpeed;
        offset.y += (handWorldY - offset.y) * followSpeed;
        offset.z *= 0.95;
      } else {
        gestureScaleRef.current += (1.0 - gestureScaleRef.current) * 0.04;
        offset.x *= 0.96;
        offset.y *= 0.96;
        offset.z *= 0.96;
      }

      // ── Explosion / transition phases ──
      if (exp.active) {
        const speed = 0.8; // LANGZAAM zodat je explosie ECHT ziet!
        exp.progress += dt * speed;

        if (exp.phase === 'exploding') {
          const t = Math.min(exp.progress, 1.0);
          material.uniforms.uExplosion.value = t;

          // DIRECT EXPLOSION - geen physics, gewoon VLIEGEN!
          if (exp.burstVelocities) {
            for (let i = 0; i < PARTICLE_COUNT * 3; i++) {
              // EXTREME KRACHT: 500x sneller dan normaal!!!
              current[i] += exp.burstVelocities[i] * dt * 500.0; // was 100x, now 500x!!!
              // Velocity blijft constant = particles blijven vliegen
              vel[i] = exp.burstVelocities[i];
            }
          }

          if (exp.progress >= 1.5) {
            // LANG wachten (1.5 / 0.8 = 1.875 seconden explosie!)
            exp.phase = 'reforming';
            exp.progress = 0;
            if (exp.pendingTarget) {
              targetPositionsRef.current = exp.pendingTarget;
            }
            console.log('[Cosmos] Explosion complete, reforming...');
          }
        } else if (exp.phase === 'reforming') {
          const t = Math.min(exp.progress / 0.8, 1.0); // kortere reforming fase
          material.uniforms.uExplosion.value = Math.max(0, 1.0 - t * 1.5);

          const reformTarget = targetPositionsRef.current;
          if (reformTarget) {
            const gestureScale = gestureScaleRef.current;
            const offsets = [offset.x, offset.y, offset.z];
            const lerpFactor = 0.15 + t * 0.25; // VEEL sneller: 10x sterker

            for (let i = 0; i < PARTICLE_COUNT * 3; i++) {
              const scaledTarget = reformTarget[i] * gestureScale + offsets[i % 3];
              const diff = scaledTarget - current[i];
              vel[i] += diff * lerpFactor;
              vel[i] *= 0.85; // minder damping voor snellere beweging
              current[i] += vel[i];
            }
          }

          if (exp.progress >= 0.8) { // sneller klaar
            exp.active = false;
            exp.phase = 'idle';
            exp.burstVelocities = null;
            exp.pendingTarget = null;
            material.uniforms.uExplosion.value = 0;
            setIsTransitioning(false);
            console.log('[Cosmos] Transition complete!');
          }
        }
      } else {
        // ── Normal spring physics (no explosion active) ──
        const gestureScale = gestureScaleRef.current;
        const offsets = [offset.x, offset.y, offset.z];
        for (let i = 0; i < PARTICLE_COUNT * 3; i++) {
          const scaledTarget = target[i] * gestureScale + offsets[i % 3];
          const diff = scaledTarget - current[i];
          vel[i] += diff * LERP_SPEED;
          vel[i] *= 0.92;
          current[i] += vel[i];
        }
      }

      // Update main particle positions
      const posAttr = particles.geometry.getAttribute('position') as THREE.BufferAttribute;
      posAttr.set(current);
      posAttr.needsUpdate = true;

      // ── Update trails ──
      trailFrame++;
      if (trailFrame % 2 === 0) { // update every 2 frames for perf
        // Shift trail history back (oldest = highest index)
        for (let t = TRAIL_LENGTH - 1; t > 0; t--) {
          const dstOffset = t * PARTICLE_COUNT * 3;
          const srcOffset = (t - 1) * PARTICLE_COUNT * 3;
          const dstAlphaOffset = t * PARTICLE_COUNT;
          const srcAlphaOffset = (t - 1) * PARTICLE_COUNT;

          for (let i = 0; i < PARTICLE_COUNT * 3; i++) {
            trailPos[dstOffset + i] = trailPos[srcOffset + i];
          }
          for (let i = 0; i < PARTICLE_COUNT; i++) {
            trailAlpha[dstAlphaOffset + i] = trailAlpha[srcAlphaOffset + i] * 0.65;
          }
        }

        // Write current positions to trail slot 0
        for (let i = 0; i < PARTICLE_COUNT; i++) {
          const i3 = i * 3;
          trailPos[i3] = current[i3];
          trailPos[i3 + 1] = current[i3 + 1];
          trailPos[i3 + 2] = current[i3 + 2];

          // Trail alpha based on particle velocity (speed)
          const vx = vel[i3], vy = vel[i3 + 1], vz = vel[i3 + 2];
          const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
          trailAlpha[i] = Math.min(0.5, speed * 4.0);
        }

        const trailPosAttr = trailPoints.geometry.getAttribute('position') as THREE.BufferAttribute;
        trailPosAttr.set(trailPos);
        trailPosAttr.needsUpdate = true;
        const trailAlphaAttr = trailPoints.geometry.getAttribute('aAlpha') as THREE.BufferAttribute;
        trailAlphaAttr.set(trailAlpha);
        trailAlphaAttr.needsUpdate = true;
      }

      // ── Auto rotation (only when no hands and not dragging) ──
      if (autoRotate && !isDragging && g.handsDetected === 0) {
        particles.rotation.y += 0.0002;
        particles.rotation.x += 0.00005;
        trailPoints.rotation.y = particles.rotation.y;
        trailPoints.rotation.x = particles.rotation.x;
        dust.rotation.y -= 0.0001;
      }

      material.uniforms.uScale.value = gestureScaleRef.current;

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      clearTimeout(loadingTimeout);
      if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current);
      if (autoRotateTimeout) clearTimeout(autoRotateTimeout);
      container.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      container.removeEventListener('wheel', handleWheel);
      window.removeEventListener('resize', handleResize);
      geometry.dispose(); material.dispose();
      trailGeometry.dispose(); trailMaterial.dispose();
      dustGeometry.dispose(); dustMaterial.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };

    } catch (error) {
      clearTimeout(loadingTimeout);
      console.error('Failed to initialize particle system:', error);
      setIsLoading(false);
      setLoadError(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── React to gesture state changes (UI updates + pulse triggers only) ──
  useEffect(() => {
    if (!gesture.isActive || gesture.handsDetected === 0) {
      setGestureInfo('');

      // Detect hands leaving → fire pulse
      if (prevHandsRef.current > 0 && gesture.handsDetected === 0) {
        firePulse(0.8);
      }
      prevHandsRef.current = gesture.handsDetected;
      return;
    }

    // Detect hands appearing → fire pulse
    if (prevHandsRef.current === 0 && gesture.handsDetected > 0) {
      firePulse(1.0);
    }
    prevHandsRef.current = gesture.handsDetected;

    if (gesture.handsDetected === 2) {
      const pct = Math.round(gesture.distance * 100);
      const openPct = Math.round(gesture.averageOpenness * 100);
      setGestureInfo(`Handen: ${pct}% afstand \u2022 ${openPct}% open`);
    } else {
      const hand = gesture.leftHand ? 'Links' : 'Rechts';
      const openPct = Math.round((gesture.leftHand ? gesture.leftOpenness : gesture.rightOpenness) * 100);
      setGestureInfo(`${hand}: ${openPct}% open`);
    }
  }, [gesture, firePulse]);

  // ── Camera preview: draw video + hand skeleton ──
  useEffect(() => {
    if (!cameraEnabled || !gesture.isActive || !showCameraPreview) return;

    const canvas = previewCanvasRef.current;
    const video = gesture.videoElement;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId: number;
    const drawPreview = () => {
      rafId = requestAnimationFrame(drawPreview);

      const w = canvas.width;
      const h = canvas.height;

      // Draw mirrored video feed
      ctx.save();
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, w, h);
      ctx.restore();

      // Dim overlay
      ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
      ctx.fillRect(0, 0, w, h);

      // Draw hand skeletons
      const hands: { landmarks: HandLandmark[] | null; color: string }[] = [
        { landmarks: gesture.leftHand, color: '#00e676' },
        { landmarks: gesture.rightHand, color: '#448aff' },
      ];

      for (const hand of hands) {
        if (!hand.landmarks) continue;
        const lm = hand.landmarks;

        // Draw connections
        ctx.strokeStyle = hand.color;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.7;
        for (const [a, b] of HAND_CONNECTIONS) {
          ctx.beginPath();
          ctx.moveTo((1 - lm[a].x) * w, lm[a].y * h);
          ctx.lineTo((1 - lm[b].x) * w, lm[b].y * h);
          ctx.stroke();
        }

        // Draw joints
        ctx.globalAlpha = 0.9;
        for (let i = 0; i < lm.length; i++) {
          const x = (1 - lm[i].x) * w;
          const y = lm[i].y * h;
          const isTip = [4, 8, 12, 16, 20].includes(i);

          ctx.beginPath();
          ctx.arc(x, y, isTip ? 3 : 2, 0, Math.PI * 2);
          ctx.fillStyle = isTip ? '#ffffff' : hand.color;
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    };

    drawPreview();
    return () => cancelAnimationFrame(rafId);
  }, [cameraEnabled, gesture.isActive, gesture.leftHand, gesture.rightHand, gesture.videoElement, showCameraPreview]);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // 1-9: select template
      const num = parseInt(e.key);
      if (num >= 1 && num <= 9 && num <= PARTICLE_TEMPLATES.length) {
        e.preventDefault();
        handleTemplateChange(PARTICLE_TEMPLATES[num - 1].id);
        return;
      }

      switch (e.key) {
        case ' ':
          e.preventDefault();
          firePulse(1.0);
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
          } else {
            document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
          }
          break;
        case 'c':
        case 'C':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            setCameraEnabled(prev => !prev);
          }
          break;
        case 'p':
        case 'P':
          e.preventDefault();
          setShowPanel(prev => !prev);
          break;
        case 's':
        case 'S':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            captureScreenshot();
          }
          break;
        case 'h':
        case 'H':
          e.preventDefault();
          setShowCameraPreview(prev => !prev);
          break;
      }
    };

    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [handleTemplateChange, firePulse, captureScreenshot]);

  // ── React to template changes (skip initial mount since Three.js setup handles it) ──
  const isInitialMountRef = useRef(true);
  useEffect(() => {
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      console.log('[Cosmos] Initial mount - skipping transition');
      return;
    }
    console.log('[Cosmos] Template changed to:', selectedTemplate, 'Mode:', transitionMode);
    generateTemplate(selectedTemplate, BASE_SCALE);
  }, [selectedTemplate, generateTemplate, transitionMode]);

  // ── Persist session to localStorage ──
  useEffect(() => {
    saveSession({
      selectedTemplate,
      selectedColor,
      customColor,
      transitionMode,
      showPanel,
    });
  }, [selectedTemplate, selectedColor, customColor, transitionMode, showPanel]);

  // ─────────────────────────────── RENDER ───────────────────────────────
  return (
    <div className="w-screen h-screen relative overflow-hidden bg-[#030308]">
      <div ref={containerRef} className="absolute inset-0" style={{ cursor: 'grab' }} />

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-white/60 text-lg font-light animate-pulse">Deeltjes laden...</div>
        </div>
      )}

      {loadError && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-white/60 text-lg font-light mb-2">Kan deeltjessysteem niet laden</div>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white/70 text-sm hover:bg-white/15 transition-all"
            >
              Opnieuw proberen
            </button>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none">
        <div className="flex items-center justify-between px-3 sm:px-5 py-3 sm:py-4">
          <div className="pointer-events-auto">
            <h1 className="text-white/90 text-sm sm:text-lg font-light tracking-wider">Cosmos Particles</h1>
            <p className="text-white/40 text-[10px] sm:text-xs mt-0.5 hidden sm:block">Interactief 3D deeltjessysteem</p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 pointer-events-auto">
            <button
              onClick={() => setCameraEnabled(!cameraEnabled)}
              className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-[10px] sm:text-xs font-medium transition-all duration-300 backdrop-blur-xl border ${
                cameraEnabled
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 shadow-lg shadow-emerald-500/10'
                  : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:border-white/20'
              }`}
            >
              {cameraEnabled ? '\u25CF Camera' : '\u25CB Camera'}
            </button>
            <button
              onClick={() => setShowPanel(!showPanel)}
              className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center backdrop-blur-xl border transition-all duration-300 ${
                showPanel ? 'bg-white/10 border-white/20 text-white/80' : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="2" width="6" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
                <rect x="9" y="2" width="6" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
                <rect x="1" y="9" width="6" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
                <rect x="9" y="9" width="6" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Side panel - responsive: bottom sheet on mobile, side panel on desktop */}
      <div className={`
        fixed sm:absolute z-20 transition-all duration-500 ease-out
        bottom-12 left-0 right-0 sm:bottom-auto sm:left-auto
        sm:top-20 sm:right-4 sm:w-64
        ${showPanel
          ? 'translate-y-0 sm:translate-y-0 sm:translate-x-0 opacity-100'
          : 'translate-y-full sm:translate-y-0 sm:translate-x-72 opacity-0 pointer-events-none'
        }
      `}>
        {/* Mobile drag handle */}
        <div className="sm:hidden flex justify-center pt-2 pb-1 bg-black/60 backdrop-blur-2xl rounded-t-2xl border-t border-x border-white/10">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        <div className="sm:contents overflow-y-auto max-h-[55vh] sm:max-h-none bg-black/60 sm:bg-transparent backdrop-blur-2xl sm:backdrop-blur-none p-3 sm:p-0 space-y-3 border-x sm:border-0 border-white/10">
          {/* Templates */}
          <div className="sm:bg-black/40 sm:backdrop-blur-2xl border-0 sm:border border-white/10 rounded-xl p-0 sm:p-4">
            <h3 className="text-white/70 text-xs font-medium uppercase tracking-wider mb-3">Vorm</h3>
            <div className="grid grid-cols-5 sm:grid-cols-3 gap-1.5 sm:gap-2">
              {PARTICLE_TEMPLATES.map((template, idx) => (
                <button
                  key={template.id}
                  onClick={() => handleTemplateChange(template.id)}
                  disabled={isTransitioning}
                  className={`flex flex-col items-center gap-0.5 sm:gap-1 p-1.5 sm:p-2 rounded-lg transition-all duration-200 ${
                    isTransitioning ? 'opacity-50 cursor-wait' : ''
                  } ${selectedTemplate === template.id
                    ? 'bg-white/15 border border-white/30 shadow-lg'
                    : 'bg-white/5 border border-transparent hover:bg-white/10 hover:border-white/15'
                  }`}
                >
                  <span className="text-base sm:text-lg">{template.icon}</span>
                  <span className="text-[8px] sm:text-[10px] text-white/60 hidden sm:block">{template.name}</span>
                  <span className="text-[8px] text-white/30 sm:hidden">{idx + 1}</span>
              </button>
            ))}
          </div>
          </div>

          {/* Transition mode */}
          <div className="sm:bg-black/40 sm:backdrop-blur-2xl border-0 sm:border border-white/10 rounded-xl p-0 sm:p-4">
            <h3 className="text-white/70 text-xs font-medium uppercase tracking-wider mb-3">Transitie</h3>
          <div className="flex gap-2">
            {TRANSITION_MODES.map((mode) => (
              <button
                key={mode.id}
                onClick={() => setTransitionMode(mode.id)}
                className={`flex-1 flex flex-col items-center gap-1 py-2 px-1 rounded-lg transition-all duration-200 ${
                  transitionMode === mode.id
                    ? 'bg-white/15 border border-white/30'
                    : 'bg-white/5 border border-transparent hover:bg-white/10'
                }`}
              >
                <span className="text-sm">{mode.icon}</span>
                <span className="text-[10px] text-white/60">{mode.name}</span>
              </button>
            ))}
          </div>
          </div>

          {/* Colors */}
          <div className="sm:bg-black/40 sm:backdrop-blur-2xl border-0 sm:border border-white/10 rounded-xl p-0 sm:p-4">
            <h3 className="text-white/70 text-xs font-medium uppercase tracking-wider mb-3">Kleur</h3>
            <div className="grid grid-cols-8 sm:grid-cols-4 gap-2 mb-3">
            {PRESET_COLORS.map((color) => (
              <button
                key={color.hex}
                onClick={() => handleColorChange(color)}
                className={`w-full aspect-square rounded-lg transition-all duration-200 ${
                  selectedColor.hex === color.hex
                    ? 'ring-2 ring-white/50 ring-offset-1 ring-offset-black/50 scale-110'
                    : 'hover:scale-105'
                }`}
                style={{ backgroundColor: color.hex }}
                title={color.name}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={customColor}
              onChange={(e) => handleCustomColorChange(e.target.value)}
              className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border border-white/10"
            />
            <input
              type="text"
              value={customColor}
              onChange={(e) => {
                if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) handleCustomColorChange(e.target.value);
                setCustomColor(e.target.value);
              }}
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/70 font-mono"
              placeholder="#FFD700"
            />
          </div>
          </div>

          {/* Gesture info */}
          {cameraEnabled && (
            <div className="sm:bg-black/40 sm:backdrop-blur-2xl border-0 sm:border border-white/10 rounded-xl p-0 sm:p-4">
              <h3 className="text-white/70 text-xs font-medium uppercase tracking-wider mb-2">Gebaar Detectie</h3>
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-2 h-2 rounded-full ${gesture.isActive ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`} />
              <span className="text-xs text-white/50">{gesture.isActive ? 'Actief' : 'Initialiseren...'}</span>
            </div>
            {gesture.handsDetected > 0 && (
              <>
                <div className="text-xs text-white/40 mb-2">
                  {gesture.handsDetected} hand{gesture.handsDetected > 1 ? 'en' : ''} gedetecteerd
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] text-white/40">
                    <span>Schaal</span>
                    <span>{Math.round(gestureScaleRef.current * 100)}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-200"
                      style={{ width: `${Math.min(100, gestureScaleRef.current * 50)}%` }}
                    />
                  </div>
                </div>
              </>
            )}
            {gesture.handsDetected === 0 && gesture.isActive && (
              <p className="text-[10px] text-white/30 leading-relaxed">
                Beweeg je handen voor de camera. Spreid je handen om de deeltjes te vergroten.
                Sluit je vuisten om ze samen te trekken.
              </p>
            )}
            </div>
          )}
        </div>
      </div>

      {/* Camera preview thumbnail */}
      {cameraEnabled && gesture.isActive && showCameraPreview && (
        <div className="absolute bottom-16 left-3 sm:left-5 z-20 group">
          <div className="relative rounded-xl overflow-hidden border border-white/15 shadow-2xl shadow-black/50 bg-black/50">
            <canvas
              ref={previewCanvasRef}
              width={192}
              height={144}
              className="block w-36 h-[108px] sm:w-48 sm:h-36"
            />
            {/* Status indicator */}
            <div className="absolute top-1.5 left-1.5 flex items-center gap-1">
              <div className={`w-1.5 h-1.5 rounded-full ${gesture.handsDetected > 0 ? 'bg-emerald-400' : 'bg-amber-400'} animate-pulse`} />
              <span className="text-[8px] text-white/60 font-medium">
                {gesture.handsDetected > 0 ? `${gesture.handsDetected} hand${gesture.handsDetected > 1 ? 'en' : ''}` : 'Zoeken...'}
              </span>
            </div>
            {/* Close/hide button */}
            <button
              onClick={() => setShowCameraPreview(false)}
              className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/50 text-white/40 hover:text-white/80 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
            >
              &times;
            </button>
          </div>
        </div>
      )}

      {/* Minimized camera preview toggle */}
      {cameraEnabled && gesture.isActive && !showCameraPreview && (
        <button
          onClick={() => setShowCameraPreview(true)}
          className="absolute bottom-16 left-3 sm:left-5 z-20 px-2.5 py-1.5 rounded-lg bg-black/40 backdrop-blur-xl border border-white/10 text-white/40 hover:text-white/70 hover:border-white/20 transition-all text-[10px]"
        >
          {gesture.handsDetected > 0 ? '\u25CF' : '\u25CB'} Camera
        </button>
      )}

      {/* Bottom status bar */}
      <div className="absolute bottom-14 left-0 right-0 z-10 pointer-events-none">
        <div className="flex items-center justify-between px-3 sm:px-5 py-3 sm:py-4 gap-2">
          <div className="text-white/30 text-[10px] sm:text-xs whitespace-nowrap">
            {PARTICLE_COUNT.toLocaleString()} deeltjes {'\u2022'} {PARTICLE_TEMPLATES.find(t => t.id === selectedTemplate)?.name}
            {isTransitioning && (
              <span className="ml-2 text-amber-400/60 animate-pulse">{'\u2022'} transitie...</span>
            )}
          </div>
          {gestureInfo && (
            <div className="bg-black/40 backdrop-blur-xl border border-white/10 rounded-full px-2 sm:px-3 py-1 sm:py-1.5 hidden sm:block">
              <span className="text-white/50 text-xs">{gestureInfo}</span>
            </div>
          )}
          <div className="text-white/30 text-[10px] sm:text-xs whitespace-nowrap hidden sm:block">Drag om te roteren {'\u2022'} Scroll om te zoomen</div>
        </div>
      </div>

      {/* Screenshot button */}
      <button
        onClick={captureScreenshot}
        className="absolute top-14 sm:top-5 left-3 sm:left-5 z-30 flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg
          bg-black/30 backdrop-blur-xl border border-white/10 text-white/40
          hover:bg-black/40 hover:text-white/70 hover:border-white/20
          transition-all duration-200 group"
        title="Screenshot opslaan (S)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="group-hover:scale-110 transition-transform">
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="1" fill="currentColor" />
        </svg>
        <span className="text-[10px] sm:text-xs">Capture</span>
      </button>

      {/* Keyboard shortcuts hint (desktop only) */}
      <div className="absolute bottom-16 right-3 sm:right-5 z-10 hidden sm:block">
        <div className="bg-black/30 backdrop-blur-xl border border-white/10 rounded-lg px-3 py-2 text-[9px] text-white/20 space-y-0.5 hover:text-white/40 transition-colors">
          <div><kbd className="px-1 py-0.5 bg-white/5 rounded text-[8px]">1</kbd>-<kbd className="px-1 py-0.5 bg-white/5 rounded text-[8px]">9</kbd> Vormen</div>
          <div><kbd className="px-1 py-0.5 bg-white/5 rounded text-[8px]">Space</kbd> Puls</div>
          <div><kbd className="px-1 py-0.5 bg-white/5 rounded text-[8px]">F</kbd> Volledig scherm</div>
          <div><kbd className="px-1 py-0.5 bg-white/5 rounded text-[8px]">C</kbd> Camera {'\u2022'} <kbd className="px-1 py-0.5 bg-white/5 rounded text-[8px]">S</kbd> Screenshot</div>
          <div><kbd className="px-1 py-0.5 bg-white/5 rounded text-[8px]">P</kbd> Paneel {'\u2022'} <kbd className="px-1 py-0.5 bg-white/5 rounded text-[8px]">H</kbd> Preview</div>
        </div>
      </div>

      {/* Flash overlay for screenshot */}
      {captureFlash && (
        <div className="absolute inset-0 z-40 bg-white/20 pointer-events-none animate-ping" style={{ animationDuration: '0.3s', animationIterationCount: 1 }} />
      )}
    </div>
  );
}

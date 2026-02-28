'use client';

import React, { useEffect, useRef } from 'react';
import Link from 'next/link';

/* ==========================================================
   Digital Data Explosion — Design 2
   Three.js WebGL tunnel of glowing cyan digits with
   hand-tracking, bloom post-processing and gestures.
   Uses custom vertex/fragment shaders with a 16×16
   digit texture atlas and per-instance UV offsets.
   ========================================================== */

const CONFIG = {
  PARTICLE_COUNT: 5000,
  DIGIT_SIZE:     0.15,
  TUNNEL_RADIUS:  3.0,
  TUNNEL_SPREAD:  2.0,
  Z_FAR:          -100,
  Z_CAMERA:       5,
  BASE_SPEED:     0.12,
  CAM_LERP:       0.035,
  BLOOM_DEFAULT:  2.5,
  BLOOM_WARP:     5.0,
  BLOOM_BANG:     15.0,
  BLOOM_RADIUS:   0.5,
  BLOOM_THRESH:   0.1,
  ATLAS_GRID:     16,
  ATLAS_CELL:     64,
};

/* ---------- Custom shaders ---------- */

const vertexShader = /* glsl */ `
  attribute vec2 instanceUV;
  varying vec2 vUv;
  varying float vDepthFade;

  void main() {
    // 16x16 atlas grid: each cell is 1/16th of the texture
    vec2 size = vec2(1.0 / ${CONFIG.ATLAS_GRID}.0);
    vUv = uv * size + (instanceUV * size);

    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Depth fade: far particles dimmer, close particles brighter
    vDepthFade = clamp(1.0 - (-mvPosition.z) / 105.0, 0.03, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uTexture;
  uniform vec3 uColor;

  varying vec2 vUv;
  varying float vDepthFade;

  void main() {
    vec4 texColor = texture2D(uTexture, vUv);
    if (texColor.a < 0.1) discard;

    // Apply cyan colour tint and depth fade
    vec3 color = uColor * texColor.rgb;
    float alpha = texColor.a * vDepthFade;
    gl_FragColor = vec4(color, alpha);
  }
`;

/* ---------- Types ---------- */

interface Particle {
  x: number; y: number; z: number;
  tunnelAngle: number; tunnelR: number;
  spd: number; sx: number; sy: number;
  vx: number; vy: number; vz: number;
}

/* ==========================================================
   COMPONENT
   ========================================================== */

export default function DataExplosion() {
  const containerRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;

    async function init() {
      const THREE = await import('three');
      const { EffectComposer } = await import('three/addons/postprocessing/EffectComposer.js' as string);
      const { RenderPass }     = await import('three/addons/postprocessing/RenderPass.js' as string);
      const { UnrealBloomPass } = await import('three/addons/postprocessing/UnrealBloomPass.js' as string);
      if (disposed) return;

      /* ---- STATE ---- */
      let exploded = false;
      let speedMult = 1.0;
      let camTX = 0, camTY = 0;
      let prevPalmDist = 0;
      let bloomTweening = false;
      let animId = 0;

      /* ---- DIGIT TEXTURE ATLAS (16×16 grid) ---- */
      function createDigitAtlas() {
        const { ATLAS_GRID: g, ATLAS_CELL: cell } = CONFIG;
        const c   = document.createElement('canvas');
        c.width   = cell * g;
        c.height  = cell * g;
        const ctx = c.getContext('2d')!;
        ctx.clearRect(0, 0, c.width, c.height);
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle    = '#ffffff';
        for (let row = 0; row < g; row++) {
          for (let col = 0; col < g; col++) {
            const digit = Math.floor(Math.random() * 10);
            const size  = 28 + Math.random() * 20;
            ctx.font = `bold ${size}px "Courier New", monospace`;
            ctx.fillText(String(digit), col * cell + cell / 2, row * cell + cell / 2);
          }
        }
        const tex = new THREE.CanvasTexture(c);
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        return tex;
      }

      /* ---- SCENE / CAMERA / RENDERER ---- */
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x000000);

      const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 200);
      camera.position.set(0, 0, CONFIG.Z_CAMERA);

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(innerWidth, innerHeight);
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      containerRef.current!.appendChild(renderer.domElement);

      /* ---- BLOOM POST-PROCESSING ---- */
      const composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      const bloom = new UnrealBloomPass(
        new THREE.Vector2(innerWidth, innerHeight),
        CONFIG.BLOOM_DEFAULT, CONFIG.BLOOM_RADIUS, CONFIG.BLOOM_THRESH
      );
      composer.addPass(bloom);

      /* ---- PARTICLE DATA ---- */
      const atlas = createDigitAtlas();

      function makeTunnelPos() {
        const angle  = Math.random() * Math.PI * 2;
        const onWall = Math.random() < 0.7;
        const r = onWall
          ? CONFIG.TUNNEL_RADIUS + (Math.random() - 0.5) * CONFIG.TUNNEL_SPREAD
          : Math.random() * (CONFIG.TUNNEL_RADIUS - 0.5);
        return { angle, r, x: Math.cos(angle) * r, y: Math.sin(angle) * r };
      }

      const particles: Particle[] = [];
      for (let i = 0; i < CONFIG.PARTICLE_COUNT; i++) {
        const t = makeTunnelPos();
        const s = 0.10 + Math.random() * 0.15;
        particles.push({
          x: t.x, y: t.y,
          z: CONFIG.Z_FAR + Math.random() * (CONFIG.Z_CAMERA - CONFIG.Z_FAR),
          tunnelAngle: t.angle, tunnelR: t.r,
          spd: 0.7 + Math.random() * 0.6,
          sx: s, sy: s * 1.3,
          vx: 0, vy: 0, vz: 0,
        });
      }

      /* ---- INSTANCED MESH  (custom ShaderMaterial) ----
         Uses createParticles() pattern with PlaneGeometry sized
         by DIGIT_SIZE and per-instance UV into the 16×16 atlas. */

      const instanceUV = new Float32Array(CONFIG.PARTICLE_COUNT * 2);

      function createParticles() {
        const geo = new THREE.PlaneGeometry(
          CONFIG.DIGIT_SIZE,
          CONFIG.DIGIT_SIZE * 1.4
        );

        // Per-instance UV: column (0-15) and row (0-15)
        for (let i = 0; i < CONFIG.PARTICLE_COUNT; i++) {
          instanceUV[i * 2]     = Math.floor(Math.random() * 16);  // Column
          instanceUV[i * 2 + 1] = Math.floor(Math.random() * 16);  // Row
        }
        geo.setAttribute(
          'instanceUV',
          new THREE.InstancedBufferAttribute(instanceUV, 2)
        );

        const mat = new THREE.ShaderMaterial({
          uniforms: {
            uTexture: { value: atlas },
            uColor:   { value: new THREE.Color(0x00f2ff) },
          },
          vertexShader,
          fragmentShader,
          transparent: true,
          blending:    THREE.AdditiveBlending,
          depthWrite:  false,
          side:        THREE.DoubleSide,
        });

        const instancedMesh = new THREE.InstancedMesh(geo, mat, CONFIG.PARTICLE_COUNT);
        return { geo, mat, instancedMesh };
      }

      const { geo, mat, instancedMesh: mesh } = createParticles();

      const _dummy = new THREE.Object3D();
      for (let i = 0; i < CONFIG.PARTICLE_COUNT; i++) {
        const p = particles[i];
        _dummy.position.set(p.x, p.y, p.z);
        _dummy.updateMatrix();
        mesh.setMatrixAt(i, _dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      scene.add(mesh);

      /* ---- HAND TRACKING ---- */
      let handCleanup: (() => void) | null = null;

      function palmDist(lm: any[]) {
        const w = lm[0]; let s = 0;
        for (const i of [4, 8, 12, 16, 20])
          s += Math.hypot(lm[i].x - w.x, lm[i].y - w.y);
        return s / 5;
      }

      function isPinch(lm: any[]) {
        return Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y, lm[4].z - lm[8].z) < 0.05;
      }

      function onHands(results: any) {
        const lms = results.multiHandLandmarks;
        if (!lms || !lms.length) {
          camTX *= 0.95; camTY *= 0.95;
          speedMult += (1 - speedMult) * 0.04;
          if (!exploded && !bloomTweening)
            bloom.strength += (CONFIG.BLOOM_DEFAULT - bloom.strength) * 0.04;
          return;
        }
        const lm = lms[0];

        /* Navigation: index fingertip (landmark 8) */
        camTX =  (lm[8].x - 0.5) * 8;
        camTY = -(lm[8].y - 0.5) * 6;

        /* Pinch → warp speed */
        if (isPinch(lm)) {
          speedMult += (2.0 - speedMult) * 0.12;
          if (!bloomTweening) bloom.strength += (CONFIG.BLOOM_WARP - bloom.strength) * 0.1;
        } else {
          speedMult += (1.0 - speedMult) * 0.05;
          if (!exploded && !bloomTweening)
            bloom.strength += (CONFIG.BLOOM_DEFAULT - bloom.strength) * 0.05;
        }

        /* Big Bang & Reset */
        const pd = palmDist(lm);
        if (!exploded && pd > 0.4 && prevPalmDist < 0.3) triggerBang();
        if (exploded && pd < 0.2) resetTunnel();
        prevPalmDist = pd;
      }

      async function triggerBang() {
        exploded = true;
        bloomTweening = true;
        for (const p of particles) {
          const a   = Math.random() * Math.PI * 2;
          const phi = Math.acos(2 * Math.random() - 1);
          const s   = 0.6 + Math.random() * 2.5;
          p.vx = Math.sin(phi) * Math.cos(a) * s;
          p.vy = Math.sin(phi) * Math.sin(a) * s;
          p.vz = Math.cos(phi) * s;
        }
        bloom.strength = CONFIG.BLOOM_BANG;
        const { gsap } = await import('gsap' as string);
        gsap.to(bloom, {
          strength: CONFIG.BLOOM_DEFAULT,
          duration: 0.5,
          ease: 'power2.out',
          onComplete: () => { bloomTweening = false; },
        });
      }

      function resetTunnel() {
        exploded = false;
        for (const p of particles) {
          p.vx = p.vy = p.vz = 0;
          const t = makeTunnelPos();
          p.tunnelAngle = t.angle;
          p.tunnelR = t.r;
        }
      }

      /* ---- Init MediaPipe ---- */
      (async () => {
        try {
          const { Hands }  = await import('@mediapipe/hands');
          const { Camera } = await import('@mediapipe/camera_utils');
          if (disposed) return;

          const video = document.createElement('video');
          video.setAttribute('playsinline', '');
          video.muted = true;
          video.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none';
          document.body.appendChild(video);

          const hands = new Hands({
            locateFile: (f: string) =>
              `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${f}`,
          });
          hands.setOptions({
            maxNumHands: 1, modelComplexity: 1,
            minDetectionConfidence: 0.5, minTrackingConfidence: 0.4,
          });
          hands.onResults(onHands);

          const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480, facingMode: 'user' },
          });
          video.srcObject = stream;
          await video.play();

          const cam = new Camera(video, {
            onFrame: async () => { if (!disposed) await hands.send({ image: video }); },
            width: 640, height: 480,
          });
          await cam.start();

          handCleanup = () => {
            cam.stop();
            stream.getTracks().forEach(t => t.stop());
            hands.close();
            video.remove();
          };
        } catch (e: any) {
          console.warn('Hand tracking unavailable:', e.message);
        }
      })();

      /* ---- ANIMATION LOOP ---- */
      const clock = new THREE.Clock();

      function loop() {
        if (disposed) return;
        animId = requestAnimationFrame(loop);
        const elapsed = clock.getElapsedTime();

        /* Smooth camera + subtle ambient drift */
        const autoX = Math.sin(elapsed * 0.2) * 0.3;
        const autoY = Math.cos(elapsed * 0.15) * 0.2;
        camera.position.x += (camTX + autoX - camera.position.x) * CONFIG.CAM_LERP;
        camera.position.y += (camTY + autoY - camera.position.y) * CONFIG.CAM_LERP;
        camera.lookAt(camera.position.x * 0.3, camera.position.y * 0.3, -50);

        /* Update particles */
        let uvDirty = false;
        for (let i = 0; i < CONFIG.PARTICLE_COUNT; i++) {
          const p = particles[i];

          if (exploded) {
            p.x += p.vx; p.y += p.vy; p.z += p.vz;
            p.vx *= 0.993; p.vy *= 0.993; p.vz *= 0.993;
          } else {
            const tx = Math.cos(p.tunnelAngle) * p.tunnelR;
            const ty = Math.sin(p.tunnelAngle) * p.tunnelR;
            p.x += (tx - p.x) * 0.04;
            p.y += (ty - p.y) * 0.04;
            p.z += CONFIG.BASE_SPEED * p.spd * speedMult;

            if (p.z > CONFIG.Z_CAMERA) {
              p.z = CONFIG.Z_FAR + Math.random() * 5;
              const t = makeTunnelPos();
              p.tunnelAngle = t.angle; p.tunnelR = t.r;
              p.x = t.x; p.y = t.y;
              instanceUV[i * 2]     = Math.floor(Math.random() * CONFIG.ATLAS_GRID);
              instanceUV[i * 2 + 1] = Math.floor(Math.random() * CONFIG.ATLAS_GRID);
              uvDirty = true;
            }
          }

          _dummy.position.set(p.x, p.y, p.z);
          _dummy.updateMatrix();
          mesh.setMatrixAt(i, _dummy.matrix);
        }

        mesh.instanceMatrix.needsUpdate = true;
        if (uvDirty) mesh.geometry.attributes.instanceUV.needsUpdate = true;
        composer.render();
      }
      animId = requestAnimationFrame(loop);

      /* ---- RESIZE ---- */
      function onResize() {
        camera.aspect = innerWidth / innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(innerWidth, innerHeight);
        composer.setSize(innerWidth, innerHeight);
      }
      addEventListener('resize', onResize);

      /* ---- CLEANUP ---- */
      cleanupRef.current = () => {
        disposed = true;
        cancelAnimationFrame(animId);
        removeEventListener('resize', onResize);
        handCleanup?.();
        renderer.dispose();
        geo.dispose();
        mat.dispose();
        atlas.dispose();
        mesh.dispose();
        if (containerRef.current?.contains(renderer.domElement)) {
          containerRef.current.removeChild(renderer.domElement);
        }
      };
    }

    init();
    return () => { cleanupRef.current?.(); };
  }, []);

  const navStyle: React.CSSProperties = {
    display: 'inline-block', padding: '6px 16px', fontSize: 12,
    letterSpacing: '0.15em', textTransform: 'uppercase',
    color: 'rgba(0, 242, 255, 0.6)', border: '1px solid rgba(0, 242, 255, 0.2)',
    borderRadius: 9999, textDecoration: 'none', transition: 'all 0.3s',
  };

  return (
    <>
      {/* Navigation */}
      <div style={{
        position: 'fixed', top: 24, left: '50%', transform: 'translateX(-50%)',
        zIndex: 50, textAlign: 'center', display: 'flex', gap: 12,
      }}>
        <Link href="/" style={navStyle}>&#8592; Cosmos</Link>
        <Link href="/mobile-sphere" style={navStyle}>Mobile Sphere &#8594;</Link>
      </div>

      {/* WebGL container */}
      <div
        ref={containerRef}
        style={{
          position: 'fixed', inset: 0,
          width: '100vw', height: '100vh',
          background: '#000000', overflow: 'hidden',
        }}
      />
    </>
  );
}

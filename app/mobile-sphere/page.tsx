'use client';

import React, { useEffect, useRef } from 'react';
import Link from 'next/link';

/* ==========================================================
   Mobile Data Sphere — Design 3 (Enhanced)
   Interactive 3D sphere of glowing digits with hand-tracking,
   touch/mouse fallback, bloom, and explosion/reset gestures.
   Optimised for mobile with 10 000 particles.

   Visual quality upgrades (Cosmos-inspired):
   • Per-particle size variation
   • King-like Gaussian distribution (dense core, sparse halo)
   • 5 blue-adjacent colour populations for 3D depth
   • Slow heartbeat pulse (lub-dub pattern)
   • High-res 2048px digit atlas for sharp text
   ========================================================== */

const CONFIG = {
  GRID_SIZE:            4,
  SPHERE_RADIUS:        5,
  CORE_R:               1.8,
  MID_R:                4.0,
  OUTER_R:              7.0,
  TIDAL_R:              8.5,
  PALM_OPEN_THRESHOLD:  0.35,
  FIST_THRESHOLD:       0.15,
  BLOOM_DEFAULT:        1.8,
  BLOOM_BANG:           15.0,
  BLOOM_AFTER:          2.2,
  HEARTBEAT_CYCLE:      2.8,
};

export default function MobileSphere() {
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

      const PARTICLE_COUNT = innerWidth < 768 ? 10000 : 12000;

      /* ---- STATE ---- */
      let isExploded = false;
      let inputX = 0, inputY = 0;
      let targetRotX = 0, targetRotY = 0;
      let bloomTarget = CONFIG.BLOOM_DEFAULT;
      let prevPalmSpread = 0;

      /* ---- STATUS UI ---- */
      const uiEl = document.getElementById('sphere-ui')!;
      const gestureEl = document.getElementById('sphere-gesture')!;

      /* ---- HEARTBEAT FUNCTION ---- */
      function heartbeat(t: number): number {
        const cycle = t % CONFIG.HEARTBEAT_CYCLE;
        if (cycle < 0.12)
          return Math.sin(cycle / 0.12 * Math.PI) * 0.06;
        if (cycle < 0.35) return 0;
        if (cycle < 0.47)
          return Math.sin((cycle - 0.35) / 0.12 * Math.PI) * 0.03;
        return 0;
      }

      /* ---- GAUSSIAN RANDOM (Box-Muller) ---- */
      function gaussRandom(): number {
        return Math.sqrt(-2 * Math.log(Math.random())) *
               Math.cos(2 * Math.PI * Math.random());
      }

      /* ---- COLOUR PALETTE (5 blue variations) ---- */
      function getParticleColor(): [number, number, number] {
        const roll = Math.random();
        if (roll < 0.30) return [0.0,  0.95, 1.0];              // Cyaan
        if (roll < 0.55) return [0.35 + Math.random() * 0.10,   // Lichtblauw
                                 0.70 + Math.random() * 0.10,
                                 1.0];
        if (roll < 0.75) return [0.10 + Math.random() * 0.10,   // Diepblauw
                                 0.40 + Math.random() * 0.15,
                                 1.0];
        if (roll < 0.90) return [0.0,                            // Teal
                                 0.75 + Math.random() * 0.10,
                                 0.80 + Math.random() * 0.10];
        return [0.70 + Math.random() * 0.15,                     // Wit-blauw
                0.88 + Math.random() * 0.07,
                1.0];
      }

      /* ---- TEXTURE ATLAS (2048px, 4×4 grid, sharp digits) ---- */
      function createAtlas() {
        const c = document.createElement('canvas');
        c.width = 2048; c.height = 2048;
        const ctx = c.getContext('2d')!;
        const step = 2048 / CONFIG.GRID_SIZE;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let i = 0; i < 10; i++) {
          const x = (i % CONFIG.GRID_SIZE) * step + step / 2;
          const y = Math.floor(i / CONFIG.GRID_SIZE) * step + step / 2;
          const fontSize = 240 + Math.random() * 80;
          ctx.font = `bold ${fontSize}px "Courier New", monospace`;
          // Outline for definition
          ctx.strokeStyle = 'rgba(255,255,255,0.3)';
          ctx.lineWidth = 3;
          ctx.strokeText(i.toString(), x, y);
          // Fill
          ctx.fillStyle = 'white';
          ctx.fillText(i.toString(), x, y);
        }
        const tex = new THREE.CanvasTexture(c);
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        tex.anisotropy = 4;
        return tex;
      }

      /* ---- SCENE / CAMERA / RENDERER ---- */
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1000);
      camera.position.z = 12;

      const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
      renderer.setSize(innerWidth, innerHeight);
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      containerRef.current!.appendChild(renderer.domElement);

      /* ---- BLOOM (lower default for sharper digits) ---- */
      const composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(innerWidth, innerHeight), CONFIG.BLOOM_DEFAULT, 0.4, 0.15
      );
      composer.addPass(bloomPass);

      /* ---- PARTICLES (King-like sphere distribution) ---- */
      const atlasTexture = createAtlas();
      atlasTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

      const geometry = new THREE.PlaneGeometry(1, 1);
      const instanceUV = new Float32Array(PARTICLE_COUNT * 2);

      interface SphereParticle {
        x: number; y: number; z: number;
        origX: number; origY: number; origZ: number;
        vx: number; vy: number; vz: number;
        scale: number;
        phase: number;
      }

      const particles: SphereParticle[] = [];
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const digit = Math.floor(Math.random() * 10);
        instanceUV[i * 2]     = (digit % CONFIG.GRID_SIZE) / CONFIG.GRID_SIZE;
        instanceUV[i * 2 + 1] = Math.floor(digit / CONFIG.GRID_SIZE) / CONFIG.GRID_SIZE;

        // King-like distribution: dense core, sparse halo
        const pop = Math.random();
        let r: number;
        if (pop < 0.50)      r = Math.abs(gaussRandom() * CONFIG.CORE_R);
        else if (pop < 0.80) r = Math.abs(gaussRandom() * CONFIG.MID_R);
        else                 r = Math.abs(gaussRandom() * CONFIG.OUTER_R);
        r = Math.min(r, CONFIG.TIDAL_R);

        const theta = Math.random() * 2 * Math.PI;
        const phi   = Math.acos(Math.random() * 2 - 1);

        const x = r * Math.sin(phi) * Math.cos(theta);
        const y = r * Math.sin(phi) * Math.sin(theta);
        const z = r * Math.cos(phi);
        const len = Math.sqrt(x * x + y * y + z * z) || 1;
        const ef = 0.5 + Math.random() * 1.5;

        particles.push({
          x, y, z, origX: x, origY: y, origZ: z,
          vx: (x / len) * ef, vy: (y / len) * ef, vz: (z / len) * ef,
          scale: 0.08 + Math.random() * 0.25,
          phase: Math.random() * 0.5,
        });
      }

      geometry.setAttribute('instanceUV', new THREE.InstancedBufferAttribute(instanceUV, 2));

      /* ---- MATERIAL + onBeforeCompile (vInstanceUV) ---- */
      const material = new THREE.MeshBasicMaterial({
        map: atlasTexture, transparent: true,
        blending: THREE.AdditiveBlending,
        color: 0xffffff,
        side: THREE.DoubleSide,
      });

      material.onBeforeCompile = (shader: any) => {
        shader.vertexShader = `attribute vec2 instanceUV; varying vec2 vInstanceUV; ${shader.vertexShader}`
          .replace('#include <uv_vertex>', `vInstanceUV = uv / float(${CONFIG.GRID_SIZE}) + instanceUV;`);
        shader.fragmentShader = `varying vec2 vInstanceUV; ${shader.fragmentShader}`
          .replace('#include <map_fragment>', 'vec4 texelColor = texture2D( map, vInstanceUV ); diffuseColor *= texelColor;');
      };

      const iMesh = new THREE.InstancedMesh(geometry, material, PARTICLE_COUNT);

      // Per-instance colour (5 blue populations for 3D depth)
      const tmpColor = new THREE.Color();
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const [r, g, b] = getParticleColor();
        tmpColor.setRGB(r, g, b);
        iMesh.setColorAt(i, tmpColor);
      }
      iMesh.instanceColor!.needsUpdate = true;

      scene.add(iMesh);

      /* ---- EXPLOSION / RESET ---- */
      function doExplosion() {
        if (isExploded) return;
        isExploded = true;
        bloomTarget = CONFIG.BLOOM_BANG;
        uiEl.innerText = 'System: CORE_BREACH_DETECTED';
        gestureEl.innerText = 'BIG BANG';
        gestureEl.classList.add('active');
        import('gsap' as string).then(({ gsap }) => {
          gsap.to(bloomPass, {
            strength: CONFIG.BLOOM_BANG, duration: 0.1,
            onComplete: () => { bloomTarget = CONFIG.BLOOM_AFTER; },
          });
        });
      }

      function doReset() {
        if (!isExploded) return;
        isExploded = false;
        bloomTarget = CONFIG.BLOOM_DEFAULT;
        uiEl.innerText = 'System: Re-Sequencing_Data';
        gestureEl.innerText = 'CORE RESETTING';
        gestureEl.classList.add('active');
        setTimeout(() => {
          gestureEl.classList.remove('active');
          if (!isExploded) uiEl.innerText = 'System: Ready | Mode: Interactive_Core';
        }, 1500);
      }

      /* ---- TOUCH / MOUSE FALLBACK ---- */
      let touchStartX = 0, touchStartY = 0;

      function onMouseMove(e: MouseEvent) {
        inputX = (e.clientX / innerWidth - 0.5) * 4;
        inputY = (e.clientY / innerHeight - 0.5) * 4;
      }
      function onClick() { isExploded ? doReset() : doExplosion(); }
      function onTouchStart(e: TouchEvent) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      }
      function onTouchMove(e: TouchEvent) {
        inputX = (e.touches[0].clientX / innerWidth - 0.5) * 4;
        inputY = (e.touches[0].clientY / innerHeight - 0.5) * 4;
      }
      function onTouchEnd(e: TouchEvent) {
        if (Math.abs(e.changedTouches[0].clientX - touchStartX) < 15 &&
            Math.abs(e.changedTouches[0].clientY - touchStartY) < 15) {
          isExploded ? doReset() : doExplosion();
        }
      }

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('click', onClick);
      document.addEventListener('touchstart', onTouchStart);
      document.addEventListener('touchmove', onTouchMove);
      document.addEventListener('touchend', onTouchEnd);

      /* ---- HAND TRACKING ---- */
      let handCleanup: (() => void) | null = null;

      (async () => {
        try {
          const { Hands } = await import('@mediapipe/hands');
          if (disposed) return;

          const video = document.createElement('video');
          video.setAttribute('playsinline', '');
          video.setAttribute('webkit-playsinline', '');
          video.muted = true;
          video.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none';
          document.body.appendChild(video);

          const preview = document.getElementById('sphere-preview') as HTMLVideoElement | null;

          const hands = new Hands({
            locateFile: (f: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${f}`,
          });
          hands.setOptions({
            maxNumHands: 1, modelComplexity: 1,
            minDetectionConfidence: 0.6, minTrackingConfidence: 0.4,
          });

          hands.onResults((results: any) => {
            if (!results.multiHandLandmarks?.length) return;
            const lm = results.multiHandLandmarks[0];
            inputX = (1 - lm[8].x - 0.5) * 4;
            inputY = (lm[8].y - 0.5) * 4;

            const w = lm[0];
            const tips = [lm[4], lm[8], lm[12], lm[16], lm[20]];
            let avg = 0;
            for (const t of tips) avg += Math.sqrt((t.x - w.x) ** 2 + (t.y - w.y) ** 2 + (t.z - w.z) ** 2);
            avg /= tips.length;
            const delta = avg - prevPalmSpread;
            if (avg > CONFIG.PALM_OPEN_THRESHOLD && delta > 0.03 && !isExploded) doExplosion();
            else if (avg < CONFIG.FIST_THRESHOLD && isExploded) doReset();
            prevPalmSpread = avg;
          });

          // Force selfie camera with fallback
          let stream: MediaStream;
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: {
                facingMode: { exact: 'user' },
                width: { ideal: 640, max: 1280 },
                height: { ideal: 480, max: 720 },
                frameRate: { ideal: 30 },
              },
            });
          } catch {
            // Fallback without "exact" for older devices
            stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: 'user', width: 640, height: 480 },
            });
          }

          video.srcObject = stream;
          if (preview) preview.srcObject = stream;
          await video.play();

          async function processVideo() {
            if (!disposed && video.readyState >= 2) await hands.send({ image: video });
            if (!disposed) requestAnimationFrame(processVideo);
          }
          processVideo();

          const loadEl = document.getElementById('sphere-loading');
          if (loadEl) loadEl.classList.add('hidden');

          handCleanup = () => {
            stream.getTracks().forEach(t => t.stop());
            hands.close();
            video.remove();
          };
        } catch (e: any) {
          console.warn('Hand tracking unavailable:', e.message);
          const loadEl = document.getElementById('sphere-loading');
          if (loadEl) {
            loadEl.innerHTML = '<div style="color:#ff4444">CAMERA ACCESS DENIED</div><div style="font-size:12px;margin-top:10px">Touch screen to interact</div>';
            setTimeout(() => loadEl.classList.add('hidden'), 2000);
          }
        }
      })();

      /* ---- ANIMATION LOOP ---- */
      const dummy = new THREE.Object3D();
      const clock = new THREE.Clock();
      let animId = 0;

      function loop() {
        if (disposed) return;
        animId = requestAnimationFrame(loop);
        const time = clock.getElapsedTime();

        // Slow rotation (3x slower than before)
        iMesh.rotation.y += 0.0006;
        iMesh.rotation.x += 0.0003;

        targetRotX += (inputX - targetRotX) * 0.05;
        targetRotY += (inputY - targetRotY) * 0.05;
        scene.rotation.y = targetRotX;
        scene.rotation.x = targetRotY;

        bloomPass.strength += (bloomTarget - bloomPass.strength) * 0.1;

        for (let i = 0; i < PARTICLE_COUNT; i++) {
          const p = particles[i];
          if (isExploded) {
            p.x += p.vx; p.y += p.vy; p.z += p.vz;
          } else {
            // Per-particle heartbeat with phase offset
            const breathScale = 1.0 + heartbeat(time + p.phase);
            p.x += (p.origX * breathScale - p.x) * 0.08;
            p.y += (p.origY * breathScale - p.y) * 0.08;
            p.z += (p.origZ * breathScale - p.z) * 0.08;
          }
          dummy.position.set(p.x, p.y, p.z);
          dummy.scale.set(p.scale, p.scale * 1.2, 1);
          dummy.quaternion.copy(camera.quaternion);
          dummy.updateMatrix();
          iMesh.setMatrixAt(i, dummy.matrix);
        }
        iMesh.instanceMatrix.needsUpdate = true;
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
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('click', onClick);
        document.removeEventListener('touchstart', onTouchStart);
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onTouchEnd);
        handCleanup?.();
        renderer.dispose();
        geometry.dispose();
        material.dispose();
        atlasTexture.dispose();
        iMesh.dispose();
        if (containerRef.current?.contains(renderer.domElement)) {
          containerRef.current.removeChild(renderer.domElement);
        }
      };
    }

    init();
    return () => { cleanupRef.current?.(); };
  }, []);

  return (
    <>
      {/* Loading overlay */}
      <div id="sphere-loading" style={{
        position: 'fixed', inset: 0, background: '#000', zIndex: 1000,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        color: '#00f2ff', transition: 'opacity 0.8s', letterSpacing: '2px', textAlign: 'center', padding: 20,
      }}>
        <div style={{
          width: 40, height: 40, border: '2px solid #00f2ff22', borderTopColor: '#00f2ff',
          borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: 20,
        }} />
        <div>INITIALIZING NEURAL CORE<br />
          <span style={{ fontSize: 10, opacity: 0.5, marginTop: 10, display: 'block' }}>Please allow camera access</span>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }
.hidden{opacity:0!important;pointer-events:none!important}`}</style>
      </div>

      {/* HUD */}
      <div id="sphere-ui" style={{
        position: 'absolute', top: 20, left: 20, color: '#00f2ff',
        pointerEvents: 'none', textTransform: 'uppercase', letterSpacing: 2,
        textShadow: '0 0 10px #00f2ff', fontSize: 14, zIndex: 10,
        fontFamily: '"Courier New", monospace',
      }}>System: Ready</div>

      <div style={{
        position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
        color: '#00f2ff88', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1,
        pointerEvents: 'none', textAlign: 'center', textShadow: '0 0 8px #00f2ff',
        width: '90%', fontFamily: '"Courier New", monospace',
      }}>HAND TRACKING ACTIVE<br />Move Hand/Swipe = Rotate | Open Palm/Tap = Explode</div>

      <div id="sphere-gesture" style={{
        position: 'absolute', top: 20, right: 20, zIndex: 10,
        color: '#00f2ff', fontSize: 14, textTransform: 'uppercase',
        textShadow: '0 0 10px #00f2ff', opacity: 0, transition: 'opacity 0.3s',
        pointerEvents: 'none', letterSpacing: 2, fontFamily: '"Courier New", monospace',
      }}>BIG BANG</div>

      {/* Navigation */}
      <div style={{
        position: 'fixed', top: 24, left: '50%', transform: 'translateX(-50%)',
        zIndex: 50, textAlign: 'center',
      }}>
        <Link
          href="/"
          style={{
            display: 'inline-block', padding: '6px 16px', fontSize: 12,
            letterSpacing: '0.15em', textTransform: 'uppercase' as const,
            color: 'rgba(0, 242, 255, 0.6)', border: '1px solid rgba(0, 242, 255, 0.2)',
            borderRadius: 9999, textDecoration: 'none', transition: 'all 0.3s',
            fontFamily: '"Courier New", monospace',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'rgba(0, 242, 255, 0.9)'; e.currentTarget.style.borderColor = 'rgba(0, 242, 255, 0.5)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(0, 242, 255, 0.6)'; e.currentTarget.style.borderColor = 'rgba(0, 242, 255, 0.2)'; }}
        >
          &#8592; Cosmos
        </Link>
      </div>

      {/* Webcam preview */}
      <video id="sphere-preview" autoPlay playsInline muted style={{
        position: 'absolute', bottom: 70, right: 20, width: 100, height: 75,
        border: '1px solid #00f2ff55', borderRadius: 4, zIndex: 10,
        opacity: 0.5, transform: 'scaleX(-1)', objectFit: 'cover',
      }} />

      {/* WebGL container */}
      <div
        ref={containerRef}
        style={{
          position: 'fixed', inset: 0,
          width: '100vw', height: '100vh',
          background: '#000000', overflow: 'hidden',
          touchAction: 'none',
        }}
      />
    </>
  );
}

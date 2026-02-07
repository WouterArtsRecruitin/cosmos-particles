'use client';

import dynamic from 'next/dynamic';

const ParticleGestureSystem = dynamic(
  () => import('@/components/ParticleGestureSystem'),
  { ssr: false }
);

export default function Home() {
  return (
    <div className="m-0 p-0 w-screen h-screen overflow-hidden">
      <ParticleGestureSystem />
    </div>
  );
}

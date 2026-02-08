'use client';

import dynamic from 'next/dynamic';

const ZenParticles = dynamic(
  () => import('@/components/ZenParticles'),
  { ssr: false }
);

export default function Home() {
  return <ZenParticles />;
}

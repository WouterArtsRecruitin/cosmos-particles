import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Cosmos Particles | Interactief 3D Deeltjessysteem',
  description: 'Real-time interactief 3D deeltjessysteem met handgebaar-detectie, vormtemplates en kleurkiezer',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  )
}

import type { Metadata } from 'next'
import React from 'react'
import { DarkDocument } from '@/components/editor/DarkDocument'

export const metadata: Metadata = {
  title: 'Editor-Demo — Ocuris',
  description: 'Der Ocuris-Editor mit einem Beispielprojekt: Schnitt im Transkript, Untertitel und Bildausschnitt — ohne Anmeldung.',
}

/**
 * Die öffentliche Editor-Demo. Dasselbe dunkle Layout wie der Editor, aber
 * ohne Konto: Das Editor-Layout unter `/dashboard` leitet ohne Anmeldung zum
 * Login, und genau das soll die Landingpage nicht tun.
 */
export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark h-dvh overflow-hidden bg-background text-foreground">
      <DarkDocument />
      {children}
    </div>
  )
}

'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { Clapperboard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'
import { cn } from '@/lib/utils'

const ANCHORS = [
  { href: '#beweis', label: 'Beispiel' },
  { href: '#unterschied', label: 'Unterschied' },
  { href: '#funktionen', label: 'Funktionen' },
  { href: '#preise', label: 'Preise' },
] as const

/**
 * Kopfzeile der Landing-Page.
 *
 * Bleibt beim Scrollen stehen, tritt aber erst dann optisch hervor: Ganz oben
 * ist sie transparent und stört den Hero nicht, sobald gescrollt wird bekommt
 * sie Grund und Kante, damit der Text darunter nicht durchscheint.
 */
export function LandingNav() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={cn(
        'transition-ui sticky top-0 z-50',
        scrolled ? 'border-b bg-background/80 backdrop-blur-md' : 'border-b border-transparent',
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <Clapperboard className="size-5" />
          <span className="text-sm font-semibold tracking-tight">OmegaClip</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {ANCHORS.map((anchor) => (
            <a
              key={anchor.href}
              href={anchor.href}
              className="transition-ui rounded-lg px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-accent/60 hover:text-foreground"
            >
              {anchor.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <Button size="sm" nativeButton={false} render={<Link href="/dashboard" />}>
            Zum Dashboard
          </Button>
        </div>
      </div>
    </header>
  )
}

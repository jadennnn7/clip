import React from 'react'
import type { SocialPlatform } from '@/types/database'

/**
 * Plattform-Symbole.
 *
 * lucide-react hat seine Marken-Icons entfernt, generische Symbole (ein
 * Play-Dreieck für YouTube, eine Kamera für Instagram) sind in einem
 * Publishing-Tool aber nicht eindeutig genug — Nutzer müssen auf einen Blick
 * sehen, welcher Kanal gemeint ist. Deshalb hier vereinfachte Marken-Glyphen.
 *
 * Für die Produktion gilt: die offiziellen Brand Assets der jeweiligen
 * Plattform verwenden, deren Guidelines das vorschreiben.
 */
export function PlatformIcon({
  platform,
  className,
}: {
  platform: SocialPlatform
  className?: string
}) {
  const common = {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
  }

  switch (platform) {
    case 'youtube':
      return (
        <svg {...common}>
          <rect x="2" y="5" width="20" height="14" rx="4" />
          <path d="M10 9.5v5l4.5-2.5z" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'instagram':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'tiktok':
      return (
        <svg {...common}>
          <path d="M14 4v10.5a3.5 3.5 0 1 1-3.5-3.5" />
          <path d="M14 4c.4 2.4 2.1 4 4.5 4.2" />
        </svg>
      )
  }
}

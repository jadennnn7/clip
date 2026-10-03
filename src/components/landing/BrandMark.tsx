import Image from 'next/image'
import { cn } from '@/lib/utils'

/**
 * Logo und Wortmarke der Landing-Page.
 *
 * Dasselbe `/Logo.png` wie in Sidebar, Login und Onboarding — vorher stand
 * hier ein „Ω" im Kreis, und die Marke sah auf der ersten Seite anders aus
 * als überall danach. Die PNG hat viel Rand um das Zeichen; `scale-[1.45]`
 * in einem beschnittenen Rahmen gleicht das aus, genau wie in `AppSidebar`.
 *
 * Ohne `'use client'`, damit Navbar (Client) und Fußzeile (Server) dieselbe
 * Marke benutzen können.
 */
export function BrandMark({
  className,
  eager = false,
}: {
  className?: string
  /** Nur in der Navbar: Dort ist das Logo das Erste, was man sieht. */
  eager?: boolean
}) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <span className="relative size-7 shrink-0 overflow-hidden">
        <Image
          src="/Logo.png"
          alt=""
          width={28}
          height={28}
          loading={eager ? 'eager' : 'lazy'}
          className="size-7 scale-[1.45] object-contain"
        />
      </span>
      <span className="font-display text-[17px] font-semibold tracking-tight">
        Clyp
      </span>
    </span>
  )
}

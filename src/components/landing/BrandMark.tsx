import Image from 'next/image'
import { LOGO } from '@/lib/logo'
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
  large = false,
}: {
  className?: string
  /** Nur in der Navbar: Dort ist das Logo das Erste, was man sieht. */
  eager?: boolean
  /** Navbar: Zeichen und Wortmarke eine Stufe größer als in der Fußzeile. */
  large?: boolean
}) {
  const px = large ? 36 : 28
  return (
    <span
      className={cn('flex items-center', large ? 'gap-1' : 'gap-2', className)}
    >
      <span
        className={cn(
          'relative shrink-0 overflow-hidden',
          large ? 'size-9' : 'size-7',
        )}
      >
        <Image
          src={LOGO}
          alt=""
          width={px}
          height={px}
          loading={eager ? 'eager' : 'lazy'}
          className="size-full scale-[1.45] object-contain"
        />
      </span>
      <span
        className={cn(
          'font-display font-semibold tracking-tight',
          large ? 'text-[20px]' : 'text-[17px]',
        )}
      >
        Ocuris
      </span>
    </span>
  )
}

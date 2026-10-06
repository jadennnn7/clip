'use client'

import { useRef, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Link2 } from 'lucide-react'
import { LinkPricingDialog } from '@/components/landing/LinkPricingDialog'
import { classifyLink, findLinkInText } from '@/lib/links'
import { clearPendingVideo, savePendingVideo } from '@/lib/pending-video'
import { cn } from '@/lib/utils'

export function LinkBar({ className, style, yearlyAvailable }: { className?: string; style?: CSSProperties; yearlyAvailable: boolean }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const showPlans = (value: string) => {
    const link = value.length <= 4096 ? classifyLink(value) : null
    if (!link) {
      setError('Bitte füge einen gültigen HTTPS-Link von YouTube oder Google Drive ein.')
      return
    }
    setUrl(link.url)
    setSubmitted(link.url)
    setError(null)
    setOpen(true)
  }

  return <div className={cn('w-full', className)} style={style}>
    <form onSubmit={(event) => {
      event.preventDefault()
      if (url.trim()) showPlans(url)
      else { clearPendingVideo(); router.push('/dashboard') }
    }} className="glass glass-interactive group flex w-full items-center gap-3 rounded-full p-2 pl-5 text-left focus-within:ring-2 focus-within:ring-brand/50">
      <span aria-hidden className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent" />
      <Link2 aria-hidden className="size-[1.125rem] shrink-0 text-brand/80" />
      <input ref={inputRef} value={url} type="text" inputMode="url" autoComplete="off" maxLength={4096} aria-label="Videolink" aria-invalid={Boolean(error)} aria-describedby={error ? 'hero-link-error' : undefined} placeholder="Link einfügen" className="h-10 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/55"
        onChange={(event) => { setUrl(event.target.value); setError(null) }}
        onPaste={(event) => {
          event.preventDefault()
          const text = event.clipboardData.getData('text').trim()
          const link = findLinkInText(text)
          setUrl(link ?? text.slice(0, 4096))
          showPlans(link ?? text)
        }} />
      <button type="submit" className="liquid liquid-brand transition-ui flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-white outline-none group-hover:brightness-[1.06] focus-visible:ring-2 focus-visible:ring-white/80 sm:px-5">Gratis starten<ArrowRight aria-hidden className="size-3.5" /></button>
    </form>
    {error && <p id="hero-link-error" role="alert" className="mt-3 px-4 text-left text-sm text-red-200">{error}</p>}
    <LinkPricingDialog key={submitted} open={open} onOpenChange={setOpen} url={submitted} yearlyAvailable={yearlyAvailable} finalFocus={inputRef}
      onChoose={async (tier, interval) => {
        if (!savePendingVideo(submitted, tier, interval)) return 'Dein Browser blockiert das Speichern des Links. Erlaube Website-Daten und versuche es erneut.'
        router.push('/dashboard')
        return null
      }} />
  </div>
}

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTikTokCreator } from '@/lib/publishing-client'
import type { TikTokPostOptions, TikTokPrivacy } from '@/types/tiktok'

const PRIVACY_LABELS: Record<TikTokPrivacy, string> = {
  PUBLIC_TO_EVERYONE: 'Alle — öffentlich', MUTUAL_FOLLOW_FRIENDS: 'Freunde',
  FOLLOWER_OF_CREATOR: 'Follower', SELF_ONLY: 'Nur ich — privat',
}

type Draft = Omit<TikTokPostOptions, 'privacyLevel' | 'consent'> & { privacyLevel: TikTokPrivacy | ''; consent: boolean }

export function TikTokPostSettings({ accountId, durationSeconds, onChange }: {
  accountId: string
  durationSeconds: number
  onChange: (options: TikTokPostOptions | undefined) => void
}) {
  const { data: creator, error, loading, refresh } = useTikTokCreator(accountId)
  const [draft, setDraft] = useState<Draft>({
    privacyLevel: '', allowComment: false, allowDuet: false, allowStitch: false,
    commercialContent: false, ownBrand: false, brandedContent: false, isAigc: false, consent: false,
  })
  const tooLong = creator ? durationSeconds > creator.maxDurationSeconds : false

  const update = (patch: Partial<Draft>) => {
    const next = { ...draft, ...patch }
    // Any change to the post settings needs a renewed confirmation.
    if (!('consent' in patch)) next.consent = false
    if (!next.commercialContent) { next.ownBrand = false; next.brandedContent = false }
    setDraft(next)
    const valid = creator && !tooLong && next.consent && next.privacyLevel && creator.privacyOptions.includes(next.privacyLevel)
      && (!next.commercialContent || next.ownBrand || next.brandedContent)
      && !(next.brandedContent && next.privacyLevel === 'SELF_ONLY')
    onChange(valid ? { ...next, privacyLevel: next.privacyLevel as TikTokPrivacy, consent: true } : undefined)
  }

  if (loading) return <p role="status" className="text-xs text-muted-foreground">TikTok-Veröffentlichungsoptionen werden geladen …</p>
  if (error || !creator) return (
    <div className="rounded-xl bg-amber-500/10 p-3 text-xs leading-relaxed">
      <p>{error?.message ?? 'TikTok-Veröffentlichungsoptionen sind nicht verfügbar.'}</p>
      <div className="mt-2 flex gap-3">
        <Link href="/dashboard/connections" className="underline underline-offset-4">Kanal erneut verbinden</Link>
        <button type="button" onClick={refresh} className="underline underline-offset-4">Erneut prüfen</button>
      </div>
    </div>
  )

  return (
    <section className="space-y-3 rounded-xl bg-foreground/[0.04] p-4" aria-label={`TikTok-Veröffentlichung für ${creator.nickname}`}>
      <h3 className="text-sm font-medium">TikTok · {creator.nickname} (@{creator.username})</h3>
      {!creator.publicPostingEnabled ? <p className="text-xs leading-relaxed text-amber-500">Öffentliche Posts sind bis zum TikTok-App-Audit gesperrt. Aktuell kannst du nur private Testposts veröffentlichen.</p> : null}
      {tooLong ? <p className="text-xs text-destructive">Der Clip ist zu lang. Dieser Kanal erlaubt höchstens {creator.maxDurationSeconds} Sekunden.</p> : null}
      <fieldset disabled={tooLong} className="space-y-3 disabled:opacity-50">
        <label className="block space-y-1.5 text-xs">
          <span>Wer kann den Beitrag sehen?</span>
          <select value={draft.privacyLevel} onChange={(event) => update({ privacyLevel: event.target.value as TikTokPrivacy })} className="glass-field w-full rounded-lg px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <option value="" disabled>Sichtbarkeit auswählen</option>
            {creator.privacyOptions.map((privacy) => <option key={privacy} value={privacy} disabled={draft.brandedContent && privacy === 'SELF_ONLY'}>{PRIVACY_LABELS[privacy]}</option>)}
          </select>
        </label>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
          {([
            ['allowComment', 'Kommentare erlauben', creator.commentDisabled],
            ['allowDuet', 'Duette erlauben', creator.duetDisabled],
            ['allowStitch', 'Stitch erlauben', creator.stitchDisabled],
          ] as const).map(([key, label, disabled]) => (
            <label key={key} className={disabled ? 'flex items-center gap-2 opacity-40' : 'flex items-center gap-2'}>
              <input type="checkbox" checked={draft[key]} disabled={disabled} onChange={(event) => update({ [key]: event.target.checked })} />{label}
            </label>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={draft.commercialContent} onChange={(event) => update({ commercialContent: event.target.checked })} />Dieser Beitrag bewirbt eine Marke, ein Produkt oder eine Dienstleistung</label>
        {draft.commercialContent ? (
          <div className="space-y-2 pl-5 text-xs">
            <label className="flex items-center gap-2"><input type="checkbox" checked={draft.ownBrand} onChange={(event) => update({ ownBrand: event.target.checked })} />Meine eigene Marke</label>
            <label className={draft.privacyLevel === 'SELF_ONLY' ? 'flex items-center gap-2 opacity-40' : 'flex items-center gap-2'}><input type="checkbox" checked={draft.brandedContent} disabled={draft.privacyLevel === 'SELF_ONLY'} onChange={(event) => update({ brandedContent: event.target.checked })} />Bezahlte Partnerschaft mit einer anderen Marke</label>
            <p className="text-muted-foreground">{draft.brandedContent ? 'TikTok kennzeichnet den Beitrag als bezahlte Partnerschaft.' : draft.ownBrand ? 'TikTok kennzeichnet den Beitrag als Werbeinhalt.' : 'Wähle mindestens eine Werbekennzeichnung.'}</p>
            {draft.privacyLevel === 'SELF_ONLY' ? <p className="text-muted-foreground">Bezahlte Partnerschaften können nicht privat veröffentlicht werden.</p> : null}
          </div>
        ) : null}
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={draft.isAigc} onChange={(event) => update({ isAigc: event.target.checked })} />Das Video enthält KI-generierte Inhalte</label>
        <label className="flex items-start gap-2 text-xs leading-relaxed">
          <input type="checkbox" className="mt-0.5" checked={draft.consent} onChange={(event) => update({ consent: event.target.checked })} />
          <span>Ich bestätige die Übertragung und direkte Veröffentlichung mit dieser Sichtbarkeit und stimme TikToks <a href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noreferrer" className="underline">Bestätigung zur Musiknutzung</a>{draft.brandedContent ? <> und der <a href="https://www.tiktok.com/legal/page/global/bc-policy/en" target="_blank" rel="noreferrer" className="underline">Branded Content Policy</a></> : null} zu.</span>
        </label>
      </fieldset>
      <p className="text-[11px] leading-relaxed text-muted-foreground">Nach dem Upload kann es einige Minuten dauern, bis TikTok den Beitrag auf deinem Profil anzeigt.</p>
    </section>
  )
}

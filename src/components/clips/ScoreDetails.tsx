import type { Clip } from '@/types/database'
import { cn } from '@/lib/utils'

/** Zeigt das gespeicherte Urteil; Änderungen am Schnitt erzeugen kein neues Review. */
export function ScoreDetails({
  clip,
  dark = false,
}: {
  clip: Pick<Clip, 'virality_score' | 'editorial' | 'score_reasoning'>
  dark?: boolean
}) {
  if (!clip.editorial && !clip.score_reasoning) return null

  const muted = dark ? 'text-white/55' : 'text-muted-foreground'
  const border = dark ? 'border-white/10' : 'border-border'

  return (
    <details className={cn('group rounded-lg border p-3 text-xs', border, dark ? 'bg-white/[.03] text-white/90' : 'bg-muted/40 text-foreground')}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium [&::-webkit-details-marker]:hidden">
        <span>Clip-Score <span className="tabular-nums">{clip.virality_score}/100</span></span>
        <span className={cn('text-[11px] group-open:hidden', muted)}>Begründung +</span>
        <span className={cn('hidden text-[11px] group-open:inline', muted)}>Schließen −</span>
      </summary>
      <ScoreReasoning clip={clip} dark={dark} className="mt-3" />
    </details>
  )
}

/** Die Begründung allein, ohne Aufklapp-Rahmen — für Stellen mit eigenem Umschalter. */
export function ScoreReasoning({
  clip,
  dark = false,
  className,
}: {
  clip: Pick<Clip, 'editorial' | 'score_reasoning'>
  dark?: boolean
  className?: string
}) {
  const assessment = clip.editorial
  const muted = dark ? 'text-white/55' : 'text-muted-foreground'
  const border = dark ? 'border-white/10' : 'border-border'

  if (!assessment) {
    return clip.score_reasoning ? <p className={cn('leading-relaxed', muted, className)}>{clip.score_reasoning}</p> : null
  }

  return (
    <div className={cn('space-y-3 leading-relaxed', className)}>
      <p className={muted}>Inhaltliches Potenzial des ursprünglich gewählten Ausschnitts.</p>
      <dl className="space-y-3">
        {([
          ['hook', 'Hook · Einstieg', '40 %'],
          ['flow', 'Flow · Erzählbogen', '30 %'],
          ['value', 'Value · Mehrwert', '30 %'],
        ] as const).map(([key, label, weight]) => {
          const criterion = assessment[key]
          return (
            <div key={key} className={cn('border-t pt-3', border)}>
              <dt className="flex items-center justify-between gap-2 font-medium">
                <span>{label} <span className={cn('font-normal', muted)}>({weight})</span></span>
                <span className="tabular-nums">{criterion.score}/100</span>
              </dt>
              <dd className={cn('mt-1', muted)}>
                <p>{criterion.reason}</p>
                {criterion.evidence ? <blockquote className={cn('mt-1 border-l-2 pl-2 italic', border)}>„{criterion.evidence}“</blockquote> : null}
              </dd>
            </div>
          )
        })}
      </dl>
      {([
        ['Stärken', assessment.strengths],
        ['Verbesserungspotenzial', assessment.weaknesses],
      ] as const).map(([label, items]) => items.length ? (
        <div key={label} className={cn('border-t pt-3', border)}>
          <p className="font-medium">{label}</p>
          <ul className={cn('mt-1 list-disc space-y-1 pl-4', muted)}>
            {items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
          </ul>
        </div>
      ) : null)}
      <p className={cn('border-t pt-3 text-[11px]', border, muted)}>
        Gewichteter Score mit Abzug bei deutlichen Schwächen. 99–100 sind bei herausragendem Einstieg, Erzählbogen und Mehrwert möglich. Kein Versprechen für Aufrufe.
      </p>
    </div>
  )
}

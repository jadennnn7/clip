import { cn } from '@/lib/utils'

/**
 * Ein Wort als Untertitel: blaue Box, weiße Schrift — die Hervorhebung, die
 * im fertigen Clip das gerade gesprochene Wort trägt. Die Pointen der Seite
 * stehen so, statt im Verlaufs-Text, den jede KI-Seite hat.
 *
 * Die Box läuft von links über das Wort wie beim Mitlesen eines Untertitels
 * (`.caption-mark-fill` in `globals.css`): im Hero beim Laden, weiter unten
 * beim Hereinscrollen (`on="scroll"`). Darunter liegt dasselbe Wort in
 * hellem Blau — ohne Animation steht die Box einfach da.
 */
export function CaptionMark({
  children,
  on = 'load',
  className,
}: {
  children: string
  on?: 'load' | 'scroll'
  className?: string
}) {
  return (
    <span
      className={cn(
        // Der seitliche Abstand ist genau der Überstand der Box — sonst
        // frisst sie das Leerzeichen zum Nachbarwort.
        'caption-mark relative mx-[0.14em] inline-block whitespace-nowrap text-brand-light',
        className,
      )}
    >
      {children}
      {/* Nur Bild: Vorleser und Kopieren nehmen das Wort darunter. */}
      <span
        aria-hidden
        data-on={on}
        className="caption-mark-fill select-none"
      >
        {children}
      </span>
    </span>
  )
}

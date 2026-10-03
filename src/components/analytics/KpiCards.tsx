import { cn } from '@/lib/utils'

export interface Kpi {
  label: string
  value: string
  /** Bezug oder Einordnung, eine Zeile. */
  note: string
  /** Wert liegt nicht vor (fehlende Berechtigung o. Ä.). */
  unavailable?: boolean
}

/**
 * Kennzahlen als gleich gebaute Karten: Bezeichnung, Wert, Bezug — in
 * dieser Reihenfolge, in derselben Größe. Keine Heldenzahl; die Werte stehen
 * nebeneinander und werden verglichen.
 */
export function KpiCards({ items, dimmed = false }: { items: Kpi[]; dimmed?: boolean }) {
  return (
    // Fünf Karten in zwei Spalten: Die letzte nimmt auf dem Telefon die volle Breite.
    <div className={cn('grid grid-cols-2 gap-3 transition-opacity duration-300 max-sm:[&>:last-child]:col-span-2 sm:grid-cols-3 xl:grid-cols-5', dimmed && 'opacity-50')}>
      {items.map((item) => (
        <div key={item.label} className="glass-tile flex min-w-0 flex-col rounded-xl px-4 py-3.5">
          <p className="truncate text-xs text-muted-foreground">{item.label}</p>
          <p className={cn('mt-1.5 text-2xl font-semibold tracking-tight tabular-nums', item.unavailable && 'text-muted-foreground')}>{item.value}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground" title={item.note}>{item.note}</p>
        </div>
      ))}
    </div>
  )
}

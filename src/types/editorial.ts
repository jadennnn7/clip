/** Redaktionelles Urteil über den tatsächlich ausgewählten Quellausschnitt. */
export interface EditorialCriterion {
  score: number
  reason: string
  /** Wörtlicher Beleg aus dem Clip, kein erzeugter Titel. */
  evidence: string
}

export interface EditorialAssessment {
  version: 1
  method: 'ai'
  hook: EditorialCriterion
  flow: EditorialCriterion
  value: EditorialCriterion
  /** Ohne aktuelle externe Signale lässt sich ein Trend nicht belegen. */
  trend: { score: null; reason: string }
  strengths: string[]
  weaknesses: string[]
}

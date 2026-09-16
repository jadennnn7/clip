/**
 * Bewertungsrubrik für die Viralitätsanalyse.
 *
 * Bewusst lang und detailliert: Der Prompt ist über alle Videos hinweg
 * identisch und bekommt in `analyze.ts` einen `cache_control`-Breakpoint. Ab
 * dem zweiten Aufruf wird er aus dem Prompt-Cache gelesen und kostet nur noch
 * einen Bruchteil — ausführlichere Kriterien sind hier also fast gratis und
 * verbessern die Trennschärfe der Scores erheblich.
 *
 * Wichtig: Die Rubrik muss byte-identisch bleiben, sonst bricht der Cache.
 * Niemals Datum, Nutzername oder Projekt-ID hineinrendern.
 */
export const VIRALITY_SYSTEM_PROMPT = `Du bist ein erfahrener Editor für Kurzvideo-Content. Du analysierst Transkripte von Langform-Videos (Podcasts, Interviews, Vorträge) und findest darin die Segmente, die als eigenständiger vertikaler Kurzclip funktionieren.

## Was einen Clip trägt

Ein Segment funktioniert als Standalone-Clip, wenn es diese Eigenschaften hat:

1. **Eigenständigkeit** — Das Segment ist ohne Kontext aus dem Rest des Videos verständlich. Verweise auf "wie ich eben sagte" oder "der Punkt davor" disqualifizieren ein Segment, sofern der Bezug nicht im Segment selbst aufgelöst wird.

2. **Hook in den ersten drei Sekunden** — Der erste Satz muss eine Spannung eröffnen: eine kontraintuitive Behauptung, eine konkrete Zahl, eine direkte Ansprache oder eine Frage, die der Zuschauer beantwortet haben will. Ein Segment, das mit Aufwärmen oder Einordnung beginnt, verliert das Publikum, bevor der gute Teil kommt.

3. **Spannungsbogen mit Auflösung** — Die eröffnete Spannung muss innerhalb des Segments aufgelöst werden. Ein Clip, der eine Frage stellt und die Antwort schuldig bleibt, erzeugt Frust statt Shares.

4. **Emotionale Beteiligung** — Überraschung, Widerspruch, Wiedererkennung, Ärger oder Erleichterung. Rein informative Passagen ohne emotionalen Anker werden geschaut, aber nicht geteilt.

5. **Klares Ende** — Das Segment endet auf einem vollständigen Gedanken, nicht mitten im Satz und nicht in einem Ausklang, der schon zum nächsten Thema überleitet.

## Scoring (1–100)

- **90–100**: Starker Hook, vollständiger Bogen, hohe emotionale Beteiligung, sofort teilbar. Selten — vergib diesen Bereich höchstens einmal pro Video, wenn überhaupt.
- **75–89**: Solider Hook und klare Botschaft, aber entweder erwartbares Thema oder etwas schwächere Auflösung.
- **60–74**: Inhaltlich gut, aber der Einstieg braucht zu lange oder das Segment ist kontextabhängig.
- **40–59**: Funktioniert nur für ein Publikum, das dem Kanal ohnehin folgt.
- **Unter 40**: Nicht als Clip geeignet. Gib solche Segmente gar nicht erst zurück.

Sei streng. Ein Video, dessen Clips alle zwischen 85 und 95 liegen, ist nicht bewertet, sondern gelobt — und macht die Sortierung wertlos. Nutze die volle Skala.

## Zeitgrenzen

- Zwischen 20 und 75 Sekunden. Unter 20 Sekunden fehlt der Bogen, über 75 bricht die Retention ein.
- Setze die Grenzen auf Satzanfang und Satzende, nie mitten in einen Satz.
- Segmente dürfen sich nicht überlappen.

## Metadaten

Für jedes Segment:
- **title**: Der Text, der als Titel über dem Clip steht. Maximal 60 Zeichen, neugierig machend, keine Clickbait-Floskeln ("Du wirst nicht glauben...").
- **description**: Zwei bis drei Sätze für die Plattform-Beschreibung. Greift den Hook auf, ohne die Auflösung zu verraten.
- **hashtags**: Drei bis fünf Hashtags. Mischung aus einem breiten (#business) und mehreren spezifischen (#preisverhandlung). Keine generischen Füller wie #fyp oder #viral.
- **hook_text**: Der wörtliche Satz aus dem Transkript, der den Clip eröffnet.
- **score_reasoning**: Zwei bis drei Sätze, die den Score begründen — was trägt den Clip, was zieht ihn herunter. Der Nutzer liest das, um deine Einschätzung zu prüfen, also sei konkret statt allgemein.

Antworte in der Sprache des Transkripts.`

/** Nutzer-Nachricht: das Transkript mit Zeitmarken. */
export function buildAnalysisPrompt({
  transcript,
  durationSeconds,
  maxClips,
}: {
  transcript: string
  durationSeconds: number
  maxClips: number
}): string {
  return `Hier ist das Transkript eines ${Math.round(durationSeconds / 60)} Minuten langen Videos. Jede Zeile beginnt mit der Startzeit in Sekunden.

Finde die ${maxClips} stärksten Segmente nach den Kriterien oben.

<transkript>
${transcript}
</transkript>`
}

/**
 * Bereitet das Wort-Array für den Prompt auf.
 *
 * Jedes Wort einzeln mit Timestamp zu übergeben würde das Transkript
 * verdreifachen; eine Zeitmarke alle paar Sekunden reicht dem Modell, um
 * Segmentgrenzen zu setzen, und die exakten Wortgrenzen holt die Pipeline
 * anschließend ohnehin selbst aus dem Wort-Array.
 */
export function formatTranscriptForPrompt(
  words: Array<{ word: string; start: number }>,
  markEverySeconds = 5,
): string {
  const lines: string[] = []
  let currentLine: string[] = []
  let lineStart = words[0]?.start ?? 0

  for (const word of words) {
    if (word.start - lineStart >= markEverySeconds && currentLine.length > 0) {
      lines.push(`[${lineStart.toFixed(1)}] ${currentLine.join(' ')}`)
      currentLine = []
      lineStart = word.start
    }
    currentLine.push(word.word)
  }

  if (currentLine.length > 0) {
    lines.push(`[${lineStart.toFixed(1)}] ${currentLine.join(' ')}`)
  }

  return lines.join('\n')
}

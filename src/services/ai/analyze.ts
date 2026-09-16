import 'server-only'

import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { z } from 'zod'
import type { TranscriptWord } from '@/types/database'
import {
  VIRALITY_SYSTEM_PROMPT,
  buildAnalysisPrompt,
  formatTranscriptForPrompt,
} from './prompts'

/**
 * Claude Opus 5 — 1M Kontext, $5/$25 pro MTok.
 *
 * Ein 60-Minuten-Transkript sind rund 12k Input-Tokens, die Analyse kostet
 * damit etwa 0,16 $ pro Video. Gegenüber dem Rendering (Remotion Lambda plus
 * Lizenz) ist das vernachlässigbar — es gibt also keinen Grund, hier auf ein
 * schwächeres Modell auszuweichen und die Qualität der Auswahl zu riskieren.
 *
 * (Die ursprünglich vorgesehene Version Claude 3.5 Sonnet ist abgekündigt.)
 */
const MODEL = 'claude-opus-5'

const ClipSegmentSchema = z.object({
  start_seconds: z.number().describe('Startzeit im Quellvideo, in Sekunden'),
  end_seconds: z.number().describe('Endzeit im Quellvideo, in Sekunden'),
  virality_score: z.number().int().min(1).max(100),
  title: z.string().max(80),
  description: z.string(),
  hashtags: z.array(z.string()),
  hook_text: z.string(),
  score_reasoning: z.string(),
})

const AnalysisSchema = z.object({
  segments: z.array(ClipSegmentSchema),
})

export type ClipSegment = z.infer<typeof ClipSegmentSchema>

let client: Anthropic | null = null
function getClient() {
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return client
}

export interface AnalyzeOptions {
  words: TranscriptWord[]
  durationSeconds: number
  maxClips?: number
}

/**
 * Findet die Segmente mit dem höchsten Viralitätspotenzial.
 */
export async function analyzeTranscript({
  words,
  durationSeconds,
  maxClips = 5,
}: AnalyzeOptions): Promise<ClipSegment[]> {
  const transcript = formatTranscriptForPrompt(words)

  const response = await getClient().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,

    // Viralitätsbewertung ist Urteilsarbeit, keine Extraktion — adaptives
    // Thinking lässt das Modell selbst entscheiden, wie viel Abwägung ein
    // Segment braucht.
    thinking: { type: 'adaptive' },

    // Die Rubrik ist über alle Videos identisch und wird ab dem zweiten Aufruf
    // aus dem Cache gelesen. Der Breakpoint sitzt deshalb hinter dem System-
    // Prompt und vor dem variablen Transkript.
    system: [
      {
        type: 'text',
        text: VIRALITY_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],

    messages: [
      {
        role: 'user',
        content: buildAnalysisPrompt({ transcript, durationSeconds, maxClips }),
      },
    ],

    // Erzwingt valides JSON — ohne das müsste die Pipeline Markdown-Fences
    // und abgeschnittene Objekte abfangen.
    output_config: { format: betaZodOutputFormat(AnalysisSchema) },

    // Serverseitige Fallbacks: Lehnt ein Safety-Classifier eine Anfrage ab
    // (stop_reason "refusal"), routet die API selbst auf ein Ersatzmodell,
    // statt die Pipeline eines Nutzers abreißen zu lassen.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
  })

  // Bei einer Ablehnung ist `content` leer — immer vor dem Auslesen prüfen.
  if (response.stop_reason === 'refusal') {
    throw new Error(
      `Analyse abgelehnt (${response.stop_details?.category ?? 'unbekannt'}). ` +
        'Das Transkript enthält vermutlich Inhalte, die der Classifier blockiert.',
    )
  }

  if (!response.parsed_output) {
    throw new Error('Claude hat kein auswertbares JSON zurückgegeben.')
  }

  return sanitizeSegments(response.parsed_output.segments, durationSeconds)
}

/**
 * Schneidet auf gültige Bereiche zurecht und entfernt Überlappungen.
 *
 * Das Modell hält sich fast immer an die Vorgaben, aber "fast immer" reicht
 * nicht: Ein Segment mit end_seconds jenseits der Videolänge führt sonst zu
 * einem Render, der mitten im Schwarzbild endet — und die Render-Minuten sind
 * dann trotzdem verbraucht.
 */
function sanitizeSegments(segments: ClipSegment[], durationSeconds: number): ClipSegment[] {
  const cleaned = segments
    .map((segment) => ({
      ...segment,
      start_seconds: Math.max(0, segment.start_seconds),
      end_seconds: Math.min(durationSeconds, segment.end_seconds),
      virality_score: Math.round(Math.min(100, Math.max(1, segment.virality_score))),
    }))
    .filter((segment) => {
      const length = segment.end_seconds - segment.start_seconds
      return length >= 10 && length <= 120
    })
    .sort((a, b) => a.start_seconds - b.start_seconds)

  const result: ClipSegment[] = []
  for (const segment of cleaned) {
    const previous = result[result.length - 1]
    if (previous && segment.start_seconds < previous.end_seconds) continue
    result.push(segment)
  }

  return result.sort((a, b) => b.virality_score - a.virality_score)
}

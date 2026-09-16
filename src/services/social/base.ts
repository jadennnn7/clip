import type { SocialPlatform } from '@/types/database'

/**
 * Gemeinsames Interface aller Plattform-Adapter.
 *
 * Der Publishing-Worker kennt nur dieses Interface und keine plattform-
 * spezifische Logik. Das ist keine Ästhetik, sondern Notwendigkeit: die drei
 * Plattformen unterscheiden sich in fast jedem Detail (YouTube: resumable
 * Upload; TikTok: Init-Call mit Chunk-Größen; Instagram: Container erstellen,
 * pollen, dann publishen), aber Retry-Verhalten, Idempotenz und
 * Fehlerklassifikation müssen überall gleich funktionieren.
 */
export interface SocialProvider {
  readonly platform: SocialPlatform

  /** URL, auf die der Nutzer zum Autorisieren geschickt wird. */
  getAuthUrl(params: { state: string; redirectUri: string }): string

  /** Tauscht den Authorization Code gegen Tokens. */
  exchangeCode(params: { code: string; redirectUri: string }): Promise<TokenSet>

  /** Erneuert einen abgelaufenen Access Token. */
  refreshToken(refreshToken: string): Promise<TokenSet>

  /** Profilinformationen für die Anzeige im UI. */
  getAccountInfo(accessToken: string): Promise<AccountInfo>

  /**
   * Wie viele Posts sind aktuell noch erlaubt?
   *
   * Vor jedem Publish abfragen. Alle drei Plattformen deckeln die Frequenz,
   * und ein Fehlschlag wegen Kontingent ist teuer: das Video ist dann bereits
   * hochgeladen, aber nicht veröffentlicht.
   */
  getPublishingLimit(account: ProviderAccount): Promise<PublishingLimit>

  /** Veröffentlicht einen Clip. */
  publish(params: PublishParams): Promise<PublishResult>
}

export interface TokenSet {
  accessToken: string
  refreshToken?: string
  /** Ablaufzeitpunkt des Access Tokens. */
  expiresAt?: Date
  /** Ablaufzeitpunkt des Refresh Tokens (TikTok: 365 Tage). */
  refreshExpiresAt?: Date
  scopes: string[]
}

export interface AccountInfo {
  platformAccountId: string
  username: string | null
  avatarUrl: string | null
  /** Meta: die IG-Professional-Account-ID und die verknüpfte Page. */
  metaPageId?: string
  metaIgUserId?: string
}

export interface PublishingLimit {
  used: number
  quota: number
  get remaining(): number
}

export interface ProviderAccount {
  accessToken: string
  platformAccountId: string
  metaIgUserId?: string | null
}

export interface PublishParams {
  account: ProviderAccount
  /** Öffentlich erreichbare URL des gerenderten 9:16-MP4. */
  videoUrl: string
  title: string
  description: string
  hashtags: string[]
  /**
   * Eindeutiger Schlüssel dieses Veröffentlichungsvorgangs. Wird an die
   * Plattform weitergereicht, wo sie Idempotenz unterstützt.
   */
  idempotencyKey: string
}

export interface PublishResult {
  platformPostId: string
  platformPostUrl: string | null
  /**
   * `true`, wenn der Clip NICHT öffentlich sichtbar ist, weil die Plattform es
   * verhindert — TikTok vor dem Audit (SELF_ONLY bzw. Entwurf), YouTube vor
   * dem Compliance-Audit (private). Der Nutzer muss das im UI erfahren,
   * sonst wartet er auf Views, die nie kommen.
   */
  requiresManualStep: boolean
  manualStepReason?: string
}

// ---------------------------------------------------------------------------
// Fehlerklassifikation
// ---------------------------------------------------------------------------

/**
 * Warum ein Publish fehlgeschlagen ist — und ob sich ein erneuter Versuch lohnt.
 *
 * Diese Unterscheidung ist der Kern der Retry-Strategie. Ein 401 blind zu
 * wiederholen brennt nur Kontingent; ein 429 nicht zu wiederholen verliert
 * einen Post, der gleich funktioniert hätte.
 */
export type PublishErrorKind =
  /** 429, 5xx, Netzwerk — erneut versuchen mit exponentiellem Backoff. */
  | 'retryable'
  /** 401/403 — Token tot. Account auf `needs_reauth`, Nutzer benachrichtigen. */
  | 'auth'
  /** Kontingent für heute erschöpft — auf morgen umplanen statt scheitern. */
  | 'quota'
  /** 400 — Video zu lang, Format falsch, Titel zu lang. Endgültig. */
  | 'terminal'

export class PublishError extends Error {
  constructor(
    message: string,
    readonly kind: PublishErrorKind,
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'PublishError'
  }
}

/** Ordnet einen HTTP-Status einer Fehlerklasse zu. */
export function classifyHttpStatus(status: number): PublishErrorKind {
  if (status === 401 || status === 403) return 'auth'
  if (status === 429) return 'quota'
  if (status >= 500) return 'retryable'
  return 'terminal'
}

/**
 * Backoff-Verzögerung für Versuch Nummer `attempt` (1-basiert).
 *
 * Der Jitter ist nicht optional: Ohne ihn laufen alle fehlgeschlagenen Posts
 * eines Ausfalls synchron in denselben Retry und lösen dasselbe Rate-Limit
 * erneut aus.
 */
export function backoffMs(attempt: number): number {
  const base = Math.min(2 ** attempt * 1000, 30 * 60 * 1000)
  return Math.round(base * (0.75 + Math.random() * 0.5))
}

export const MAX_PUBLISH_ATTEMPTS = 5

/** Baut die Beschreibung inklusive Hashtags, gekappt auf das Plattformlimit. */
export function composeCaption(
  description: string,
  hashtags: string[],
  maxLength: number,
): string {
  const tags = hashtags.join(' ')
  const full = tags ? `${description}\n\n${tags}` : description
  if (full.length <= maxLength) return full

  // Lieber die Beschreibung kürzen als die Hashtags verlieren — die Hashtags
  // tragen die Auffindbarkeit.
  const room = maxLength - tags.length - 2
  return room > 0 ? `${description.slice(0, room).trimEnd()}\n\n${tags}` : tags.slice(0, maxLength)
}

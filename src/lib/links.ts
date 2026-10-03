/**
 * Welche Links OmegaClip verarbeitet.
 *
 * Eine Liste statt „alles, was yt-dlp kann": Der Server lädt, was hier
 * durchkommt. Beliebige URLs würden ihn zum offenen Proxy machen, der auch
 * interne Adressen abruft.
 */

export type LinkSource = 'youtube' | 'drive'

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'])

export function classifyLink(value: string): { url: string; source: LinkSource } | null {
  let parsed: URL
  try {
    parsed = new URL(value.trim())
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) return null

  const host = parsed.hostname.toLowerCase()
  if (YOUTUBE_HOSTS.has(host)) return { url: parsed.toString(), source: 'youtube' }
  if (host === 'drive.google.com') return { url: parsed.toString(), source: 'drive' }
  return null
}

/** Findet den ersten verarbeitbaren Link in eingefügtem Text („Schau mal: https://…"). */
export function findLinkInText(text: string): string | null {
  for (const candidate of text.match(/https:\/\/\S+/g) ?? []) {
    const cleaned = candidate.replace(/[)\]}>.,;!?"']+$/, '')
    if (classifyLink(cleaned)) return cleaned
  }
  return null
}

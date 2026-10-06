import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/site-url'
import { EDITOR_ENABLED } from '@/lib/features'

/**
 * Die öffentlichen Seiten. Kommen weitere Rechtsseiten dazu (AGB,
 * Widerruf), gehören sie hier ebenfalls hinein.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl()
  const page = (path: string, priority: number): MetadataRoute.Sitemap[number] => ({
    url: new URL(path, base).toString(),
    changeFrequency: 'weekly',
    priority,
  })
  return [
    page('/', 1),
    ...(EDITOR_ENABLED ? [page('/demo', 0.7)] : []),
    page('/partner', 0.6),
    page('/signup', 0.6),
    page('/login', 0.3),
    page('/konto-loeschen', 0.2),
    page('/impressum', 0.1),
    page('/datenschutz', 0.1),
  ]
}

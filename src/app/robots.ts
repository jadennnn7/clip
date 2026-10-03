import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/site-url'

/** Suchmaschinen sehen Landingpage, Demo und Anmeldung — nie die App oder die API. */
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl()
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard', '/onboarding', '/api/', '/auth/'],
    },
    sitemap: new URL('/sitemap.xml', base).toString(),
    host: base.origin,
  }
}

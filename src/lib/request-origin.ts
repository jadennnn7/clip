/**
 * Die Adresse, die der Browser tatsächlich aufgerufen hat.
 *
 * Hinter einem Tunnel oder Proxy (Cloudflare, Vercel) baut Next.js
 * `request.url` im Route Handler aus dem eigenen Hostnamen — also
 * `localhost:3000` statt der öffentlichen Adresse. Weiterleitungen und
 * Magic-Link-Ziele würden dann den Browser verlassen, in dem die Session liegt.
 */
export function requestOrigin(request: Request): string {
  const url = new URL(request.url)
  const first = (name: string) => request.headers.get(name)?.split(',')[0]?.trim() || null
  const host = first('x-forwarded-host') ?? first('host') ?? url.host
  const protocol = first('x-forwarded-proto') ?? url.protocol.replace(/:$/, '')
  try {
    return new URL(`${protocol}://${host}`).origin
  } catch {
    return url.origin
  }
}

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'

/**
 * Vorschaubild, wenn jemand einen Ocuris-Link teilt (WhatsApp, LinkedIn, X,
 * Slack …). Neutraler dunkler Grund, das Hellblau des Logos als einziger
 * Akzent — dieselbe Palette wie die Landingpage.
 */

export const alt = 'Ocuris — Vom Langformat zum veröffentlichten Short'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/**
 * Satori setzt Wörter einzeln und verteilt die Abstände mit der
 * mitgelieferten Geist-Schrift ungleich. Feste Zeilen mit geschützten
 * Leerzeichen setzt es als Ganzes.
 */
const line = (text: string) => text.replaceAll(' ', '\u00a0')

export default async function OpengraphImage() {
  // Pro Aufruf gelesen, nicht beim Laden des Moduls: Sonst zeigte der
  // Dev-Server nach einem neuen `Logo.png` bis zum Neustart das alte.
  const logo = `data:image/png;base64,${(await readFile(join(process.cwd(), 'public/Logo.png'))).toString('base64')}`

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: 'radial-gradient(ellipse 70% 55% at 50% -10%, rgba(111, 186, 253, 0.28), rgba(10, 10, 10, 0) 70%), #0a0a0a',
          color: '#fafafa',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Das PNG hat viel Rand um das Zeichen; der Ausschnitt gleicht das aus. */}
          <div style={{ display: 'flex', width: 60, height: 60, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
            {/* `contain`: Das Logo muss nicht quadratisch sein. */}
            <img src={logo} alt="" width={88} height={88} style={{ objectFit: 'contain' }} />
          </div>
          <span style={{ fontSize: 40 }}>Ocuris</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', fontSize: 68, lineHeight: 1.08 }}>
            <span>{line('Vom Langformat zum')}</span>
            <span>{line('veröffentlichten Short')}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', fontSize: 28, lineHeight: 1.4, color: 'rgba(250, 250, 250, 0.62)' }}>
            <span>{line('Ocuris findet die stärksten Momente in deinem Video,')}</span>
            <span>{line('schneidet sie auf 9:16, untertitelt sie und veröffentlicht sie.')}</span>
          </div>
        </div>

        <div style={{ display: 'flex', fontSize: 24, color: '#049dff' }}>
          {line('YouTube Shorts · TikTok · Instagram Reels')}
        </div>
      </div>
    ),
    size,
  )
}

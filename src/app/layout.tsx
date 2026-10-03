import type { Metadata } from 'next'
import { Bricolage_Grotesque, Geist_Mono, Inter } from 'next/font/google'
import { ThemeProvider } from '@/components/theme-provider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { WorkspaceProvider } from '@/components/workspace/WorkspaceProvider'
import { siteUrl } from '@/lib/site-url'
import './globals.css'

// Inter wird auch von den Untertitel-Presets referenziert, damit die Vorschau
// im Player dieselbe Schrift zeigt wie der spätere Lambda-Render.
// Für den Render auf Lambda muss die Schrift zusätzlich über
// @remotion/google-fonts geladen werden — die Lambda-Umgebung hat keine
// Browser-Schriften.
const inter = Inter({
  subsets: ['latin'],
  // shadcn mappt die Tailwind-Utility `font-sans` auf var(--font-sans);
  // next/font muss also genau diese Variable belegen.
  variable: '--font-sans',
  display: 'swap',
})

// `globals.css` bindet `--font-mono` seit jeher an `--font-geist-mono` — belegt
// wurde die Variable aber nie. Jedes `font-mono` im Projekt (Dauern, Zahlen)
// fiel damit stillschweigend auf die Standardschrift zurück. Das Dashboard
// setzt Maschinenzahlen bewusst in Mono, also wird die Zusage jetzt eingelöst.
const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
})

// Anzeigeschrift für Seitentitel, Kennzahlen und die Wortmarke. Inter trägt
// die Oberfläche, Bricolage gibt ihr die eigene Stimme — nur dort, wo groß
// gesetzt wird, damit Tabellen und Formulare ruhig bleiben. Die optische
// Größe folgt der Schriftgröße, Titel bekommen also die engeren Formen.
const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-display',
  axes: ['opsz'],
  display: 'swap',
})

const TITLE = 'Clyp — Vom Langformat zum veröffentlichten Short'
const DESCRIPTION =
  'Lade ein Video hoch, und Clyp schneidet, untertitelt und veröffentlicht die stärksten Momente automatisch auf YouTube Shorts, TikTok und Instagram Reels.'

export const metadata: Metadata = {
  // Absolute Adressen für Vorschaubilder und Sitemap.
  metadataBase: siteUrl(),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { type: 'website', locale: 'de_DE', siteName: 'Clyp', title: TITLE, description: DESCRIPTION },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body className={`${inter.variable} ${geistMono.variable} ${bricolage.variable} font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          // Ohne das blitzt beim Themenwechsel jede CSS-Transition der Seite
          // gleichzeitig auf.
          disableTransitionOnChange
        >
          <WorkspaceProvider>
            <TooltipProvider delay={300}>{children}</TooltipProvider>
          </WorkspaceProvider>
          <Toaster position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  )
}

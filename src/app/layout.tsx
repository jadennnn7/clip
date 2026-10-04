import type { Metadata } from 'next'
import { Geist_Mono, Inter, Outfit } from 'next/font/google'
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
// die Oberfläche, Outfit gibt ihr die eigene Stimme — nur dort, wo groß
// gesetzt wird, damit Tabellen und Formulare ruhig bleiben.
// Outfit (Google Fonts, SIL Open Font License) ersetzt Chillax: ähnlich rund
// und freundlich, aber frei weitergebbar — die Fontshare-Lizenz von Chillax
// vertrug sich nicht mit dem öffentlichen Repo. `next/font` liefert sie
// selbst aus, Besucher laden nichts von Google. Variabel, also jede Stärke.
const outfit = Outfit({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-display',
  display: 'swap',
})

const TITLE = 'Ocuris — Vom Langformat zum veröffentlichten Short'
const DESCRIPTION =
  'Lade ein Video hoch, und Ocuris schneidet, untertitelt und veröffentlicht die stärksten Momente automatisch auf YouTube Shorts, TikTok und Instagram Reels.'

export const metadata: Metadata = {
  // Absolute Adressen für Vorschaubilder und Sitemap.
  metadataBase: siteUrl(),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { type: 'website', locale: 'de_DE', siteName: 'Ocuris', title: TITLE, description: DESCRIPTION },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body className={`${inter.variable} ${geistMono.variable} ${outfit.variable} font-sans antialiased`}>
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

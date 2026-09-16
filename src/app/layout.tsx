import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ThemeProvider } from '@/components/theme-provider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
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

export const metadata: Metadata = {
  title: 'OmegaClip — Vom Langformat zum veröffentlichten Short',
  description:
    'Lade ein Video hoch, und OmegaClip schneidet, untertitelt und veröffentlicht die stärksten Momente automatisch auf YouTube Shorts, TikTok und Instagram Reels.',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          // Ohne das blitzt beim Themenwechsel jede CSS-Transition der Seite
          // gleichzeitig auf.
          disableTransitionOnChange
        >
          <TooltipProvider delay={300}>{children}</TooltipProvider>
          <Toaster position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  )
}

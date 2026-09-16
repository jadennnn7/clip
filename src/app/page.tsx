import Link from 'next/link'
import Image from 'next/image'
import { Clapperboard, ArrowRight, Scissors, Captions, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'

const STEPS = [
  {
    icon: Scissors,
    title: 'Findet die Momente',
    body: 'Transkription auf Wortebene, dann bewertet Claude jedes Segment nach Viralitätspotenzial — mit Begründung, nicht als Blackbox.',
  },
  {
    icon: Captions,
    title: 'Schneidet und untertitelt',
    body: 'Automatisches Reframing auf 9:16 mit aktiver Sprechererkennung, dazu animierte Untertitel im Hormozi-Stil.',
  },
  {
    icon: Send,
    title: 'Veröffentlicht',
    body: 'Direkt auf YouTube Shorts, TikTok und Instagram Reels — vollautomatisch oder mit Freigabe, je nachdem, was die Plattform erlaubt.',
  },
]

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col overflow-x-hidden">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <Clapperboard className="size-5" />
          <span className="text-sm font-semibold tracking-tight">OmegaClip</span>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button size="sm" nativeButton={false} render={<Link href="/dashboard" />}>
            Zum Dashboard
          </Button>
        </div>
      </header>

      <main className="flex-1">
        {/* --- Hero ---
            Zweispaltig statt zentriert: Der Text behält eine lesbare Zeilenlänge,
            und das Produktbild bekommt echten Raum. Es läuft rechts über den
            Containerrand hinaus — dadurch wirkt die Oberfläche größer als der
            Ausschnitt und der Blick wird in sie hineingezogen. */}
        <section className="mx-auto w-full max-w-6xl px-4 pt-12 pb-20 sm:px-6 lg:pt-20">
          <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,30rem)_1fr] lg:gap-12">
            <div>
              <h1 className="text-4xl leading-[1.08] font-semibold tracking-tight text-balance sm:text-5xl">
                Ein Video rein.
                <br />
                Zehn Shorts raus.
                <br />
                <span className="text-muted-foreground">Ohne dich.</span>
              </h1>

              <p className="mt-6 max-w-md text-base leading-relaxed text-pretty text-muted-foreground">
                OmegaClip schneidet Langform-Videos zu vertikalen Kurzclips und veröffentlicht
                sie selbstständig auf deinen Kanälen. Andere Tools hören beim Download auf —
                hier läuft die Kette bis zum fertigen Post durch.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Button
                  size="lg"
                  className="gap-1.5"
                  nativeButton={false}
                  render={<Link href="/dashboard" />}
                >
                  Loslegen
                  <ArrowRight className="size-4" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  nativeButton={false}
                  render={<Link href="/dashboard/projects/mock" />}
                >
                  Editor ansehen
                </Button>
              </div>

              {/* Die Plattform-Grenzen stehen schon hier und nicht erst im
                  Kleingedruckten. Wer „Set it and forget it" kauft und danach
                  merkt, dass TikTok nur Entwürfe bekommt, fühlt sich getäuscht. */}
              <p className="mt-8 max-w-md border-l-2 pl-3 text-xs leading-relaxed text-muted-foreground">
                Ehrlich gesagt: TikTok erlaubt vollautomatisches Posten erst nach bestandenem
                Audit, YouTube deckelt Uploads pro Tag. Wo eine Plattform bremst, sagen wir es
                dir — statt dich auf Views warten zu lassen, die nie kommen.
              </p>
            </div>

            <div className="relative lg:-mr-32 xl:-mr-52">
              <div className="overflow-hidden rounded-xl border bg-card shadow-2xl ring-1 ring-black/5 dark:ring-white/10">
                <Image
                  src="/hero-editor.png"
                  alt="Der OmegaClip-Editor: links die 9:16-Vorschau mit animierten Untertiteln, rechts die nach Viralitäts-Score sortierten Clips und das Transkript, unten die Timeline."
                  width={1600}
                  height={1000}
                  priority
                  className="w-full"
                />
              </div>
            </div>
          </div>
        </section>

        {/* --- Ablauf --- */}
        <section className="border-t bg-muted/30">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-sm font-medium text-muted-foreground">
              Was zwischen Upload und Veröffentlichung passiert
            </h2>

            <ol className="mt-8 grid gap-10 sm:grid-cols-3 sm:gap-8">
              {STEPS.map((step, index) => (
                <li key={step.title} className="relative flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border bg-card text-sm font-semibold tabular-nums shadow-xs">
                      {index + 1}
                    </span>
                    <step.icon className="size-4 text-muted-foreground" />
                  </div>
                  <h3 className="text-base font-medium">{step.title}</h3>
                  <p className="text-sm leading-relaxed text-pretty text-muted-foreground">
                    {step.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-xs text-muted-foreground sm:px-6">
          <span>Verarbeite nur Videos, an denen du die Rechte hältst.</span>
          <span>© {new Date().getFullYear()} OmegaClip</span>
        </div>
      </footer>
    </div>
  )
}

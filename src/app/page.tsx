import Link from 'next/link'
import { Clapperboard, ArrowRight, Scissors, Captions, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'

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
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <Clapperboard className="size-5" />
          <span className="text-sm font-semibold tracking-tight">OmegaClip</span>
        </div>
        <Button size="sm" nativeButton={false} render={<Link href="/dashboard" />}>
          Zum Dashboard
        </Button>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
          Ein Video rein. Zehn Shorts raus. Ohne dich.
        </h1>
        <p className="mt-4 max-w-xl text-base text-pretty text-muted-foreground sm:text-lg">
          OmegaClip schneidet Langform-Videos zu vertikalen Kurzclips und veröffentlicht sie
          selbstständig auf deinen Kanälen. Andere Tools hören beim Download auf — hier läuft
          die Kette bis zum fertigen Post durch.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button size="lg" className="gap-1.5" nativeButton={false} render={<Link href="/dashboard" />}>
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

        <div className="mt-16 grid gap-6 sm:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.title} className="flex flex-col gap-2">
              <step.icon className="size-5 text-muted-foreground" />
              <h2 className="text-sm font-medium">{step.title}</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="px-4 py-6 text-xs text-muted-foreground sm:px-6">
        Verarbeite nur Videos, an denen du die Rechte hältst.
      </footer>
    </div>
  )
}

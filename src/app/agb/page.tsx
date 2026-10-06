import type { Metadata } from 'next'
import { LegalPage, LegalSection } from '@/components/legal/LegalPage'
import terms from '@/content/terms.json'

export const metadata: Metadata = {
  title: 'Nutzungsbedingungen — Ocuris',
  description: 'Nutzungsbedingungen von Ocuris für Privat- und Geschäftskunden, einschließlich Widerrufsbelehrung.',
}

function LinkedText({ text }: { text: string }) {
  return text.split(/(https:\/\/[^\s]+|info@ocuris\.app)/g).map((part, index) => {
    if (part === 'info@ocuris.app') return <a key={index} href={`mailto:${part}`}>{part}</a>
    if (part.startsWith('https://')) {
      const url = part.replace(/[.,;]$/, '')
      return <span key={index}><a href={url}>{url}</a>{part.slice(url.length)}</span>
    }
    return part
  })
}

export default function TermsPage() {
  return (
    <LegalPage title={terms.title} containerClassName="max-w-3xl" intro={
      <>
        <p>{terms.intro}</p>
        <p className="mt-2 text-sm">Stand: {terms.version}</p>
        <a href="/rechtliches/Ocuris-Nutzungsbedingungen.pdf" className="mt-4 inline-block underline underline-offset-4">Nutzungsbedingungen als PDF herunterladen</a>
      </>
    }>
      {terms.sections.map((section) => (
        <LegalSection key={section.title} title={section.title}>
          {section.paragraphs.map((paragraph, index) => <p key={index}><LinkedText text={paragraph} /></p>)}
        </LegalSection>
      ))}
    </LegalPage>
  )
}

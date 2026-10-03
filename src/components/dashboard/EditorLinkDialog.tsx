'use client'

import React, { useCallback, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { toast } from 'sonner'
import {
  AlertCircle,
  ArrowRight,
  FileVideo,
  Link2,
  LoaderCircle,
  Upload,
  X,
} from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { classifyLink, findLinkInText } from '@/lib/links'
import { startLinkImport } from '@/lib/link-import'
import { importLocalVideo } from '@/lib/local-media'
import { DEFAULT_PROJECT_SETTINGS, type ProjectSettings } from '@/types/workspace'
import { cn } from '@/lib/utils'

interface EditorLinkDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EditorLinkDialog({ open, onOpenChange }: EditorLinkDialogProps) {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [settings] = useState<ProjectSettings>({ ...DEFAULT_PROJECT_SETTINGS })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const urlInputRef = useRef<HTMLInputElement>(null)

  const acceptFile = useCallback((files: FileList | null) => {
    const picked = files?.[0]
    if (!picked) return
    if (!picked.type.startsWith('video/') && !/\.(mp4|webm|mov|m4v)$/i.test(picked.name)) {
      setError('Bitte eine gültige Videodatei auswählen (z. B. MP4, WebM, MOV).')
      return
    }
    if (picked.size > 500 * 1024 * 1024) {
      setError('Für den lokalen Workspace bitte eine Datei unter 500 MB verwenden.')
      return
    }
    setError(null)
    setFile(picked)
    setUrl('')
  }, [])

  const start = async (targetUrl?: string) => {
    if (busy) return
    setError(null)
    const value = (targetUrl ?? url).trim()

    if (!file && !value) {
      setError('Füge einen Videolink ein oder wähle eine Datei aus.')
      urlInputRef.current?.focus()
      return
    }

    if (!file && !classifyLink(value)) {
      setError('Bitte einen gültigen Link von YouTube oder Google Drive einfügen.')
      return
    }

    setBusy(true)
    try {
      if (file) {
        const id = await importLocalVideo(file, settings)
        toast.success('Video importiert', {
          description: 'Dein Video ist zum Bearbeiten im Editor bereit.',
        })
        onOpenChange(false)
        router.push(`/dashboard/projects/${id}`)
      } else {
        const { projectId, title } = await startLinkImport(value, settings)
        toast.success('Clips werden erstellt', {
          description: `„${title}“ wird geladen und verarbeitet.`,
        })
        onOpenChange(false)
        router.push(`/dashboard/clips/${projectId}`)
      }
      setFile(null)
      setUrl('')
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Das Video konnte nicht importiert werden. Bitte erneut versuchen.',
      )
    } finally {
      setBusy(false)
    }
  }

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData('text')
    const extracted = findLinkInText(pasted)
    if (extracted) {
      event.preventDefault()
      setUrl(extracted)
      setFile(null)
      setError(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-[1.75rem] border-white/20 bg-background/90 p-0 shadow-2xl backdrop-blur-2xl overflow-hidden ring-1 ring-white/15 dark:ring-white/10">
        {/* Neutrale, dezente Lichtquelle im Hintergrund */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-44 w-72 rounded-full bg-white/10 dark:bg-white/5 blur-3xl"
        />

        <div className="relative p-6 sm:p-7">
          {/* Header mit Bubble-Icon */}
          <div className="flex items-center gap-3.5 mb-5">
            <div className="relative flex size-12 shrink-0 items-center justify-center rounded-2xl glass p-2 shadow-sm ring-1 ring-white/20">
              <Image
                src="/bubble-editor.png"
                alt="Editor"
                width={36}
                height={36}
                className="size-full object-contain drop-shadow-sm"
              />
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold tracking-tight text-foreground">
                Video im Editor öffnen
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Füge einen Link ein oder lade eine Datei zum Schneiden hoch.
              </DialogDescription>
            </div>
          </div>

          {/* Formular / Eingabebereich */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void start()
            }}
            className="space-y-4"
          >
            {/* Link-Eingabefeld */}
            <div className="relative">
              <div
                className={cn(
                  'group flex h-12 w-full items-center gap-2.5 rounded-2xl px-3.5 text-xs transition-all duration-200',
                  'bg-foreground/[0.04] ring-1 ring-foreground/10 hover:ring-foreground/20 focus-within:ring-2 focus-within:ring-foreground/25 focus-within:bg-background/80',
                  file && 'opacity-60 pointer-events-none',
                )}
              >
                <Link2 className="size-4 shrink-0 text-muted-foreground group-focus-within:text-foreground" />
                <input
                  ref={urlInputRef}
                  type="url"
                  disabled={busy || !!file}
                  placeholder="YouTube- oder Google Drive-Link einfügen …"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value)
                    setError(null)
                  }}
                  onPaste={handlePaste}
                  className="min-w-0 flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/70 outline-none"
                />
                {busy ? (
                  <LoaderCircle className="size-4 animate-spin text-muted-foreground shrink-0" />
                ) : url ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setUrl('')
                        setError(null)
                      }}
                      className="rounded-full p-1 text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      <X className="size-3.5" />
                    </button>
                    <button
                      type="submit"
                      className="flex size-7 items-center justify-center rounded-xl bg-primary text-primary-foreground hover:bg-primary/85 shadow-sm transition-all cursor-pointer"
                      title="Starten"
                    >
                      <ArrowRight className="size-3.5" />
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Alternativ Datei auswählen */}
            <div className="flex items-center justify-between gap-3 text-xs">
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/webm,video/quicktime,video/x-m4v"
                className="hidden"
                onChange={(e) => acceptFile(e.target.files)}
              />

              {file ? (
                <div className="flex flex-1 items-center justify-between rounded-xl bg-foreground/[0.06] px-3 py-1.5 text-foreground ring-1 ring-foreground/10">
                  <span className="flex items-center gap-2 truncate font-medium">
                    <FileVideo className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{file.name}</span>
                  </span>
                  <div className="flex items-center gap-1 ml-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setFile(null)}
                      className="rounded-full p-0.5 hover:bg-foreground/10 cursor-pointer text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3" />
                    </button>
                    <button
                      type="submit"
                      disabled={busy}
                      className="flex size-6 items-center justify-center rounded-lg bg-primary text-primary-foreground hover:bg-primary/85 shadow-xs cursor-pointer"
                      title="Starten"
                    >
                      {busy ? <LoaderCircle className="size-3 animate-spin" /> : <ArrowRight className="size-3" />}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  <Upload className="size-3.5" />
                  Oder lokale Videodatei wählen
                </button>
              )}
            </div>

            {/* Fehlermeldung */}
            {error ? (
              <p className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="size-3.5 shrink-0" />
                {error}
              </p>
            ) : null}
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}

'use client'

import { useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { startLinkImport } from '@/lib/link-import'
import { useWorkspaceStore } from '@/stores/workspace-store'
import type { Project } from '@/types/database'
import { DEFAULT_PROJECT_SETTINGS } from '@/types/workspace'

/** Umbenennen eines Videos. `project` null schließt den Dialog. */
export function RenameProjectDialog({ project, onClose }: { project: Project | null; onClose: () => void }) {
  const updateProject = useWorkspaceStore((state) => state.updateProject)
  const [title, setTitle] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  // Beim Öffnen den aktuellen Titel übernehmen — ohne Effekt, beim Rendern.
  if (project && editing !== project.id) {
    setEditing(project.id)
    setTitle(project.title)
  }

  return (
    <Dialog open={Boolean(project)} onOpenChange={(open) => { if (!open) { setEditing(null); onClose() } }}>
      <DialogContent>
        <DialogTitle>Video umbenennen</DialogTitle>
        <DialogDescription>Ein klarer Titel macht das Video in der Bibliothek leichter auffindbar.</DialogDescription>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (!project || !title.trim()) return
            updateProject(project.id, { title: title.trim() })
            toast.success('Titel gespeichert')
            setEditing(null)
            onClose()
          }}
          className="space-y-4"
        >
          <label className="block text-xs">
            Titel
            <input autoFocus required maxLength={180} className="mt-2 h-10 w-full rounded-lg border bg-background px-3 text-sm" value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Abbrechen</Button>
            <Button type="submit" disabled={!title.trim()}>Speichern</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Löscht ein Video und meldet das Ergebnis erst, wenn der Server es bestätigt
 * hat. Lehnt er ab — etwa weil gerade ein Clip hochgeladen wird —, bleibt das
 * Video stehen, und die Meldung sagt, warum.
 */
export function useDeleteProject() {
  const deleteProject = useWorkspaceStore((state) => state.deleteProject)
  const [pendingId, setPendingId] = useState<string | null>(null)

  const remove = async (project: Project, success = 'Video gelöscht'): Promise<boolean> => {
    setPendingId(project.id)
    try {
      await deleteProject(project.id)
      toast.success(success)
      return true
    } catch (cause) {
      toast.error(`„${project.title}“ wurde nicht gelöscht`, {
        description: cause instanceof Error ? cause.message : 'Bitte versuche es erneut.',
        duration: 12000,
      })
      return false
    } finally {
      setPendingId(null)
    }
  }

  return { remove, pendingId }
}

/** Löschen eines Videos samt Clips, Planung, Veröffentlichungen und Dateien auf dem Server. */
export function DeleteProjectDialog({ project, onClose, onDeleted }: { project: Project | null; onClose: () => void; onDeleted?: () => void }) {
  const { remove, pendingId } = useDeleteProject()
  const clipCount = useWorkspaceStore((state) => (project ? state.clips.filter((clip) => clip.project_id === project.id).length : 0))
  // Beim Schließen bleibt der Titel stehen, bis die Animation vorbei ist.
  const [shown, setShown] = useState<Project | null>(null)
  if (project && shown?.id !== project.id) setShown(project)
  const pending = pendingId !== null

  return (
    <Dialog open={Boolean(project)} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent>
        <DialogTitle>Video löschen?</DialogTitle>
        <DialogDescription>
          „{shown?.title}“ {clipCount > 0 ? `und ${clipCount === 1 ? 'sein Clip werden' : `seine ${clipCount} Clips werden`}` : 'wird'} entfernt — samt Planungseinträgen, geplanten Veröffentlichungen und der heruntergeladenen Videodatei.
        </DialogDescription>
        <DeleteActions
          pending={pending}
          label="Video löschen"
          onCancel={onClose}
          onConfirm={async () => {
            if (!project || !(await remove(project))) return
            onClose()
            onDeleted?.()
          }}
        />
      </DialogContent>
    </Dialog>
  )
}

/** Behalten/Löschen — während der Server arbeitet, bleibt der Löschknopf gesperrt. */
export function DeleteActions({ pending, label, onCancel, onConfirm }: { pending: boolean; label: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="flex justify-end gap-2">
      <Button variant="outline" onClick={onCancel}>Behalten</Button>
      <Button variant="destructive" disabled={pending} aria-busy={pending} onClick={onConfirm}>
        {pending ? <><LoaderCircle className="animate-spin" />Wird gelöscht …</> : label}
      </Button>
    </div>
  )
}

/** Startet die Verarbeitung eines Link-Projekts (erneut) — für Entwürfe und Fehlschläge. */
export function processProject(project: Project): void {
  if (!project.source_url) return
  const settings = useWorkspaceStore.getState().projectSettings[project.id] ?? DEFAULT_PROJECT_SETTINGS
  startLinkImport(project.source_url, settings, project.id)
    .then(() => toast.success('Clips werden erstellt', { description: `„${project.title}" wird verarbeitet.` }))
    .catch((cause) => toast.error('Start fehlgeschlagen', { description: cause instanceof Error ? cause.message : undefined }))
}

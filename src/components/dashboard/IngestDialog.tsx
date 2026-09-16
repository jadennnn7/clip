'use client'

import React, { useCallback, useRef, useState } from 'react'
import { Upload, HardDrive, Plus, TriangleAlert } from 'lucide-react'
import { PlatformIcon } from '@/components/social/PlatformIcon'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

/**
 * Ingest-Dialog: Upload, YouTube-URL oder Google Drive.
 *
 * Der Upload-Weg steht bewusst an erster Stelle. Das Herunterladen fremder
 * YouTube-Videos verstößt gegen deren Nutzungsbedingungen — deshalb verlangt
 * der YouTube-Tab eine ausdrückliche Rechtebestätigung, die in
 * `projects.rights_confirmed` protokolliert wird (Check-Constraint im Schema).
 */
export function IngestDialog() {
  const [open, setOpen] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [driveUrl, setDriveUrl] = useState('')
  const [rightsConfirmed, setRightsConfirmed] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFiles = useCallback((files: FileList | null) => {
    const file = files?.[0]
    if (!file) return

    if (!file.type.startsWith('video/')) {
      toast.error('Bitte eine Videodatei auswählen.')
      return
    }

    // Phase 2: presigned R2-URL anfordern (lib/storage/r2.ts → getUploadUrl),
    // direkt aus dem Browser hochladen, dann project.ingest auslösen.
    toast.success(`${file.name} bereit`, {
      description: `${(file.size / 1024 / 1024).toFixed(1)} MB — der Upload nach R2 folgt mit Phase 2.`,
    })
    setOpen(false)
  }, [])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="gap-1.5" />}>
        <Plus className="size-4" />
        Neues Projekt
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Video hinzufügen</DialogTitle>
          <DialogDescription>
            OmegaClip transkribiert das Video, sucht die stärksten Momente und schneidet sie
            auf 9:16.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="upload">
          <TabsList className="w-full">
            <TabsTrigger value="upload" className="flex-1 gap-1.5">
              <Upload className="size-3.5" />
              Upload
            </TabsTrigger>
            <TabsTrigger value="youtube" className="flex-1 gap-1.5">
              <PlatformIcon platform="youtube" className="size-3.5" />
              YouTube
            </TabsTrigger>
            <TabsTrigger value="drive" className="flex-1 gap-1.5">
              <HardDrive className="size-3.5" />
              Drive
            </TabsTrigger>
          </TabsList>

          {/* --- Upload --- */}
          <TabsContent value="upload" className="mt-4">
            <div
              onDragOver={(event) => {
                event.preventDefault()
                setIsDragging(true)
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(event) => {
                event.preventDefault()
                setIsDragging(false)
                handleFiles(event.dataTransfer.files)
              }}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 transition-colors',
                isDragging ? 'border-primary bg-accent' : 'border-border hover:bg-accent/50',
              )}
            >
              <Upload className="size-7 text-muted-foreground" />
              <p className="text-sm font-medium">Datei hierher ziehen</p>
              <p className="text-xs text-muted-foreground">MP4, MOV oder WebM · bis 5 GB</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(event) => handleFiles(event.target.files)}
              />
            </div>
          </TabsContent>

          {/* --- YouTube --- */}
          <TabsContent value="youtube" className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="youtube-url">YouTube-URL</Label>
              <Input
                id="youtube-url"
                placeholder="https://www.youtube.com/watch?v=..."
                value={youtubeUrl}
                onChange={(event) => setYoutubeUrl(event.target.value)}
              />
            </div>

            <div className="flex items-start gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="flex-1">
                <p className="text-xs leading-relaxed">
                  Das Herunterladen fremder Videos verstößt gegen die Nutzungsbedingungen von
                  YouTube. Verarbeite nur Videos, an denen du die Rechte hältst.
                </p>
                <div className="mt-2.5 flex items-center gap-2">
                  <Switch
                    id="rights"
                    checked={rightsConfirmed}
                    onCheckedChange={setRightsConfirmed}
                  />
                  <Label htmlFor="rights" className="text-xs font-normal">
                    Ich halte die Rechte an diesem Video
                  </Label>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* --- Drive --- */}
          <TabsContent value="drive" className="mt-4 flex flex-col gap-2">
            <Label htmlFor="drive-url">Google-Drive-Link</Label>
            <Input
              id="drive-url"
              placeholder="https://drive.google.com/file/d/..."
              value={driveUrl}
              onChange={(event) => setDriveUrl(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Die Datei muss für „Jeder mit dem Link“ freigegeben sein.
            </p>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Abbrechen
          </Button>
          <Button
            onClick={() => {
              toast.success('Projekt angelegt', {
                description: 'Die Verarbeitungspipeline folgt mit Phase 2.',
              })
              setOpen(false)
            }}
          >
            Verarbeitung starten
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

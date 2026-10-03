'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import Image from 'next/image'
import { Player, type PlayerRef } from '@remotion/player'
import { Loader2, Pause, Play, Volume2, VolumeX } from 'lucide-react'
import { ClipComposition } from '../../../remotion/ClipComposition'
import { ClipThumbnail } from '@/components/clips/ClipThumbnail'
import { formatTime } from '@/components/clips/ClipCard'
import { clipOutputDuration } from '@/lib/clip-export'
import { buildCompositionProps } from '@/lib/composition-props'
import { usePreviewWatermark } from '@/stores/billing-usage-store'
import { isLinkProject, mediaUrl } from '@/lib/link-import'
import { getLocalVideo, isLocalVideoProject } from '@/lib/local-media'
import { outputFormatAspect, outputFormatCssAspect } from '@/lib/output-format'
import { cn } from '@/lib/utils'
import { FPS, type ClipCompositionProps } from '@/types/editor'
import { compositionDurationInFrames } from '../../../remotion/timing'
import type { Clip, Project } from '@/types/database'
import type { OutputFormat } from '@/types/workspace'

const COMPOSITION: Record<OutputFormat, [number, number]> = {
  '9:16': [1080, 1920],
  '1:1': [1080, 1080],
  '16:9': [1920, 1080],
}

/**
 * Das Video eines Projekts für die Wiedergabe im Browser.
 *
 * Link-Projekte liegen beim Pipeline-Job auf dem Server, Uploads in der
 * IndexedDB — für sie entsteht eine Objekt-URL, die beim Verlassen wieder
 * freigegeben wird. `null` heißt: Es gibt nichts abzuspielen.
 */
export function useProjectMedia(project: Project): { src: string | null; pending: boolean } {
  const local = isLocalVideoProject(project)
  const [localMedia, setLocalMedia] = useState<{ projectId: string; url: string | null } | null>(null)

  useEffect(() => {
    if (!local) return
    let active = true
    let url: string | null = null
    getLocalVideo(project.id).then((blob) => {
      if (!active) return
      url = blob ? URL.createObjectURL(blob) : null
      setLocalMedia({ projectId: project.id, url })
    }).catch(() => { if (active) setLocalMedia({ projectId: project.id, url: null }) })
    return () => { active = false; if (url) URL.revokeObjectURL(url) }
  }, [project.id, local])

  if (local) {
    const loaded = localMedia?.projectId === project.id
    return { src: loaded ? localMedia.url : null, pending: !loaded }
  }
  return { src: isLinkProject(project) && project.status === 'ready' ? mediaUrl(project) : null, pending: false }
}

/**
 * Die Bühne: der Clip im Creator-Preview-Design.
 */
export function ClipStage({
  clip,
  src,
  pending,
  sourceWidth,
  sourceHeight,
  outputFormat = '9:16',
  removedWords = [],
  playerRef,
  onFrame,
  flush = false,
}: {
  clip: Clip
  src: string | null
  pending: boolean
  sourceWidth: number
  sourceHeight: number
  outputFormat?: OutputFormat
  removedWords?: number[]
  playerRef: RefObject<PlayerRef | null>
  onFrame: (frame: number) => void
  flush?: boolean
}) {
  const [compositionWidth, compositionHeight] = COMPOSITION[outputFormat]
  const frameAspect = outputFormatAspect(outputFormat)
  const [failed, setFailed] = useState(false)

  const watermark = usePreviewWatermark()
  const inputProps = useMemo<ClipCompositionProps>(
    () => buildCompositionProps({ clip, removedWords, videoSrc: src ?? '', sourceWidth, sourceHeight, watermark }),
    [clip, removedWords, src, sourceWidth, sourceHeight, watermark],
  )
  const durationInFrames = compositionDurationInFrames(inputProps)
  const playable = Boolean(src) && !failed

  if (flush) {
    return (
      <div className="relative size-full overflow-hidden bg-black select-none">
        {playable ? (
          <PlayableClip
            key={`${clip.id}:${outputFormat}`}
            clip={clip}
            inputProps={inputProps}
            durationInFrames={durationInFrames}
            compositionWidth={compositionWidth}
            compositionHeight={compositionHeight}
            playerRef={playerRef}
            onFrame={onFrame}
            onError={() => setFailed(true)}
          />
        ) : (
          <FallbackClip clip={clip} pending={pending} failed={failed} outputFormat={outputFormat} />
        )}
      </div>
    )
  }

  return (
    <div
      className="relative flex min-h-[380px] flex-1 items-center justify-center overflow-hidden p-6 sm:min-h-[560px] sm:p-10 lg:min-h-0"
      style={{ containerType: 'size' }}
    >
      <div
        className="relative shrink-0 overflow-hidden rounded-[18px] bg-zinc-900 shadow-[0_30px_80px_-20px_rgba(0,0,0,.8)] ring-1 ring-white/10"
        style={{
          aspectRatio: outputFormatCssAspect(outputFormat),
          width: `min(100cqw, ${frameAspect * 100}cqh)`,
        }}
      >
        {playable ? (
          <PlayableClip
            key={`${clip.id}:${outputFormat}`}
            clip={clip}
            inputProps={inputProps}
            durationInFrames={durationInFrames}
            compositionWidth={compositionWidth}
            compositionHeight={compositionHeight}
            playerRef={playerRef}
            onFrame={onFrame}
            onError={() => setFailed(true)}
          />
        ) : (
          <FallbackClip clip={clip} pending={pending} failed={failed} outputFormat={outputFormat} />
        )}
      </div>
    </div>
  )
}

function PlayableClip({
  clip,
  inputProps,
  durationInFrames,
  compositionWidth,
  compositionHeight,
  playerRef,
  onFrame,
  onError,
}: {
  clip: Clip
  inputProps: ClipCompositionProps
  durationInFrames: number
  compositionWidth: number
  compositionHeight: number
  playerRef: RefObject<PlayerRef | null>
  onFrame: (frame: number) => void
  onError: () => void
}) {
  const [frame, setFrame] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [buffering, setBuffering] = useState(false)
  const [muted, setMuted] = useState(false)
  // Das Standbild deckt den Player ab, bis das Video Bilder liefert. Weil die
  // Composition beim Puffern anhält, heißt der erste Frame nach dem Start:
  // Das Video ist da. Vorher zeigte der Player an dieser Stelle Schwarz.
  const [revealed, setRevealed] = useState(false)
  const [autoPlay] = useState(() => navigator.userActivation?.hasBeenActive !== false)

  const report = useRef({ onFrame, onError })
  useEffect(() => { report.current = { onFrame, onError } })

  const attach = useCallback((player: PlayerRef | null) => {
    playerRef.current = player
    if (!player) return
    const handleFrame = ({ detail }: { detail: { frame: number } }) => {
      setFrame(detail.frame)
      if (detail.frame > 0) setRevealed(true)
      report.current.onFrame(detail.frame)
    }
    const handlePlay = () => setPlaying(true)
    const handlePause = () => setPlaying(false)
    const handleWaiting = () => setBuffering(true)
    const handleResume = () => setBuffering(false)
    const handleError = () => report.current.onError()

    player.addEventListener('frameupdate', handleFrame)
    player.addEventListener('play', handlePlay)
    player.addEventListener('pause', handlePause)
    player.addEventListener('ended', handlePause)
    player.addEventListener('waiting', handleWaiting)
    player.addEventListener('resume', handleResume)
    player.addEventListener('error', handleError)

    setPlaying(player.isPlaying())

    return () => {
      player.removeEventListener('frameupdate', handleFrame)
      player.removeEventListener('play', handlePlay)
      player.removeEventListener('pause', handlePause)
      player.removeEventListener('ended', handlePause)
      player.removeEventListener('waiting', handleWaiting)
      player.removeEventListener('resume', handleResume)
      player.removeEventListener('error', handleError)
      if (playerRef.current === player) playerRef.current = null
    }
  }, [playerRef])

  const toggleMute = () => {
    const player = playerRef.current
    if (!player) return
    const next = !player.isMuted()
    if (next) player.mute()
    else player.unmute()
    setMuted(next)
  }

  const seconds = frame / FPS
  const total = durationInFrames / FPS
  const progress = total > 0 ? (seconds / total) * 100 : 0

  return (
    <div className="relative size-full overflow-hidden bg-black select-none">
      <Player
        ref={attach}
        component={ClipComposition}
        inputProps={inputProps}
        durationInFrames={durationInFrames}
        compositionWidth={compositionWidth}
        compositionHeight={compositionHeight}
        fps={FPS}
        style={{ width: '100%', height: '100%' }}
        autoPlay={autoPlay}
        loop
        controls={false}
        clickToPlay={false}
        spaceKeyToPlayOrPause={false}
        // Der Ton läuft über das <video>, trotzdem hält der Player seine Uhr
        // an, bis sein AudioContext hörbar angelaufen ist — nach dem Klick
        // und nach jedem Puffern bis zu einer Sekunde. Das Video lief in der
        // Zeit schon, Bild und Untertitel standen. So bleibt der Kontext wach.
        _experimentalKeepAudioContextAlive
        acknowledgeRemotionLicense
      />

      {clip.thumbnail_url ? (
        <div
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-0 transition-opacity duration-200',
            revealed && 'opacity-0',
          )}
        >
          <Image src={clip.thumbnail_url} alt="" fill unoptimized sizes="400px" className="object-cover" />
        </div>
      ) : null}

      {/* Ein Klick irgendwo aufs Video spielt oder pausiert. */}
      <button
        type="button"
        onClick={() => playerRef.current?.toggle()}
        aria-label={playing ? 'Pause' : 'Abspielen'}
        className="absolute inset-0 z-20 flex cursor-pointer items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70"
      >
        <span
          className={cn(
            'flex size-14 items-center justify-center rounded-full bg-black/40 text-white ring-1 ring-white/20 backdrop-blur-md transition duration-200',
            playing && !buffering && 'scale-90 opacity-0',
          )}
        >
          {buffering && playing ? (
            <Loader2 className="size-5 animate-spin" />
          ) : playing ? (
            <Pause className="size-5 fill-current" />
          ) : (
            <Play className="ml-0.5 size-5 fill-current" />
          )}
        </span>
      </button>

      <button
        type="button"
        onClick={toggleMute}
        aria-label={muted ? 'Ton an' : 'Ton aus'}
        className="absolute right-3 top-3 z-30 flex size-8 cursor-pointer items-center justify-center rounded-full bg-black/40 text-white/85 ring-1 ring-white/15 backdrop-blur-md transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
      >
        {muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
      </button>

      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-24 bg-gradient-to-t from-black/60 to-transparent" />

      <div className="absolute inset-x-3 bottom-2.5 z-30">
        <div className="pointer-events-none flex justify-between text-[10px] font-medium tabular-nums text-white/75">
          <span>{formatTime(Math.floor(seconds))}</span>
          <span>{formatTime(Math.floor(total))}</span>
        </div>
        <div
          role="slider"
          tabIndex={0}
          aria-label="Position im Clip"
          aria-valuemin={0}
          aria-valuemax={Math.round(total)}
          aria-valuenow={Math.round(seconds)}
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect()
            const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
            playerRef.current?.seekTo(Math.min(durationInFrames - 1, Math.round(ratio * total * FPS)))
          }}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
            event.preventDefault()
            event.stopPropagation()
            const step = (event.key === 'ArrowLeft' ? -1 : 1) * FPS
            playerRef.current?.seekTo(Math.max(0, Math.min(durationInFrames - 1, frame + step)))
          }}
          className="group/bar flex h-3.5 cursor-pointer items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/25 transition-[height] group-hover/bar:h-[5px]">
            <div className="h-full rounded-full bg-white" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>
    </div>
  )
}

function FallbackClip({
  clip,
  pending,
  failed,
  outputFormat,
}: {
  clip: Clip
  pending: boolean
  failed: boolean
  outputFormat: OutputFormat
}) {
  return (
    <div className="relative size-full overflow-hidden bg-black select-none">
      <ClipThumbnail clip={clip} outputFormat={outputFormat} showScore={false} showDuration={false} captionSize={18} sizes="400px" />

      <div className="absolute inset-0 z-20 flex items-center justify-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-black/40 text-white/70 ring-1 ring-white/20 backdrop-blur-md">
          {pending ? <Loader2 className="size-5 animate-spin" /> : <Play className="ml-0.5 size-5 fill-current" />}
        </span>
      </div>

      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-24 bg-gradient-to-t from-black/60 to-transparent" />
      <div className="pointer-events-none absolute inset-x-3 bottom-2.5 z-30">
        <div className="flex justify-between text-[10px] font-medium tabular-nums text-white/75">
          <span>0:00</span>
          <span>{formatTime(clipOutputDuration(clip))}</span>
        </div>
        <div className="flex h-3.5 items-center">
          <div className="h-[3px] w-full rounded-full bg-white/25" />
        </div>
      </div>

      {!pending && failed ? (
        <p className="glass-chip absolute inset-x-3 bottom-14 z-30 rounded-xl px-3 py-2 text-center text-[11px] leading-snug">
          Das Video lässt sich gerade nicht abspielen. Im Editor siehst du den Clip vollständig.
        </p>
      ) : null}
    </div>
  )
}

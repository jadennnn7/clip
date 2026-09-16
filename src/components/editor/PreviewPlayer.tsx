'use client'

import React, { useEffect, useRef } from 'react'
import { Player, type PlayerRef } from '@remotion/player'
import { ClipComposition } from '../../../remotion/ClipComposition'
import type { Clip } from '@/types/database'
import {
  COMPOSITION_HEIGHT,
  COMPOSITION_WIDTH,
  FPS,
  type ClipCompositionProps,
} from '@/types/editor'
import { useEditorStore } from '@/stores/editor-store'

interface PreviewPlayerProps {
  clip: Clip
  videoSrc: string
  sourceWidth: number
  sourceHeight: number
}

/**
 * 9:16-Vorschau auf Basis des Remotion Players.
 *
 * Der Player rendert dieselbe `ClipComposition`, die später auf Lambda läuft.
 * Eine Änderung am Untertitel-Styling ist damit ein reiner Props-Wechsel: die
 * Vorschau aktualisiert sich im nächsten Frame, ohne Netzwerkaufruf und ohne
 * Re-Rendering auf dem Server.
 */
export function PreviewPlayer({ clip, videoSrc, sourceWidth, sourceHeight }: PreviewPlayerProps) {
  const playerRef = useRef<PlayerRef>(null)

  const isPlaying = useEditorStore((state) => state.isPlaying)
  const playbackRate = useEditorStore((state) => state.playbackRate)
  const playheadSeconds = useEditorStore((state) => state.playheadSeconds)
  const setPlayhead = useEditorStore((state) => state.setPlayhead)
  const setPlaying = useEditorStore((state) => state.setPlaying)

  /**
   * Letzter vom Player gemeldeter Frame.
   *
   * Player und Store aktualisieren einander gegenseitig. Ohne diese Referenz
   * entstünde eine Rückkopplung: der Player meldet Frame N, der Store setzt
   * playhead, der Effekt unten springt wieder auf N — bei jedem Frame.
   * Gesucht wird deshalb nur, wenn die Abweichung von außen kommt.
   */
  const lastReportedFrame = useRef(0)

  const durationInFrames = Math.max(
    1,
    Math.round((clip.end_seconds - clip.start_seconds) * FPS),
  )

  const inputProps: ClipCompositionProps = {
    videoSrc,
    startSeconds: clip.start_seconds,
    endSeconds: clip.end_seconds,
    words: clip.words,
    captionStyle: clip.caption_style,
    cropKeyframes: clip.crop_keyframes,
    sourceWidth,
    sourceHeight,
  }

  // Player → Store
  useEffect(() => {
    const player = playerRef.current
    if (!player) return

    const onFrame: Parameters<PlayerRef['addEventListener']>[1] = (event) => {
      const frame = (event.detail as { frame: number }).frame
      lastReportedFrame.current = frame
      setPlayhead(frame / FPS)
    }
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onEnded = () => setPlaying(false)

    player.addEventListener('frameupdate', onFrame)
    player.addEventListener('play', onPlay)
    player.addEventListener('pause', onPause)
    player.addEventListener('ended', onEnded)

    return () => {
      player.removeEventListener('frameupdate', onFrame)
      player.removeEventListener('play', onPlay)
      player.removeEventListener('pause', onPause)
      player.removeEventListener('ended', onEnded)
    }
  }, [setPlayhead, setPlaying])

  // Store → Player: Abspielzustand
  useEffect(() => {
    const player = playerRef.current
    if (!player) return

    if (isPlaying && !player.isPlaying()) player.play()
    else if (!isPlaying && player.isPlaying()) player.pause()
  }, [isPlaying])

  // Store → Player: Suchen, aber nur bei Änderungen von außen (Timeline, Shortcuts).
  useEffect(() => {
    const player = playerRef.current
    if (!player) return

    const targetFrame = Math.round(playheadSeconds * FPS)

    // Verglichen wird gegen den zuletzt VOM PLAYER gemeldeten Frame, nicht
    // gegen eine Toleranzschwelle: Der Player selbst schreibt seinen Frame in
    // den Store, eine Übereinstimmung heißt also "diese Änderung kam von uns"
    // und erzeugt keinen Seek. Jede Abweichung kam von außen — auch ein
    // Einzelframe-Schritt per Pfeiltaste, den eine Schwelle von ±1 Frame
    // verschlucken würde.
    if (targetFrame !== lastReportedFrame.current) {
      const clamped = Math.max(0, Math.min(targetFrame, durationInFrames - 1))
      lastReportedFrame.current = clamped
      player.seekTo(clamped)
    }
  }, [playheadSeconds, durationInFrames])

  return (
    <div className="flex h-full w-full items-center justify-center bg-neutral-950 p-4">
      <div className="relative h-full max-h-full" style={{ aspectRatio: '9 / 16' }}>
        <Player
          ref={playerRef}
          component={ClipComposition}
          inputProps={inputProps}
          durationInFrames={durationInFrames}
          compositionWidth={COMPOSITION_WIDTH}
          compositionHeight={COMPOSITION_HEIGHT}
          fps={FPS}
          playbackRate={playbackRate}
          style={{ width: '100%', height: '100%', borderRadius: 12, overflow: 'hidden' }}
          // Die Steuerung liegt bei Timeline und Shortcuts. Der eingebaute
          // Space-Handler würde sonst zusätzlich zu unserem feuern und den
          // Player sofort wieder anhalten.
          spaceKeyToPlayOrPause={false}
          clickToPlay={false}
          controls={false}
          // Remotion verlangt ab 4 Mitarbeitern eine Company License
          // (siehe remotion.pro/license). Das Flag bestätigt die Kenntnisnahme.
          acknowledgeRemotionLicense
        />
      </div>
    </div>
  )
}

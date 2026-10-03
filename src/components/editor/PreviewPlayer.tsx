'use client'

import React, { useEffect, useMemo, useRef } from 'react'
import { Player, type PlayerRef } from '@remotion/player'
import { ClipComposition } from '../../../remotion/ClipComposition'
import { compositionDurationInFrames } from '../../../remotion/timing'
import type { Clip } from '@/types/database'
import { FPS, type ClipCompositionProps } from '@/types/editor'
import { useEditorStore } from '@/stores/editor-store'
import { usePreviewWatermark } from '@/stores/billing-usage-store'
import type { OutputFormat } from '@/types/workspace'
import { buildCompositionProps } from '@/lib/composition-props'

export const OUTPUT_SIZE: Record<OutputFormat, [number, number]> = {
  '9:16': [1080, 1920],
  '1:1': [1080, 1080],
  '16:9': [1920, 1080],
}

interface PreviewPlayerProps {
  clip: Clip
  videoSrc: string
  sourceWidth: number
  sourceHeight: number
  outputFormat: OutputFormat
  removedWords: number[]
  /** Liegt deckungsgleich über dem Bild — für Auswahlrahmen und Hilfslinien. */
  overlay?: React.ReactNode
  /** Der Rahmen in Ausgabeproportionen, in dem Player und Overlay liegen. */
  frameRef?: React.RefObject<HTMLDivElement | null>
}

/**
 * Vorschau auf Basis des Remotion Players.
 *
 * Der Player rendert dieselbe `ClipComposition`, die später auf Lambda läuft.
 * Eine Änderung im Editor ist damit ein reiner Props-Wechsel: die Vorschau
 * aktualisiert sich im nächsten Frame, ohne Netzwerkaufruf und ohne
 * Re-Rendering auf dem Server.
 */
export function PreviewPlayer({ clip, videoSrc, sourceWidth, sourceHeight, outputFormat, removedWords, overlay, frameRef }: PreviewPlayerProps) {
  const playerRef = useRef<PlayerRef>(null)

  const isPlaying = useEditorStore((state) => state.isPlaying)
  const playbackRate = useEditorStore((state) => state.playbackRate)
  const playheadSeconds = useEditorStore((state) => state.playheadSeconds)
  const loop = useEditorStore((state) => state.loop)
  const previewMuted = useEditorStore((state) => state.previewMuted)
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

  const [compositionWidth, compositionHeight] = OUTPUT_SIZE[outputFormat]

  /*
    Stabil halten, nicht bei jedem Render neu bauen.

    Die Abspielschleife des Players hängt an seiner Composition-Konfiguration,
    und die enthält die Props. Ein neues Objekt startet die Schleife neu — und
    dieser Player rendert während der Wiedergabe mit jedem Frame (er folgt dem
    Playhead aus dem Store). Bei jedem Neustart ging der angefangene Frame
    verloren: Die Zeitleiste lief nur mit rund zwei Dritteln der Echtzeit, das
    Video lief ihr davon, und Remotion setzte es alle zwei Sekunden eine halbe
    Sekunde zurück. Man sah den Clip stocken und Stücke doppelt.

    Der Clip ändert seine Referenz nur bei echten Bearbeitungen, nie durch
    den Playhead — er ist als Abhängigkeit also genau richtig.
  */
  const watermark = usePreviewWatermark()
  const inputProps: ClipCompositionProps = useMemo(
    // Ohne Abspann: Timeline und Playhead des Editors enden am Clip.
    () => buildCompositionProps({ clip, removedWords, videoSrc, sourceWidth, sourceHeight, watermark, outro: false }),
    [clip, removedWords, videoSrc, sourceWidth, sourceHeight, watermark],
  )
  const durationInFrames = compositionDurationInFrames(inputProps)

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

  /*
    Die beiden Effekte unten lesen den Store beim Ausführen, nicht die Werte
    aus dem Render, der sie ausgelöst hat.

    Der Player meldet seine Ereignisse (`frameupdate`, `play`, `pause`) aus
    seinen eigenen Effekten, und die laufen VOR den Effekten dieser
    Komponente. Im selben Durchgang hat der Player-Callback den Store dann
    schon weitergeschrieben, während die Closure hier noch den Wert des
    vorigen Renders trägt. Der Vergleich gegen `lastReportedFrame` setzt zwei
    verschiedene Zeitpunkte gleich: „Playhead 2,8 s, Player steht auf 0,8 s"
    sieht wie ein Sprung von außen aus, der Effekt sucht zurück — der Player
    meldet den Frame, der Store springt, der nächste Effekt sucht wieder. So
    ging es ohne Ende, bis React nach 50 verschachtelten Updates abbrach
    („Maximum update depth exceeded"). Ausgelöst wurde es, wenn ein Editor
    mit noch veraltetem Store geöffnet wurde und `initialize` den Playhead
    mitten in eine laufende Suche setzte.
  */

  // Store → Player: Abspielzustand
  useEffect(() => {
    const player = playerRef.current
    if (!player) return

    const shouldPlay = useEditorStore.getState().isPlaying
    if (shouldPlay && !player.isPlaying()) player.play()
    else if (!shouldPlay && player.isPlaying()) player.pause()
  }, [isPlaying])

  // Store → Player: Suchen, aber nur bei Änderungen von außen (Timeline, Shortcuts).
  useEffect(() => {
    const player = playerRef.current
    if (!player) return

    const targetFrame = Math.round(useEditorStore.getState().playheadSeconds * FPS)

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

  // Vorschau stumm schalten, ohne den Clip zu verändern.
  useEffect(() => {
    const player = playerRef.current
    if (!player) return
    if (previewMuted) player.mute()
    else player.unmute()
  }, [previewMuted])

  return (
    <div className="relative h-full w-full" style={{ containerType: 'size' }}>
      <div
        ref={frameRef}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ width: `min(100cqw, ${(compositionWidth / compositionHeight) * 100}cqh)`, aspectRatio: `${compositionWidth} / ${compositionHeight}` }}
      >
        {/* Feiner Ring plus weicher Schatten: Ohne die Kante wirkt das
            Videobild wie ein Loch in der Fläche statt wie eine Ebene darauf. */}
        <div className="pointer-events-none absolute -inset-px z-10 rounded-[3px] shadow-[0_0_0_1px_oklch(1_0_0/0.14),0_24px_56px_-16px_oklch(0_0_0/0.85)]" />

        <Player
          ref={playerRef}
          component={ClipComposition}
          inputProps={inputProps}
          durationInFrames={durationInFrames}
          compositionWidth={compositionWidth}
          compositionHeight={compositionHeight}
          fps={FPS}
          playbackRate={playbackRate}
          loop={loop}
          style={{ width: '100%', height: '100%', borderRadius: 2, overflow: 'hidden' }}
          // Die Steuerung liegt bei Timeline und Shortcuts. Der eingebaute
          // Space-Handler würde sonst zusätzlich zu unserem feuern und den
          // Player sofort wieder anhalten.
          spaceKeyToPlayOrPause={false}
          clickToPlay={false}
          controls={false}
          // Die Videos halten den Player beim Puffern an. Ohne wachen
          // AudioContext käme danach jedes Mal eine Wartezeit dazu, bis er
          // wieder hörbar läuft — der Ton selbst kommt aus dem <video>.
          _experimentalKeepAudioContextAlive
          // Remotion verlangt ab 4 Mitarbeitern eine Company License
          // (siehe remotion.pro/license). Das Flag bestätigt die Kenntnisnahme.
          acknowledgeRemotionLicense
        />

        {overlay ? <div className="absolute inset-0 z-20">{overlay}</div> : null}
      </div>
    </div>
  )
}

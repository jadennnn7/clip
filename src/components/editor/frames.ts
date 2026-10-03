'use client'

import { useEffect, useSyncExternalStore } from 'react'

/**
 * Standbilder aus dem Quellvideo — für den Filmstreifen der Timeline und die
 * Vorschaukacheln der Looks.
 *
 * Ein unsichtbares Video-Element pro Quelle springt die gewünschten Zeiten
 * nacheinander an und malt sie klein auf ein Canvas. Die jüngste Anfrage
 * kommt zuerst dran: Wer scrollt oder zoomt, will die Bilder sehen, die jetzt
 * im Blick sind, nicht die von vor zwei Sekunden.
 *
 * Schlägt etwas fehl — fremde Herkunft, nicht dekodierbar —, bleibt die Kachel
 * leer. Der Filmstreifen ist Orientierung, keine Voraussetzung.
 */

const THUMB_HEIGHT = 96
const SEEK_TIMEOUT_MS = 4000
const MAX_CACHE = 600

class FrameGrabber {
  private video: HTMLVideoElement
  private canvas = document.createElement('canvas')
  private pending: number[] = []
  private busy = false
  private failed = false
  private listeners = new Set<() => void>()
  readonly frames = new Map<string, string>()
  version = 0

  constructor(src: string) {
    this.video = document.createElement('video')
    this.video.muted = true
    this.video.preload = 'auto'
    this.video.playsInline = true
    this.video.src = src
    this.video.addEventListener('error', () => { this.failed = true })
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  request(time: number) {
    const key = keyFor(time)
    if (this.failed || this.frames.has(key)) return
    this.pending = this.pending.filter((candidate) => keyFor(candidate) !== key)
    this.pending.push(time)
    if (this.pending.length > 200) this.pending.splice(0, this.pending.length - 200)
    void this.pump()
  }

  private async pump() {
    if (this.busy) return
    this.busy = true
    try {
      while (this.pending.length > 0 && !this.failed) {
        const time = this.pending.pop()!
        const key = keyFor(time)
        if (this.frames.has(key)) continue
        const image = await this.capture(time)
        if (image) {
          this.frames.set(key, image)
          if (this.frames.size > MAX_CACHE) this.frames.delete(this.frames.keys().next().value!)
          this.version++
          for (const listener of this.listeners) listener()
        }
      }
    } finally {
      this.busy = false
    }
  }

  private async capture(time: number): Promise<string | null> {
    const video = this.video
    if (video.readyState < 1) {
      const ready = await waitFor(video, 'loadedmetadata')
      if (!ready) return null
    }
    const target = Math.min(Math.max(0, time), Math.max(0, (video.duration || time) - 0.05))
    if (Math.abs(video.currentTime - target) > 0.01) {
      video.currentTime = target
      const seeked = await waitFor(video, 'seeked')
      if (!seeked) return null
    }
    if (video.readyState < 2) await waitFor(video, 'loadeddata')
    const width = Math.round(THUMB_HEIGHT * ((video.videoWidth || 16) / (video.videoHeight || 9)))
    this.canvas.width = width
    this.canvas.height = THUMB_HEIGHT
    const context = this.canvas.getContext('2d')
    if (!context) return null
    try {
      context.drawImage(video, 0, 0, width, THUMB_HEIGHT)
      return this.canvas.toDataURL('image/jpeg', 0.72)
    } catch {
      // Fremde Herkunft ohne CORS: Das Canvas ist „verunreinigt“.
      this.failed = true
      return null
    }
  }
}

function keyFor(time: number) {
  return time.toFixed(2)
}

function waitFor(video: HTMLVideoElement, event: string): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => { cleanup(); resolve(false) }, SEEK_TIMEOUT_MS)
    const done = () => { cleanup(); resolve(true) }
    const fail = () => { cleanup(); resolve(false) }
    const cleanup = () => {
      window.clearTimeout(timer)
      video.removeEventListener(event, done)
      video.removeEventListener('error', fail)
    }
    video.addEventListener(event, done, { once: true })
    video.addEventListener('error', fail, { once: true })
  })
}

const grabbers = new Map<string, FrameGrabber>()

function grabberFor(src: string): FrameGrabber | null {
  if (!src || typeof document === 'undefined') return null
  let grabber = grabbers.get(src)
  if (!grabber) {
    grabber = new FrameGrabber(src)
    grabbers.set(src, grabber)
  }
  return grabber
}

const NO_SUBSCRIBE = () => () => {}

/**
 * Standbilder zu den gegebenen Quellzeiten. Die Zeiten sollten gerundet sein
 * (etwa auf Viertelsekunden), damit sich Anfragen beim Zoomen wiederholen und
 * aus dem Cache kommen.
 */
export function useFrames(src: string, times: number[]): Map<string, string> | null {
  const grabber = grabberFor(src)
  // Die Version ist der Snapshot: Sie ändert sich mit jedem neuen Bild.
  useSyncExternalStore(grabber?.subscribe ?? NO_SUBSCRIBE, () => grabber?.version ?? 0, () => 0)
  const key = times.map(keyFor).join(',')
  useEffect(() => {
    if (!grabber) return
    // Rückwärts angefragt, weil die jüngste Anfrage zuerst drankommt — so
    // füllt sich der Streifen von links nach rechts.
    for (const time of (key ? key.split(',').map(Number) : []).reverse()) grabber.request(time)
  }, [grabber, key])
  return grabber?.frames ?? null
}

export function frameAt(frames: Map<string, string> | null, time: number): string | undefined {
  return frames?.get(keyFor(time))
}

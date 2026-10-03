import 'server-only'

import { spawn } from 'node:child_process'

/** Auf dem Trigger-Worker setzt die ffmpeg-Build-Extension die Pfade; lokal genügt der PATH. */
export const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg'
export const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe'

export interface RunOptions {
  signal?: AbortSignal
  /** Wird für jede vollständige Zeile auf stdout UND stderr aufgerufen. */
  onLine?: (line: string) => void
  /** stdout sammeln und zurückgeben (für JSON-Ausgaben wie ffprobe). */
  captureStdout?: boolean
}

/**
 * Startet ein Kommandozeilenwerkzeug ohne Shell.
 *
 * Die Argumente gehen als Array an `spawn` — eine eingefügte URL kann damit
 * nie als Shell-Code interpretiert werden. Bei einem Abbruch (Projekt gelöscht)
 * wird der Prozess beendet, statt noch minutenlang weiter herunterzuladen.
 */
export function runProcess(command: string, args: string[], options: RunOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) return reject(new AbortError())

    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const stdout: Buffer[] = []
    // Nur das Ende von stderr aufheben: ffmpeg schreibt dort bei langen Videos
    // Megabytes an Fortschritt, für die Fehlermeldung zählen die letzten Zeilen.
    let stderrTail = ''
    let pending = ''

    const onAbort = () => child.kill('SIGTERM')
    options.signal?.addEventListener('abort', onAbort, { once: true })

    const feed = (chunk: Buffer) => {
      if (!options.onLine) return
      pending += chunk.toString('utf8')
      const lines = pending.split(/\r?\n|\r/)
      pending = lines.pop() ?? ''
      for (const line of lines) if (line.trim()) options.onLine(line)
    }

    child.stdout.on('data', (chunk: Buffer) => {
      if (options.captureStdout) stdout.push(chunk)
      feed(chunk)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString('utf8')).slice(-4000)
      feed(chunk)
    })

    child.on('error', (error: NodeJS.ErrnoException) => {
      options.signal?.removeEventListener('abort', onAbort)
      reject(error.code === 'ENOENT' ? new MissingToolError(command) : error)
    })
    child.on('close', (code) => {
      options.signal?.removeEventListener('abort', onAbort)
      if (options.signal?.aborted) return reject(new AbortError())
      if (code === 0) return resolve(Buffer.concat(stdout).toString('utf8'))
      reject(new ProcessError(command, code, stderrTail))
    })
  })
}

export class AbortError extends Error {
  constructor() {
    super('Abgebrochen')
    this.name = 'AbortError'
  }
}

export class MissingToolError extends Error {
  constructor(readonly tool: string) {
    super(`${tool} ist nicht installiert oder nicht im PATH.`)
    this.name = 'MissingToolError'
  }
}

export class ProcessError extends Error {
  constructor(readonly tool: string, readonly code: number | null, readonly stderr: string) {
    super(`${tool} ist mit Code ${code} beendet worden.`)
    this.name = 'ProcessError'
  }
}

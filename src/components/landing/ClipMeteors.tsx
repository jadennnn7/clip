'use client'

import { useEffect, useRef } from 'react'

/**
 * Sternschnuppen am Hero-Himmel, die erzählen, was Ocuris tut — in fünf
 * Schritten, jeder mit fünf von etwas:
 *
 * 1. Ein langes Video zieht als Meteor über den Himmel: ein Bild aus Licht
 *    mit langem Schweif. Der Schweif ist seine Zeitleiste — nacheinander
 *    leuchten darin fünf Momente auf, die stärksten des Videos.
 * 2. Die Momente werden nach vorn in den Kopf gezogen, Schnittlinien laufen
 *    durchs Bild, es bricht in fünf Streifen wie das Video auf der Bühne
 *    darunter (`LongformToShorts`).
 * 3. Die Streifen fächern sich als kleine Schnuppen auf, richten sich im Flug
 *    zum 9:16-Clip auf (wörtlich: Sie kippen aus dem Bruch und stellen sich
 *    gerade) und suchen sich ihren Bildausschnitt. Sie kühlen ab, bekommen
 *    Untertitel und Laufbalken.
 * 4. Jeder Clip zieht sich zu einem Stern zusammen.
 * 5. Feine Linien verbinden die fünf Sterne zu einem Sternbild, dann
 *    verglimmt es.
 *
 * Das Bild ist das Standbild der Bühne (`/gallery/hero.jpg`, dort ohnehin
 * geladen), einmal klein vorgerechnet und in Mondlicht getönt: von der
 * Logo-Tinte (`brand-ink`) bis zum hellen Logo-Blau (`brand-light`). In
 * Farbe stand es wie ein aufgeklebtes Foto im Himmel.
 *
 * Die Bahnen kommen von oben aus der Mitte und laufen nach außen, wie aus
 * einem Radianten über der Headline: Gebrochen wird links oder rechts neben
 * dem Text, nicht dahinter. Der Fächer kreuzt sich nicht.
 *
 * Canvas 2D über dem Himmel (`NightSky`), hinter dem Text. Eine Schnuppe alle
 * sechs bis zehn Sekunden; gezeichnet wird nur, solange eine fliegt, und nur,
 * solange der Hero im Bild ist. Mit „Bewegung reduzieren" gibt es keine.
 */
const FRAME_SRC = '/gallery/hero.jpg'
const SLICES = 5

/* Maße in CSS-Pixeln bei Maßstab 1 (1440 px Breite). */
const FRAME_W = 50
const FRAME_H = (FRAME_W * 9) / 16
const CARD_W = (FRAME_H * 9) / 16
const RADIUS = 2.5
/** Schweif hinter dem Kopf. */
const TAIL = 250
/** Wo im Schweif die Momente liegen (Anteil der Länge), in der Reihenfolge,
 *  in der sie aufleuchten: vom ältesten Ende zum Kopf. */
const MOMENTS = [0.86, 0.68, 0.51, 0.34, 0.18]
/** Tempo des Kopfs, px/s. */
const SPEED = 560
/** Bremsen (1/s) und Absinken (px/s²) der Bruchstücke. */
const DRAG = 1.8
const SAG = 14
/** Halber Öffnungswinkel des Fächers, Bogenmaß. */
const FAN = 0.5

/** Zeitplan in Sekunden: bis `burst` ab Erscheinen, alles danach ab dem Bruch. */
const T = {
  ignite: 0.2,
  /** Der erste Moment leuchtet auf, dann alle `momentGap` der nächste. */
  moments: 0.22,
  momentGap: 0.08,
  /** Die Momente ziehen nach vorn in den Kopf. */
  gather: 0.66,
  cut: 0.72,
  burst: 0.95,
  flash: 0.35,
  morph: 0.5,
  cool: 0.6,
  play: 0.5,
  /** Ab hier zieht sich jeder Clip zum Stern zusammen, um bis zu `stagger`
   *  versetzt. */
  star: 1.45,
  stagger: 0.28,
  shrink: 0.3,
  glintIn: 0.2,
  /** Die Linien des Sternbilds ziehen sich, es steht, es verglimmt. */
  link: 0.7,
  hold: 0.6,
  fadeOut: 1.3,
}
const LINK_AT = T.star + T.stagger + T.shrink
const FADE_AT = LINK_AT + T.link + T.hold
const LIFE = T.burst + FADE_AT + T.fadeOut

/* Farben aus dem Himmel (`NightSky`) und dem Logo. */
const STAR = '193, 218, 252'
const GLOW = '60, 125, 255'
const HOT = '214, 232, 255'
const WHITE = '255, 255, 255'
const BRAND = '#049dff'
const TONE_DARK = [4, 22, 43] // brand-ink
const TONE_LIGHT = [203, 233, 255] // brand-light

type Fragment = {
  /** Mitte des Streifens im Moment des Bruchs. */
  x: number
  y: number
  vx: number
  vy: number
  /** Wie weit er beim Bruch auskippt, bevor er sich aufrichtet. */
  spin: number
  /** Welcher Streifen des Bilds, von links. */
  slice: number
  /** Platz im Fächer, von einer Seite zur anderen — die Reihenfolge der
   *  Sterne im Sternbild. */
  place: number
  /** Versatz, mit dem er zum Stern wird. */
  delay: number
}

type Spark = { vx: number; vy: number; life: number }

type Meteor = {
  born: number
  /** Kopf beim Erscheinen, Flugrichtung (Einheitsvektor), Tempo. */
  x: number
  y: number
  dx: number
  dy: number
  speed: number
  /** Maßstab nach Fensterbreite. */
  s: number
  fragments: Fragment[]
  sparks: Spark[]
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const rand = (a: number, b: number) => a + Math.random() * (b - a)
const easeOut = (v: number) => 1 - (1 - v) ** 3
const easeIn = (v: number) => v * v * v
const easeInOut = (v: number) => (v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2)

/** Rang jedes Werts in aufsteigender Reihenfolge. */
function rank(values: number[]) {
  const ranks = new Array<number>(values.length)
  values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value)
    .forEach(({ index }, position) => (ranks[index] = position))
  return ranks
}

/** Eine neue Schnuppe; `side` −1 fliegt nach links, 1 nach rechts. */
function spawn(width: number, height: number, side: number, born: number): Meteor {
  const s = Math.min(1.15, Math.max(0.62, width / 1440))
  const speed = SPEED * s
  const angle = (rand(18, 32) * Math.PI) / 180
  const dx = side * Math.cos(angle)
  const dy = Math.sin(angle)

  // Erst die Bruchstelle neben dem Text, der Start liegt eine Flugstrecke
  // davor — oft noch über dem oberen Rand.
  const bx = width * (0.5 + side * rand(0.24, 0.33))
  const by = height * rand(0.14, 0.3)
  const run = speed * T.burst

  // Der Platz quer zur Bahn bestimmt die Richtung im Fächer: Was beim Bruch
  // links der Bahn liegt, fliegt nach links weg. So kreuzt sich nichts.
  const sliceW = (FRAME_W * s) / SLICES
  const offsets = Array.from({ length: SLICES }, (_, i) => (i - (SLICES - 1) / 2) * sliceW)
  const across = rank(offsets.map((o) => -o * dy))
  const mid = (SLICES - 1) / 2
  const heading = Math.atan2(dy, dx)
  const fragments = offsets.map((o, i) => {
    const spread = (across[i] - mid) / mid
    const a = heading + spread * FAN + rand(-0.07, 0.07)
    // Ungleich weit, sonst stünden die Sterne auf einem Bogen statt als
    // Sternbild.
    const pace = speed * rand(0.2, 0.62)
    return {
      x: bx + o,
      y: by,
      vx: Math.cos(a) * pace,
      vy: Math.sin(a) * pace,
      spin: spread * 0.32 + rand(-0.08, 0.08),
      slice: i,
      place: across[i],
      delay: rand(0, T.stagger),
    }
  })

  const sparks = Array.from({ length: 8 }, () => {
    const a = heading + rand(-1.1, 1.1)
    const pace = speed * rand(0.25, 0.6)
    return { vx: Math.cos(a) * pace, vy: Math.sin(a) * pace, life: rand(0.3, 0.55) }
  })

  return { born, x: bx - dx * run, y: by - dy * run, dx, dy, speed, s, fragments, sparks }
}

/** Weicher runder Schein. */
function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number) {
  if (alpha <= 0.005 || r <= 0) return
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, `rgba(${color}, ${alpha})`)
  g.addColorStop(1, `rgba(${color}, 0)`)
  ctx.fillStyle = g
  ctx.fillRect(x - r, y - r, r * 2, r * 2)
}

/** Schweif: ein spitz zulaufender Schein mit hellem Kern, von (x, y) zurück. */
function streak(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ux: number,
  uy: number,
  length: number,
  width: number,
  alpha: number,
  s: number,
) {
  if (length < 1 || alpha <= 0.01) return
  const tx = x - ux * length
  const ty = y - uy * length

  if (width > 0) {
    const nx = (-uy * width) / 2
    const ny = (ux * width) / 2
    const g = ctx.createLinearGradient(x, y, tx, ty)
    g.addColorStop(0, `rgba(${GLOW}, ${0.45 * alpha})`)
    g.addColorStop(1, `rgba(${GLOW}, 0)`)
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(x + nx, y + ny)
    ctx.lineTo(tx, ty)
    ctx.lineTo(x - nx, y - ny)
    ctx.closePath()
    ctx.fill()
  }

  const g = ctx.createLinearGradient(x, y, tx, ty)
  g.addColorStop(0, `rgba(${STAR}, ${alpha})`)
  g.addColorStop(1, `rgba(${STAR}, 0)`)
  ctx.strokeStyle = g
  ctx.lineWidth = 1.2 * s
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(tx, ty)
  ctx.stroke()
}

/** Ein heller Stern mit Kreuzstrahlen wie die hellsten im Shader. */
function glint(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, alpha: number) {
  if (alpha <= 0.01) return
  glow(ctx, x, y, 12 * s, GLOW, 0.45 * alpha)
  glow(ctx, x, y, 3.2 * s, WHITE, alpha)
  const reach = 11 * s
  const thin = Math.max(0.8, 0.9 * s)
  const h = ctx.createLinearGradient(x - reach, y, x + reach, y)
  const v = ctx.createLinearGradient(x, y - reach, x, y + reach)
  for (const g of [h, v]) {
    g.addColorStop(0, `rgba(${STAR}, 0)`)
    g.addColorStop(0.5, `rgba(${STAR}, ${0.8 * alpha})`)
    g.addColorStop(1, `rgba(${STAR}, 0)`)
  }
  ctx.fillStyle = h
  ctx.fillRect(x - reach, y - thin / 2, reach * 2, thin)
  ctx.fillStyle = v
  ctx.fillRect(x - thin / 2, y - reach, thin, reach * 2)
}

/**
 * Ein Bild aus dem Film: `sx`/`sw` wählen den Ausschnitt, `heat` legt die
 * Glut darüber, `play` > 0 zeigt Untertitel und Laufbalken — dann ist aus
 * dem Streifen ein Clip geworden.
 */
function frame(
  ctx: CanvasRenderingContext2D,
  film: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number,
  rotation: number,
  sx: number,
  sw: number,
  heat: number,
  play: number,
  s: number,
) {
  if (w < 0.5 || h < 0.5) return
  const radius = Math.min(RADIUS * s, w / 2, h / 2)
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rotation)
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(-w / 2, -h / 2, w, h, radius)
  ctx.clip()
  ctx.drawImage(film, sx, 0, sw, film.height, -w / 2, -h / 2, w, h)
  if (heat > 0.005) {
    ctx.fillStyle = `rgba(${HOT}, ${heat})`
    ctx.fillRect(-w / 2, -h / 2, w, h)
  }
  if (play > 0) {
    const line = Math.max(1.5, h * 0.065)
    ctx.fillStyle = `rgba(${WHITE}, ${0.9 * clamp01(play * 4)})`
    ctx.beginPath()
    ctx.roundRect(-w * 0.31, h * 0.17, w * 0.62, line, line / 2)
    ctx.fill()
    const bar = Math.max(1.2, h * 0.045)
    ctx.fillStyle = BRAND
    ctx.fillRect(-w / 2, h / 2 - bar, w * play, bar)
  }
  ctx.restore()
  ctx.beginPath()
  ctx.roundRect(-w / 2, -h / 2, w, h, radius)
  ctx.lineWidth = Math.max(0.75, 0.8 * s)
  ctx.strokeStyle = `rgba(${WHITE}, ${0.4 + 0.5 * heat})`
  ctx.stroke()
  ctx.restore()
}

function drawMeteor(ctx: CanvasRenderingContext2D, film: HTMLCanvasElement, m: Meteor, t: number) {
  const { s, dx, dy, speed } = m
  const fw = FRAME_W * s
  const fh = FRAME_H * s

  // Das Video als Meteor, im Schweif seine Zeitleiste.
  if (t < T.burst) {
    const x = m.x + dx * speed * t
    const y = m.y + dy * speed * t
    const alpha = easeOut(clamp01(t / T.ignite))
    const length = Math.min(TAIL * s, speed * t)
    const heat = 0.35 + 0.4 * clamp01((t - T.gather) / (T.burst - T.gather))

    ctx.globalCompositeOperation = 'lighter'
    streak(ctx, x, y, dx, dy, length, fh * 0.9, alpha, s)
    glow(ctx, x, y, fw * 0.9, GLOW, 0.35 * alpha)

    // Die Momente: leuchten nacheinander auf und ziehen dann nach vorn in
    // den Kopf, den hintersten zuerst.
    MOMENTS.forEach((at, j) => {
      const lit = easeOut(clamp01((t - T.moments - j * T.momentGap) / 0.12))
      if (lit <= 0) return
      const pull = easeIn(clamp01((t - T.gather - j * 0.025) / 0.18))
      const back = at * length * (1 - pull)
      const px = x - dx * back
      const py = y - dy * back
      const a = alpha * lit * (0.85 + 0.15 * Math.sin(t * 24 + j * 1.7))
      glow(ctx, px, py, 7 * s, GLOW, 0.7 * a)
      glow(ctx, px, py, 2.2 * s, WHITE, a)
    })
    ctx.globalCompositeOperation = 'source-over'

    ctx.globalAlpha = alpha
    frame(ctx, film, x, y, fw, fh, 0, 0, film.width, heat, 0, s)

    // Die Schnittlinien ziehen von oben nach unten durchs Bild.
    const cut = easeOut(clamp01((t - T.cut) / (T.burst - T.cut - 0.06)))
    if (cut > 0) {
      ctx.fillStyle = `rgba(${WHITE}, 0.95)`
      for (let i = 1; i < SLICES; i++) {
        ctx.fillRect(x - fw / 2 + (i * fw) / SLICES - 0.5 * s, y - fh / 2, s, fh * cut)
      }
    }
    ctx.globalAlpha = 1
    return
  }

  // Der Bruch.
  const u = t - T.burst
  const bx = m.x + dx * speed * T.burst
  const by = m.y + dy * speed * T.burst
  const flash = clamp01(u / T.flash)

  ctx.globalCompositeOperation = 'lighter'
  streak(ctx, bx, by, dx, dy, TAIL * s * (1 - easeOut(flash)), fh * 0.9, 1 - flash, s)
  if (flash < 1) glow(ctx, bx, by, fw * (0.6 + 1.2 * easeOut(flash)), WHITE, 0.5 * (1 - flash) ** 2)

  for (const p of m.sparks) {
    const life = u / p.life
    if (life >= 1) continue
    const e = Math.exp(-3 * u)
    const pace = Math.hypot(p.vx, p.vy)
    streak(
      ctx,
      bx + (p.vx * (1 - e)) / 3,
      by + (p.vy * (1 - e)) / 3,
      p.vx / pace,
      p.vy / pace,
      pace * e * 0.05 + 1.5 * s,
      0,
      1 - life,
      s,
    )
  }

  // Aus den Streifen werden Clips, aus den Clips Sterne.
  const fade = (1 - clamp01((u - FADE_AT) / T.fadeOut)) ** 2
  const stars: { x: number; y: number }[] = []
  for (const f of m.fragments) {
    const starAt = T.star + f.delay
    const flight = Math.min(u, starAt + T.shrink)
    const e = Math.exp(-DRAG * flight)
    const x = f.x + (f.vx * (1 - e)) / DRAG
    const y = f.y + (f.vy * (1 - e)) / DRAG + 0.5 * SAG * s * flight * flight
    stars[f.place] = { x, y }

    const size = 1 - easeIn(clamp01((u - starAt) / T.shrink))
    if (size > 0) {
      const vx = f.vx * e
      const vy = f.vy * e + SAG * s * flight
      const pace = Math.hypot(vx, vy) || 1
      ctx.globalCompositeOperation = 'lighter'
      streak(ctx, x, y, vx / pace, vy / pace, pace * 0.17, fh * 0.4 * size, size, s)
      glow(ctx, x, y, fh * 0.8 * size, GLOW, 0.25 * size)
      ctx.globalCompositeOperation = 'source-over'

      // Im Flug richtet sich der Streifen zum Hochformat auf und sucht sich
      // dabei seinen Ausschnitt um die eigene Mitte — das Reframing.
      const morph = easeInOut(clamp01(u / T.morph))
      const sliceSw = film.width / SLICES
      const sw = lerp(sliceSw, (film.height * 9) / 16, morph)
      const sx = Math.min(film.width - sw, Math.max(0, (f.slice + 0.5) * sliceSw - sw / 2))
      frame(
        ctx,
        film,
        x,
        y,
        lerp(fw / SLICES, CARD_W * s, morph) * size,
        fh * size,
        // Kippt beim Bruch aus und stellt sich gerade.
        f.spin * (1 - Math.exp(-7 * u)) * Math.exp(-2.6 * u),
        sx,
        sw,
        0.12 + 0.63 * (1 - easeOut(clamp01(u / T.cool))),
        clamp01((u - T.play) / (T.star - T.play)),
        s,
      )
    }

    const g = u - starAt - T.shrink * 0.5
    if (g > 0) {
      ctx.globalCompositeOperation = 'lighter'
      const twinkle = 0.82 + 0.18 * Math.sin(u * 9 + f.slice * 2.3)
      glint(ctx, x, y, s, easeOut(clamp01(g / T.glintIn)) * fade * twinkle)
    }
  }

  // Das Sternbild: Linie für Linie, mit Abstand zu den Sternen wie auf einer
  // Sternkarte.
  const link = clamp01((u - LINK_AT) / T.link)
  if (link > 0 && fade > 0) {
    ctx.globalCompositeOperation = 'lighter'
    ctx.strokeStyle = `rgba(${STAR}, ${0.38 * fade})`
    ctx.lineWidth = Math.max(0.6, 0.7 * s)
    ctx.lineCap = 'round'
    const segments = SLICES - 1
    for (let k = 0; k < segments; k++) {
      const p = easeInOut(clamp01(link * segments - k))
      if (p <= 0) break
      const a = stars[k]
      const b = stars[k + 1]
      const length = Math.hypot(b.x - a.x, b.y - a.y)
      if (length < 1) continue
      const ux = (b.x - a.x) / length
      const uy = (b.y - a.y) / length
      const gap = Math.min(6 * s, length / 3)
      ctx.beginPath()
      ctx.moveTo(a.x + ux * gap, a.y + uy * gap)
      ctx.lineTo(a.x + ux * (gap + (length - 2 * gap) * p), a.y + uy * (gap + (length - 2 * gap) * p))
      ctx.stroke()
    }
  }
  ctx.globalCompositeOperation = 'source-over'
}

/** Das Standbild klein und in Mondlicht getönt, von Logo-Tinte bis Logo-Hellblau. */
function moonlit(image: HTMLImageElement) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 144
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d = pixels.data
  for (let i = 0; i < d.length; i += 4) {
    const l = ((0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255) ** 0.85
    d[i] = lerp(TONE_DARK[0], TONE_LIGHT[0], l)
    d[i + 1] = lerp(TONE_DARK[1], TONE_LIGHT[1], l)
    d[i + 2] = lerp(TONE_DARK[2], TONE_LIGHT[2], l)
  }
  ctx.putImageData(pixels, 0, 0)
  return canvas
}

export function ClipMeteors({ className }: { className?: string }) {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    root.append(canvas)

    const still = window.matchMedia('(prefers-reduced-motion: reduce)')
    const meteors: Meteor[] = []
    let film: HTMLCanvasElement | null = null
    let side = Math.random() < 0.5 ? -1 : 1
    let width = 0
    let height = 0
    let dpr = 1
    let raf = 0
    let timer = 0
    let inView = false
    let disposed = false

    const clear = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }

    const paint = () => {
      raf = 0
      clear()
      if (!film) return
      const now = performance.now() / 1000
      for (let i = meteors.length - 1; i >= 0; i--) {
        if (now - meteors[i].born > LIFE) meteors.splice(i, 1)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      for (const m of meteors) drawMeteor(ctx, film, m, now - m.born)
      if (meteors.length) raf = requestAnimationFrame(paint)
    }

    const schedule = (seconds: number) => {
      clearTimeout(timer)
      timer = window.setTimeout(launch, seconds * 1000)
    }

    function launch() {
      timer = 0
      if (!film || !inView || still.matches) return
      if (!document.hidden && width) {
        meteors.push(spawn(width, height, side, performance.now() / 1000))
        // Meist im Wechsel links und rechts, manchmal zweimal dieselbe Seite.
        if (Math.random() < 0.8) side = -side
        if (!raf) raf = requestAnimationFrame(paint)
      }
      schedule(rand(6, 10))
    }

    const update = () => {
      if (film && inView && !still.matches) {
        if (!timer) schedule(rand(1.2, 2))
        return
      }
      clearTimeout(timer)
      timer = 0
      if (still.matches) {
        meteors.length = 0
        cancelAnimationFrame(raf)
        raf = 0
        clear()
      }
    }

    const resize = () => {
      width = root.clientWidth
      height = root.clientHeight
      dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.max(1, Math.round(width * dpr))
      canvas.height = Math.max(1, Math.round(height * dpr))
    }

    // Einmal vorgerechnet: Jedes Bild der Schnuppe zeichnet das Standbild
    // bis zu sechsmal, verkleinert aus 1600 × 900 wäre das teuer und
    // flimmerig.
    const image = new Image()
    image.src = FRAME_SRC
    image
      .decode()
      .then(() => {
        if (disposed) return
        film = moonlit(image)
        update()
      })
      .catch(() => {})

    const sizeObserver = new ResizeObserver(resize)
    sizeObserver.observe(root)
    const visibility = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting
      update()
    })
    visibility.observe(root)
    still.addEventListener('change', update)

    return () => {
      disposed = true
      clearTimeout(timer)
      cancelAnimationFrame(raf)
      sizeObserver.disconnect()
      visibility.disconnect()
      still.removeEventListener('change', update)
      canvas.remove()
    }
  }, [])

  return <div ref={rootRef} aria-hidden className={className} />
}

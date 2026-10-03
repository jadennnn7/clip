'use client'

import { useEffect, useRef } from 'react'
import { coverBox, SKY_POLE_X, SKY_POLE_Y, skyAngle } from './sky-motion'

/**
 * Die acht 8-Sekunden-Clips aus `public/pics/` als Band aus Hochformat-Karten,
 * das links aus der Eingabeleiste kommt, sich einmal als Spirale windet,
 * in einem weichen Bogen nach oben biegt und in den Himmel steigt — nach
 * hinten gekippt, oben klein und ausgeblendet. Genau eine Windung: Zwei
 * waren dem Nutzer zu viele „Kreisel".
 *
 * Wo die Windung hinter sich selbst läuft, zeigt das Band seine dunkle
 * Rückseite. Die Karten werden deckend und von hinten nach vorn in einen
 * Zwischenspeicher gezeichnet, erst das fertige Band wird halb durchsichtig
 * — sonst schiene die Rückseite durch die Vorderseite.
 *
 * Das Band ist nicht starr: Es schwingt wie ein Band im Wind (eine Welle,
 * die nach oben wandert), und sein oberer Teil dreht sich mit dem Himmel
 * (`NightSky`, gleiche Uhr und gleicher Pol aus `sky-motion.ts`). Unten an
 * der Leiste ist es fest.
 *
 * Gezeichnet wird mit WebGL: Jedes Bild ist ein feines Dreiecksnetz, das
 * sich glatt um die Kurve legt, die Clips liegen als Textur darauf. Karte,
 * runde Ecken, Kante und Kantenglättung macht der Fragment-Shader. Mit
 * Canvas 2D war jedes Bild aus geraden Teilstücken zusammengesetzt, deren
 * Fugen als feine Querlinien über den Clips lagen.
 *
 * Abgespielt werden verkleinerte Fassungen aus `public/hero-strip/` (252 × 448,
 * ohne Ton, je 100–330 KB) — die Originale in `pics/` sind 1080p mit Ton und
 * zusammen 40 MB, und jedes Videobild wird neu auf die Grafikkarte geladen.
 *
 * Der Ursprung ist das linke Ende des Elements mit `data-film-origin` (die
 * Leiste im Hero). Gemessen wird über `offsetLeft`/`offsetTop`, nicht über
 * `getBoundingClientRect`: Die Leiste fährt beim Laden ein (`.rise-in`), die
 * Messung soll ihren Ruheplatz treffen.
 *
 * Läuft nur, solange der Hero im Bild ist, ab 75rem und ohne „Bewegung
 * reduzieren" — sonst ist das Band ausgeblendet wie das Hintergrundvideo.
 */
const CLIPS = [
  'podcast',
  'got-it',
  'holiday',
  'streak',
  'family',
  'tunnel',
  'fresh',
  'delivery',
] as const

/* Geometrie in px bei Maßstab 1 (1440 px Fensterbreite). Ursprung ist das
   Ende der Leiste; x nach rechts, y nach oben, z zum Betrachter. */

/** Breite des Bands; ein Bild ist 1,44-mal so lang (200 : 288). */
const STRIP_W = 88
const FRAME_LEN = STRIP_W * 1.44
/** Gerades Stück aus der Leiste nach links (steigt sanft an) … */
const LEAD = 210
/** … dann eine Windung um eine senkrechte Achse hinter dem Band … */
const COIL_R = 95
const COIL_PITCH = 200
/** … dann ein Bogen nach oben … */
const BEND_R = 110
/** … dann der Aufstieg, der nach hinten kippt. */
const RISE = 1700
const TILT = (62 * Math.PI) / 180
const TILT_LEN = 420
/** Pro px Höhe ein wenig nach links. */
const LEAN = 0.06
/** Die Welle: Ausschlag, Wellenlänge, Dauer. Ruhig, kein Flattern. */
const SWAY = 16
const WAVE = 560
const SWAY_PERIOD = 10
const FOCAL = 1000
/** Fluchtpunkt, vom Ursprung aus (Bildschirm, y nach unten). */
const VANISH_X = -250
const VANISH_Y = -570
/** Tempo entlang des Bands, px/s. */
const SPEED = 30
/** Das ganze Band ist halb durchsichtig. */
const OPACITY = 0.55
/** Netzteile pro Bild, damit es sich glatt um den Bogen legt. */
const SEGMENTS = 16
/** Auf dieser Länge blendet das Band an der Leiste ein … */
const EMERGE = 50
/** … und wächst von der Höhe der Leiste auf volle Breite. */
const GROW = 220
const GROW_FROM = 0.42

const BASE_WIDTH = 1440

/** Jedes Bild ist eine Karte im Band: 9 : 16, mit Fuge und runden Ecken. */
const CARD_GAP = 8
const CARD_LEN = FRAME_LEN - CARD_GAP
const CARD_W = (CARD_LEN * 9) / 16
const CARD_RADIUS = 6

/* Ein Bild in Bandkoordinaten: u entlang (0 = hinteres Ende, 1 = vorderes),
   v quer (0 = links, 1 = rechts). Der Shader rechnet sie in px des Bands um
   und legt die Karte mittig hinein; rundherum bleibt das Band durchsichtig. */
const VERTEX_SHADER = `#version 300 es
in vec3 aPos;
in vec3 aBand;
uniform vec2 uSize;
out vec2 vUv;
out float vAlpha;
out float vHaze;
void main() {
  vec2 ndc = vec2(aPos.x / uSize.x * 2.0 - 1.0, 1.0 - aPos.y / uSize.y * 2.0);
  gl_Position = vec4(ndc * aPos.z, 0.0, aPos.z);
  vUv = aBand.xy;
  vAlpha = aBand.z;
  // aPos.z ist das w der Perspektive: 1 an der Leiste, größer mit der Tiefe.
  vHaze = clamp((aPos.z - 1.0) * 0.7, 0.0, 0.65);
}`

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 vUv;
in float vAlpha;
in float vHaze;
uniform sampler2D uClip;
out vec4 outColor;

const vec2 BAND = vec2(${STRIP_W.toFixed(3)}, ${FRAME_LEN.toFixed(3)});
const vec2 HALF = vec2(${(CARD_W / 2).toFixed(3)}, ${(CARD_LEN / 2).toFixed(3)});
const float RADIUS = ${CARD_RADIUS.toFixed(1)};

void main() {
  // Die Karte in px des Bands, Mitte im Ursprung; d ist der Abstand zu
  // ihrem Rand mit runden Ecken (negativ innen).
  vec2 p = (vUv.yx - 0.5) * BAND;
  vec2 q = abs(p) - HALF + RADIUS;
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - RADIUS;
  float aa = max(fwidth(d) * 0.75, 1e-3);
  float card = 1.0 - smoothstep(-aa, aa, d);

  vec3 clip = texture(uClip, vec2(p.x / HALF.x, -p.y / HALF.y) * 0.5 + 0.5).rgb;
  // Die Clips stehen im selben Mondlicht wie der Junge: kühl, weniger
  // bunt, gedämpft — sonst kleben ihre Tagesfarben auf dem Himmel.
  vec3 moon = vec3(0.68, 0.8, 1.0);
  float luma = dot(clip, vec3(0.2126, 0.7152, 0.0722));
  vec3 color = mix(vec3(luma), clip, 0.4) * moon * 0.85;
  // Eine feine helle Kante fasst jede Karte, wie Glas im Mondlicht.
  float rim = smoothstep(-1.4 - aa, -1.4 + aa, d);
  color = mix(color, moon, rim * 0.22);
  // Von hinten (in der Windung): gespiegelt, das macht die Abbildung, und
  // dunkel wie die Rückseite eines Films.
  if (!gl_FrontFacing) color *= 0.32;
  // Mit der Tiefe verliert sich das Band im Blau des Himmels.
  color = mix(color, vec3(0.035, 0.09, 0.22), vHaze);

  float alpha = vAlpha * card;
  outColor = vec4(color * alpha, alpha);
}`

/* Das fertige Band auf den Himmel: halb durchsichtig. Die Bilder decken ihn
   nicht ganz ab, sie leuchten ein wenig in ihn hinein — dunkle Stellen
   lassen ihn durch, helle tragen Licht bei (Alpha unter der Farbe). */
const COMPOSITE_VERTEX = `#version 300 es
in vec2 aQuad;
out vec2 vTex;
void main() {
  vTex = aQuad * 0.5 + 0.5;
  gl_Position = vec4(aQuad, 0.0, 1.0);
}`

const COMPOSITE_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vTex;
uniform sampler2D uBand;
out vec4 outColor;
void main() {
  vec4 band = texture(uBand, vTex);
  outColor = vec4(band.rgb * ${OPACITY.toFixed(3)}, band.a * ${(OPACITY * 0.7).toFixed(3)});
}`

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Breite des Bands an Stelle `s`: schmal an der Leiste, dann voll. */
const sizeAt = (s: number) => GROW_FROM + (1 - GROW_FROM) * smooth(0, GROW, s)

/** Höhe und Tiefe des Aufstiegs je px, aufsummiert über die Neigung. */
function buildRise() {
  const y = new Float32Array(RISE + 2)
  const z = new Float32Array(RISE + 2)
  for (let r = 1; r < y.length; r++) {
    const tilt = TILT * smooth(0, TILT_LEN, r - 0.5)
    y[r] = y[r - 1] + Math.cos(tilt)
    z[r] = z[r - 1] - Math.sin(tilt)
  }
  return { y, z }
}

/**
 * Anlauf, Windung und Bogen — der feste Teil der Bahn, gleichmäßig nach
 * Bandlänge abgetastet: je px Mitte x, y, z und Querrichtung bx, by, bz.
 * Die Querrichtung ist Tangente × Flächennormale; sie läuft an den
 * Übergängen stetig durch, das Band verdreht sich also nirgends.
 */
function buildBase() {
  const h = COIL_PITCH / (2 * Math.PI)
  const slope = h / COIL_R
  const raw: number[][] = []

  // Anlauf: steigt sanft an, bis er die Steigung der Windung hat.
  for (let i = 0; i <= 120; i++) {
    const d = (LEAD * i) / 120
    const ty = (slope * d) / LEAD
    const n = Math.hypot(1, ty)
    raw.push([-d, (slope * d * d) / (2 * LEAD), 0, ty / n, 1 / n, 0])
  }

  // Eine Windung: vorn nach links, hinten herum, wieder nach vorn.
  const y0 = (slope * LEAD) / 2
  const m = Math.hypot(COIL_R, h)
  for (let i = 1; i <= 720; i++) {
    const phi = (2 * Math.PI * i) / 720
    const sin = Math.sin(phi)
    const cos = Math.cos(phi)
    const tx = (-COIL_R * cos) / m
    const ty = h / m
    const tz = (-COIL_R * sin) / m
    raw.push([
      -LEAD - COIL_R * sin,
      y0 + h * phi,
      -COIL_R + COIL_R * cos,
      ty * cos,
      -tz * sin - tx * cos,
      ty * sin,
    ])
  }

  // Bogen nach oben, in der Ebene zum Betrachter.
  let [x, y] = raw[raw.length - 1]
  let angle = Math.PI - Math.atan2(h, COIL_R)
  while (angle > Math.PI / 2) {
    const step = Math.min(0.5 / BEND_R, angle - Math.PI / 2)
    angle -= step
    x += Math.cos(angle) * step * BEND_R
    y += Math.sin(angle) * step * BEND_R
    raw.push([x, y, 0, Math.sin(angle), -Math.cos(angle), 0])
  }

  const cumulative = [0]
  for (let i = 1; i < raw.length; i++) {
    const [ax, ay, az] = raw[i - 1]
    const [bx, by, bz] = raw[i]
    cumulative.push(cumulative[i - 1] + Math.hypot(bx - ax, by - ay, bz - az))
  }
  const count = Math.floor(cumulative[cumulative.length - 1]) + 1
  const samples = new Float32Array(count * 6)
  let j = 0
  for (let s = 0; s < count; s++) {
    while (j < raw.length - 2 && cumulative[j + 1] < s) j++
    const f = Math.min(1, (s - cumulative[j]) / (cumulative[j + 1] - cumulative[j] || 1))
    for (let c = 0; c < 6; c++) {
      samples[s * 6 + c] = raw[j][c] + (raw[j + 1][c] - raw[j][c]) * f
    }
  }
  return { length: count - 1, samples }
}

const BASE = buildBase()
/** Ab hier steigt das Band auf; davor liegen Anlauf, Windung und Bogen. */
const RISE_FROM = BASE.length
const RISE_X = BASE.samples[RISE_FROM * 6]
const RISE_Y = BASE.samples[RISE_FROM * 6 + 1]
const LENGTH = RISE_FROM + RISE

/** Filmlänge → Stelle auf dem Band. Wo das Band schmal ist, sind die Bilder
 *  kürzer und liegen dichter. */
function buildPlaces() {
  const filmAt = [0]
  for (let s = 1; s <= LENGTH; s++) filmAt.push(filmAt[s - 1] + 1 / sizeAt(s - 0.5))
  const film = filmAt[filmAt.length - 1]
  const place = new Float32Array(Math.floor(film) + 2)
  let k = 0
  for (let q = 0; q < place.length; q++) {
    while (k < filmAt.length - 2 && filmAt[k + 1] < q) k++
    const f = Math.min(1, (q - filmAt[k]) / (filmAt[k + 1] - filmAt[k]))
    place[q] = k + f
  }
  return { film, place }
}

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null
}

export function SkyFilmStrip() {
  const rootRef = useRef<HTMLDivElement>(null)
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([])

  useEffect(() => {
    const root = rootRef.current
    const origin = document.querySelector<HTMLElement>('[data-film-origin]')
    if (!root || !origin) return

    // Jedes Mal ein frisches Canvas: Ein Canvas, das schon einen anderen
    // Kontext hat (Fast Refresh), gibt kein WebGL mehr her.
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: true })
    if (!gl) return
    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
    const program = gl.createProgram()
    if (!vs || !fs || !program) return
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    const cvs = compile(gl, gl.VERTEX_SHADER, COMPOSITE_VERTEX)
    const cfs = compile(gl, gl.FRAGMENT_SHADER, COMPOSITE_FRAGMENT)
    const composite = gl.createProgram()
    if (!cvs || !cfs || !composite) return
    gl.attachShader(composite, cvs)
    gl.attachShader(composite, cfs)
    gl.linkProgram(composite)
    if (
      !gl.getProgramParameter(program, gl.LINK_STATUS) ||
      !gl.getProgramParameter(composite, gl.LINK_STATUS)
    )
      return
    root.prepend(canvas)

    // Band: ein Vertex-Array mit dynamischem Puffer.
    const uSize = gl.getUniformLocation(program, 'uSize')
    const bandVao = gl.createVertexArray()
    gl.bindVertexArray(bandVao)
    const vertexBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
    const aPos = gl.getAttribLocation(program, 'aPos')
    const aBand = gl.getAttribLocation(program, 'aBand')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 24, 0)
    gl.enableVertexAttribArray(aBand)
    gl.vertexAttribPointer(aBand, 3, gl.FLOAT, false, 24, 12)

    // Auflegen: ein Dreieck über die ganze Fläche.
    const quadVao = gl.createVertexArray()
    gl.bindVertexArray(quadVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const aQuad = gl.getAttribLocation(composite, 'aQuad')
    gl.enableVertexAttribArray(aQuad)
    gl.vertexAttribPointer(aQuad, 2, gl.FLOAT, false, 0, 0)
    gl.bindVertexArray(null)

    // Zwischenspeicher für das deckend gezeichnete Band.
    const bandTexture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, bandTexture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    const bandFramebuffer = gl.createFramebuffer()

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.clearColor(0, 0, 0, 0)

    const videos = videoRefs.current
    const textures = CLIPS.map(() => {
      const texture = gl.createTexture()
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([16, 19, 26, 255]))
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      return texture
    })
    const upload = (index: number, source: TexImageSource) => {
      gl.bindTexture(gl.TEXTURE_2D, textures[index])
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
      gl.generateMipmap(gl.TEXTURE_2D)
    }
    // Bis die Videos laufen, stehen ihre Standbilder auf dem Band.
    const shown = CLIPS.map(() => -1)
    CLIPS.forEach((slug, index) => {
      const image = new Image()
      image.onload = () => {
        if (shown[index] < 0) upload(index, image)
      }
      image.src = `/hero-strip/${slug}.jpg`
    })

    const rise = buildRise()
    const { film, place } = buildPlaces()
    const enabled = window.matchMedia(
      '(min-width: 75rem) and (prefers-reduced-motion: no-preference)',
    )

    let ox = 0
    let oy = 0
    let k = 1
    let dpr = 1
    let width = 0
    let height = 0
    let inView = false
    let raf = 0
    /** Pol des Himmels in px und Zeit für Welle und Drehung, je Bild gesetzt. */
    let poleX = 0
    let poleY = 0
    let time = 0
    let skyTurn = 0

    const placeOf = (q: number) => {
      const i = Math.max(0, Math.min(place.length - 2, Math.floor(q)))
      const f = Math.max(0, Math.min(1, q - i))
      return place[i] + (place[i + 1] - place[i]) * f
    }

    /** Bandpunkt bei Länge `s`, quer um `across` (× Bandbreite) verschoben:
     *  Bildschirm-x, -y und das w der Perspektive. */
    const point = (s: number, across: number, out: number[]) => {
      let x: number, y: number, z: number, cx: number, cy: number, cz: number
      if (s < RISE_FROM) {
        const i = Math.max(0, Math.floor(s))
        const f = s - i
        const a = i * 6
        const b = Math.min(i + 1, RISE_FROM) * 6
        const base = BASE.samples
        x = base[a] + (base[b] - base[a]) * f
        y = base[a + 1] + (base[b + 1] - base[a + 1]) * f
        z = base[a + 2] + (base[b + 2] - base[a + 2]) * f
        cx = base[a + 3] + (base[b + 3] - base[a + 3]) * f
        cy = base[a + 4] + (base[b + 4] - base[a + 4]) * f
        cz = base[a + 5] + (base[b + 5] - base[a + 5]) * f
      } else {
        const r = Math.min(RISE, s - RISE_FROM)
        const i = Math.floor(r)
        const f = r - i
        const ry = rise.y[i] + (rise.y[i + 1] - rise.y[i]) * f
        const rz = rise.z[i] + (rise.z[i + 1] - rise.z[i]) * f
        const tilt = TILT * smooth(0, TILT_LEN, r)
        const cos = Math.cos(tilt)
        const sin = Math.sin(tilt)
        // Die Welle wandert nach oben und wächst mit der Höhe.
        const env = smooth(0, 450, r)
        const phase = 2 * Math.PI * (r / WAVE - time / SWAY_PERIOD)
        const sway = SWAY * env * Math.sin(phase)
        const dsway = SWAY * env * Math.cos(phase) * ((2 * Math.PI) / WAVE)
        x = RISE_X - LEAN * ry + sway
        y = RISE_Y + ry
        z = rz
        // Quer zum Band: Tangente × Flächennormale (0, sin, cos).
        const tx = -LEAN * cos + dsway
        const n = Math.hypot(tx, 1)
        cx = 1 / n
        cy = (-tx / n) * cos
        cz = (tx / n) * sin
        const m = Math.hypot(cx, cy, cz)
        cx /= m
        cy /= m
        cz /= m
      }
      const w = across * STRIP_W * sizeAt(s)
      x += w * cx
      y += w * cy
      z += w * cz

      const focal = FOCAL * k
      const scale = focal / (focal - z * k)
      const vx = ox + VANISH_X * k
      const vy = oy + VANISH_Y * k
      const sx = vx + (ox + x * k - vx) * scale
      const sy = vy + (oy - y * k - vy) * scale
      // Oben dreht sich das Band mit dem Himmel um dessen Pol.
      const turn = skyTurn * smooth(RISE_FROM, RISE_FROM + 900, s)
      const cos = Math.cos(turn)
      const sin = Math.sin(turn)
      out[0] = poleX + cos * (sx - poleX) - sin * (sy - poleY)
      out[1] = poleY + sin * (sx - poleX) + cos * (sy - poleY)
      out[2] = 1 / scale
    }

    const measure = () => {
      let x = 0
      let y = origin.offsetHeight / 2
      for (
        let el: HTMLElement | null = origin;
        el && el !== root.offsetParent;
        el = el.offsetParent as HTMLElement | null
      ) {
        x += el.offsetLeft
        y += el.offsetTop
      }
      ox = x
      oy = y
      k = Math.min(1.15, Math.max(0.75, window.innerWidth / BASE_WIDTH))
      dpr = Math.min(2, window.devicePixelRatio || 1)
      width = Math.ceil(ox + 40 * k)
      height = root.clientHeight
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.bindTexture(gl.TEXTURE_2D, bandTexture)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      gl.bindFramebuffer(gl.FRAMEBUFFER, bandFramebuffer)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, bandTexture, 0)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      const box = coverBox(root.clientWidth, height)
      poleX = box.x + SKY_POLE_X * box.h
      poleY = box.y + SKY_POLE_Y * box.h
    }

    const frames = Math.ceil(film / FRAME_LEN) + 2
    const vertices = new Float32Array(frames * (SEGMENTS + 1) * 2 * 6)
    const left = [0, 0, 0]
    const right = [0, 0, 0]

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw)
      time = now / 1000
      skyTurn = skyAngle(time)

      // Neue Videobilder auf die Grafikkarte, aber nur, wenn es eins gibt.
      videos.forEach((video, index) => {
        if (!video || video.readyState < 2 || video.currentTime === shown[index]) return
        shown[index] = video.currentTime
        upload(index, video)
      })

      // Nach oben verliert sich das Band im Himmel.
      const vy = oy + VANISH_Y * k
      const fadeFrom = vy + (oy - vy) * 0.08
      const fadeTo = vy + (oy - vy) * 0.5

      const head = time * SPEED
      const first = Math.ceil((head - film - FRAME_LEN) / FRAME_LEN)
      const last = Math.floor(head / FRAME_LEN)
      const runs: { clip: number; offset: number; depth: number }[] = []
      let o = 0
      for (let n = first; n <= last && runs.length < frames; n++) {
        const start = head - n * FRAME_LEN - FRAME_LEN
        const run = { clip: ((n % CLIPS.length) + CLIPS.length) % CLIPS.length, offset: o / 6, depth: 0 }
        runs.push(run)
        for (let j = 0; j <= SEGMENTS; j++) {
          const q = Math.max(0, Math.min(film, start + (j * FRAME_LEN) / SEGMENTS))
          const u = (q - start) / FRAME_LEN
          const s = placeOf(q)
          point(s, -0.5, left)
          point(s, 0.5, right)
          const emerge = s < EMERGE ? (s / EMERGE) ** 2 : 1
          for (const [p, v] of [
            [left, 0],
            [right, 1],
          ] as const) {
            vertices[o++] = p[0]
            vertices[o++] = p[1]
            vertices[o++] = p[2]
            vertices[o++] = u
            vertices[o++] = v
            vertices[o++] = emerge * smooth(fadeFrom, fadeTo, p[1])
          }
          run.depth += left[2] + right[2]
        }
      }
      // Von hinten nach vorn: w wächst mit der Tiefe.
      runs.sort((a, b) => b.depth - a.depth)

      gl.bindFramebuffer(gl.FRAMEBUFFER, bandFramebuffer)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.useProgram(program)
      gl.bindVertexArray(bandVao)
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
      gl.uniform2f(uSize, width, height)
      gl.bufferData(gl.ARRAY_BUFFER, vertices.subarray(0, o), gl.DYNAMIC_DRAW)
      for (const { clip, offset } of runs) {
        gl.bindTexture(gl.TEXTURE_2D, textures[clip])
        gl.drawArrays(gl.TRIANGLE_STRIP, offset, (SEGMENTS + 1) * 2)
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.useProgram(composite)
      gl.bindVertexArray(quadVao)
      gl.bindTexture(gl.TEXTURE_2D, bandTexture)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    const update = () => {
      const run = inView && enabled.matches
      for (const video of videos) {
        if (!video) continue
        if (run) video.play().catch(() => {})
        else video.pause()
      }
      cancelAnimationFrame(raf)
      if (run) {
        measure()
        raf = requestAnimationFrame(draw)
      }
    }

    const visibility = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting
      update()
    })
    visibility.observe(root)

    const resize = new ResizeObserver(() => {
      if (inView && enabled.matches) measure()
    })
    resize.observe(root)
    if (origin.parentElement) resize.observe(origin.parentElement)
    document.fonts?.ready.then(() => {
      if (inView && enabled.matches) measure()
    })
    enabled.addEventListener('change', update)

    return () => {
      cancelAnimationFrame(raf)
      visibility.disconnect()
      resize.disconnect()
      enabled.removeEventListener('change', update)
      canvas.remove()
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }, [])

  return (
    <div ref={rootRef} aria-hidden className="sky-film">
      {/* Die Quellen: im Bild, damit der Browser sie weiter dekodiert,
          aber unsichtbar klein. Das Canvas setzt die Komponente davor. */}
      <div className="sky-film-sources">
        {CLIPS.map((slug, index) => (
          <video
            key={slug}
            ref={(el) => {
              videoRefs.current[index] = el
            }}
            src={`/hero-strip/${slug}.mp4`}
            muted
            loop
            playsInline
            preload="none"
          />
        ))}
      </div>
    </div>
  )
}

import React from 'react'
import { LANDING_PLATFORMS, PlatformLogo } from '@/components/landing/PlatformLogo'
import { SmoothScrub } from '@/components/landing/SmoothScrub'
import { PLATFORM_LABEL } from '@/lib/social-labels'

/**
 * Ein langes Video zerfällt im Fallen in fertige Shorts — und die gehen raus.
 *
 * Vier Akte in einer Schleife von vierzehn Sekunden:
 *
 * 1. Oben läuft das Querformat-Video. Ein Scan fährt darüber, auf der
 *    Zeitleiste leuchten nacheinander die gefundenen Momente auf.
 * 2. Das Video sinkt, Schnittlinien ziehen durch das Bild, es bricht in
 *    fünf Streifen. Die Streifen lösen sich versetzt und fallen nach unten.
 * 3. Im Fallen richtet sich jeder Streifen zum 9:16-Clip auf und sucht sich
 *    dabei seinen eigenen Bildausschnitt — das Reframing des Produkts. Unten
 *    angekommen, bekommt er Untertitel, Score und Laufbalken.
 * 4. Wo das Video war, erscheinen YouTube, TikTok und Instagram als
 *    App-Kacheln. Die Clips heben nacheinander ab und fliegen hinein; jede
 *    Kachel schluckt ihren Clip und zählt ihn im Badge mit.
 *
 * Die Streifen sind von Anfang an die fertigen Karten, nur verkleidet: Jede
 * liegt an ihrem Endplatz und wird per Transform auf ihren Streifen im Video
 * geschoben und skaliert, `clip-path` schneidet sie auf Streifenbreite. Das
 * Bild in der Karte ist das ganze Video, so verschoben, dass genau der
 * Streifen sichtbar ist. Die Animation löst diese Verkleidung nur auf — es
 * gibt keinen Moment, in dem ein Element gegen ein anderes getauscht wird,
 * außer dem einen Schnitt, den die Schnittlinien verdecken.
 *
 * Reines CSS, auf dem Server erzeugt: Die Geometrie steht hier einmal, die
 * Keyframes werden daraus berechnet. Alle Längen sind `cqw` der Bühne, das
 * Ganze skaliert also ohne Media Queries vom Telefon bis zum Monitor. Alles
 * läuft auf `transform`, `opacity` und `clip-path`.
 */

const DURATION = 14 // Sekunden pro Schleife

/** Bühne: 100 cqw breit, `STAGE_H` cqw hoch. */
const STAGE_H = 77
const VIDEO = { x: 22, y: 5, w: 56, h: 31.5, radius: 1.4 }
/** So weit sinkt das Video, bevor es bricht. */
const DROP = 5
const COUNT = 5
const CARD = { w: 13.6, h: (13.6 * 16) / 9, gap: 2.3, y: 49, radius: 1.3 }
const CARDS_X = (100 - (COUNT * CARD.w + (COUNT - 1) * CARD.gap)) / 2

/** Verhältnis Streifenhöhe zu Kartenhöhe — so viel größer startet jede Karte. */
const K = VIDEO.h / CARD.h
/** Breite eines Streifens, gemessen in Karten-Einheiten (vor dem Skalieren). */
const SLICE_LOCAL = VIDEO.w / COUNT / K
/** Breite des ganzen Videobilds in Karten-Einheiten. */
const FRAME_LOCAL = (CARD.h * 16) / 9
/** Seitlicher Beschnitt, der aus der Karte einen Streifen macht. */
const CLIP_X = ((CARD.w - SLICE_LOCAL) / 2 / CARD.w) * 100

/**
 * Zeitplan der ersten drei Akte, in Prozent einer Zehn-Sekunden-Schleife —
 * so lang war sie, bevor der vierte Akt dazukam. `remap` staucht sie auf den
 * Anfang der längeren Schleife; ihr Ausklang (ab `T.hold`) rückt ans Ende.
 */
const T = {
  in: 7,
  scanFrom: 8,
  scanTo: 30,
  drop: 30,
  split: 38,
  apart: 44,
  travel: 45,
  stagger: 2.2,
  flight: 19,
  hold: 89,
  out: 95,
}

/** Bis hierhin (Prozent der Schleife) reichen die ersten drei Akte. */
const SETTLED = (T.hold * 10) / DURATION
/** Ab hier läuft der alte Ausklang: alles blendet aus, die Schleife beginnt neu. */
const OUTRO = 92
const remap = (percent: number) =>
  percent <= T.hold
    ? (percent * 10) / DURATION
    : OUTRO + ((percent - T.hold) / (100 - T.hold)) * (100 - OUTRO)

/** Der vierte Akt, direkt in Prozent der Schleife. */
const P = {
  /** Die Kacheln erscheinen. */
  apps: SETTLED,
  /** Der erste Clip hebt ab. */
  launch: SETTLED + 3,
  stagger: 1.8,
  flight: 8,
  /** Alle angekommen, die Schlusszeile steht — hier endet die Scroll-Fassung. */
  done: 87,
}

/** Die Kacheln: Mitte (cqw), Kantenlänge. Reihenfolge wie `LANDING_PLATFORMS`. */
const APP = { xs: [32, 50, 68], y: 36, size: 10, radius: 2.4 }
/** Wohin jeder Clip fliegt (Index in `LANDING_PLATFORMS`). */
const DESTINATION = [0, 0, 1, 2, 2]
/**
 * Startreihenfolge: erst die Mitte, dann abwechselnd außen — so trifft jede
 * Plattform einmal, bevor eine den zweiten Clip bekommt.
 */
const LAUNCH = [1, 3, 0, 4, 2]
const arrival = (i: number) => P.launch + LAUNCH[i] * P.stagger + P.flight

const EASE = {
  out: 'cubic-bezier(.22,1,.36,1)',
  inOut: 'cubic-bezier(.65,0,.35,1)',
  /** Senkrecht fällt die Karte zuerst … */
  fall: 'cubic-bezier(.45,0,.2,1)',
  /** … waagerecht rückt sie erst danach in ihre Spalte. Zusammen ein Bogen. */
  slot: 'cubic-bezier(.7,0,.25,1)',
  in: 'cubic-bezier(.55,0,1,.45)',
  /** Abheben: zieht an und bremst vor der Kachel. Langsamer als das
   *  Schrumpfen — sonst stünde die Karte groß vor der Kachel, bevor sie klein
   *  genug ist, um hineinzupassen. */
  lift: 'cubic-bezier(.45,0,.2,1)',
  /** Badge springt auf und federt nach. */
  pop: 'cubic-bezier(.34,1.56,.64,1)',
}

/**
 * Das Standbild des Langvideos: `public/heropic.png`, auf 16:9 zugeschnitten
 * und als JPG verkleinert (`public/gallery/hero.jpg`, 1600 × 900) — die PNG
 * wöge 3,3 MB. Drei Leute auf einem Floß; die Shorts treffen die beiden vorn.
 */
const FRAME_SRC = '/gallery/hero.jpg'

/** Wo auf der Zeitleiste die gefundenen Momente liegen (Anteil der Länge). */
const MOMENTS = [0.07, 0.25, 0.44, 0.62, 0.83]

/**
 * Die fünf Clips. `focus` ist der Punkt im Videobild (Anteile), auf den der
 * fertige Clip zentriert — Frau, Mann in Orange, Frau nah, Frau mit der
 * Person dahinter, Mann nah.
 */
const CLIPS = [
  { words: ['Das', 'ändert', 'alles'], hot: 1, score: 94, time: '0:32', focus: [0.43, 0.45], zoom: 1 },
  { words: ['Niemand', 'sagt', 'dir', 'das'], hot: 0, score: 91, time: '0:41', focus: [0.71, 0.45], zoom: 1.15 },
  { words: ['Mein', 'größter', 'Fehler'], hot: 1, score: 88, time: '0:28', focus: [0.43, 0.38], zoom: 1.4 },
  { words: ['So', 'fängst', 'du', 'an'], hot: 1, score: 86, time: '0:37', focus: [0.34, 0.5], zoom: 1 },
  { words: ['Der', 'wahre', 'Grund'], hot: 2, score: 83, time: '0:45', focus: [0.71, 0.36], zoom: 1.5 },
]

const f = (value: number) => +value.toFixed(3)
const cq = (value: number) => `${f(value)}cqw`
const at = (percent: number) => `${f(percent)}%`
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/**
 * Mit der Scroll-Leiste gesteuert (siehe `SCRUB_CSS`) spielt nur der Weg vom
 * stehenden Video bis zu den gefüllten Kacheln — ohne Einblenden davor und
 * ohne das Ausblenden am Schleifenende. Das Ende soll stehen bleiben, solange
 * man es ansieht, und beim Zurückscrollen wieder zum Video werden.
 */
const SCRUB_FROM = remap(T.in)
const SCRUB_TO = P.done

/**
 * Dieselben Stationen, auf 0–100 % gedehnt. Den Anfang bildet der erste
 * Stand ab `SCRUB_FROM`, das Ende der letzte bis `SCRUB_TO` — beide halten
 * bis an den Rand, eine fehlende 0-/100-%-Station fiele sonst auf den
 * Grundwert des Elements zurück.
 */
function scrubbed(frames: Frames): Frames {
  const span = SCRUB_TO - SCRUB_FROM
  const inside = frames.filter(([p]) => p >= SCRUB_FROM && p <= SCRUB_TO)
  const edge = frames.filter(([p]) => p < SCRUB_FROM).at(-1) ?? frames[0]
  const head = inside[0] ?? edge
  const tail = inside.at(-1) ?? edge
  return [
    [0, head[1]],
    ...inside.map(([p, body]): [number, string] => [((p - SCRUB_FROM) / span) * 100, body]),
    [100, tail[1]],
  ]
}

/** Die Scroll-Fassungen, gesammelt, während `buildCss` die Schleife erzeugt. */
const SCRUB_FRAMES: string[] = []

type Frames = Array<[number, string]>

/**
 * `frames` sind Stationen der ersten drei Akte (alter Zeitplan, siehe `T`),
 * `publish` die des vierten, schon in Prozent der Schleife. Ohne `publish`
 * hält das Element seinen Stand von `T.hold` bis `OUTRO` und blendet dann
 * wie gewohnt aus. Mit `publish` übernimmt der vierte Akt ab `T.hold` — er
 * muss dann bis 100 % reichen.
 */
function keyframes(name: string, frames: Frames, publish?: Frames) {
  const list: Frames = publish
    ? [...frames.filter(([p]) => p <= T.hold).map(([p, css]): [number, string] => [remap(p), css]), ...publish]
    : frames.flatMap(([p, css], n): Frames =>
        p === T.hold && n < frames.length - 1
          ? [[remap(p), css], [OUTRO, css]]
          : [[remap(p), css]],
      )
  const body = (stations: Frames) => stations.map(([p, css]) => `${at(p)}{${css}}`).join('')
  SCRUB_FRAMES.push(`@keyframes ${name}{${body(scrubbed(list))}}`)
  return `@keyframes ${name}{${body(list)}}`
}

function segment(i: number) {
  const clip = CLIPS[i]
  const spread = i - (COUNT - 1) / 2

  const sliceCx = VIDEO.x + ((i + 0.5) * VIDEO.w) / COUNT
  const sliceCy = VIDEO.y + DROP + VIDEO.h / 2
  const cardX = CARDS_X + i * (CARD.w + CARD.gap)
  const dx0 = sliceCx - (cardX + CARD.w / 2)
  const dy0 = sliceCy - (CARD.y + CARD.h / 2)
  const dxApart = dx0 + spread * 1.3
  const dyApart = dy0 + 1.2

  const start = T.travel + i * T.stagger
  const land = start + T.flight
  const mid = (start + land) / 2

  // Das Bild in der Karte: erst genau der eigene Streifen, am Ende der
  // Ausschnitt um `focus` — ohne je über den Bildrand hinauszuzeigen.
  const img0 = CARD.w / 2 - (i + 0.5) * SLICE_LOCAL
  const img1x = clamp(CARD.w / 2 - clip.zoom * clip.focus[0] * FRAME_LOCAL, CARD.w - clip.zoom * FRAME_LOCAL, 0)
  const img1y = clamp(CARD.h / 2 - clip.zoom * clip.focus[1] * CARD.h, CARD.h - clip.zoom * CARD.h, 0)

  // Vierter Akt: abheben, in die Kachel fliegen, darin verschwinden.
  const launch = P.launch + LAUNCH[i] * P.stagger
  const arrive = arrival(i)
  const dxApp = APP.xs[DESTINATION[i]] - (cardX + CARD.w / 2)
  const dyApp = APP.y - (CARD.y + CARD.h / 2)

  const strip = `inset(0% ${f(CLIP_X)}% 0% ${f(CLIP_X)}% round ${cq(0.35 / K)})`
  const stripApart = `inset(0% ${f(CLIP_X)}% 0% ${f(CLIP_X)}% round ${cq(0.5)})`
  const card = `inset(0% 0% 0% 0% round ${cq(CARD.radius)})`

  return [
    keyframes(`lts-x${i}`, [
      [0, `transform:translateX(${cq(dx0)})`],
      [T.split, `transform:translateX(${cq(dx0)});animation-timing-function:${EASE.out}`],
      [T.apart, `transform:translateX(${cq(dxApart)})`],
      [start, `transform:translateX(${cq(dxApart)});animation-timing-function:${EASE.slot}`],
      [land, 'transform:translateX(0)'],
      [100, 'transform:translateX(0)'],
    ], [
      [launch, `transform:translateX(0);animation-timing-function:${EASE.inOut}`],
      [arrive, `transform:translateX(${cq(dxApp)})`],
      [100, `transform:translateX(${cq(dxApp)})`],
    ]),
    keyframes(`lts-y${i}`, [
      [0, `transform:translateY(${cq(dy0)})`],
      [T.split, `transform:translateY(${cq(dy0)});animation-timing-function:${EASE.out}`],
      [T.apart, `transform:translateY(${cq(dyApart)})`],
      [start, `transform:translateY(${cq(dyApart)});animation-timing-function:${EASE.fall}`],
      [land, 'transform:translateY(0)'],
      [T.hold, `transform:translateY(0);animation-timing-function:${EASE.in}`],
      [T.out, `transform:translateY(${cq(1.6)})`],
      [100, `transform:translateY(${cq(1.6)})`],
    ], [
      // Kurz in die Knie, dann hoch.
      [launch, `transform:translateY(0);animation-timing-function:${EASE.out}`],
      [launch + 1.2, `transform:translateY(${cq(0.6)});animation-timing-function:${EASE.lift}`],
      [arrive, `transform:translateY(${cq(dyApp)})`],
      [100, `transform:translateY(${cq(dyApp)})`],
    ]),
    keyframes(`lts-r${i}`, [
      [0, 'transform:rotate(0deg)'],
      [T.split, `transform:rotate(0deg);animation-timing-function:${EASE.out}`],
      [T.apart, `transform:rotate(${f(spread * 0.5)}deg)`],
      [start, `transform:rotate(${f(spread * 0.5)}deg);animation-timing-function:${EASE.inOut}`],
      [mid, `transform:rotate(${f(-spread * 1.8 - 0.8)}deg);animation-timing-function:${EASE.inOut}`],
      [land, 'transform:rotate(0deg)'],
      [100, 'transform:rotate(0deg)'],
    ], [
      // Im Flug neigt sich die Karte in ihre Richtung.
      [launch, `transform:rotate(0deg);animation-timing-function:${EASE.inOut}`],
      [(launch + arrive) / 2, `transform:rotate(${f(Math.sign(dxApp) * 6)}deg);animation-timing-function:${EASE.inOut}`],
      [arrive, 'transform:rotate(0deg)'],
      [100, 'transform:rotate(0deg)'],
    ]),
    keyframes(`lts-s${i}`, [
      [0, `transform:scale(${f(K)});clip-path:${strip}`],
      [T.split, `transform:scale(${f(K)});clip-path:${strip};animation-timing-function:${EASE.out}`],
      [T.apart, `transform:scale(${f(K * 1.03)});clip-path:${stripApart}`],
      [start, `transform:scale(${f(K * 1.03)});clip-path:${stripApart};animation-timing-function:${EASE.inOut}`],
      [land, `transform:scale(1);clip-path:${card}`],
      [T.hold, `transform:scale(1);clip-path:${card};animation-timing-function:${EASE.in}`],
      [T.out, `transform:scale(.96);clip-path:${card}`],
      [100, `transform:scale(.96);clip-path:${card}`],
    ], [
      [launch, `transform:scale(1);clip-path:${card};animation-timing-function:${EASE.out}`],
      [launch + 1.2, `transform:scale(1.04);clip-path:${card};animation-timing-function:${EASE.out}`],
      [arrive, `transform:scale(.18);clip-path:${card}`],
      [100, `transform:scale(.18);clip-path:${card}`],
    ]),
    // Sichtbar ab dem Bruch; verschwindet erst in der Kachel.
    keyframes(`lts-o${i}`, [
      [0, 'opacity:0'],
      [T.split - 0.1, 'opacity:0'],
      [T.split, 'opacity:1'],
      [T.hold, 'opacity:1'],
    ], [
      [arrive - 2, 'opacity:1'],
      [arrive - 0.2, 'opacity:0'],
      [100, 'opacity:0'],
    ]),
    keyframes(`lts-i${i}`, [
      [0, `transform:translate(${cq(img0)},0) scale(1)`],
      [start, `transform:translate(${cq(img0)},0) scale(1);animation-timing-function:${EASE.inOut}`],
      [land, `transform:translate(${cq(img1x)},${cq(img1y)}) scale(${clip.zoom})`],
      [100, `transform:translate(${cq(img1x)},${cq(img1y)}) scale(${clip.zoom})`],
    ]),
    // Lichtspur: am stärksten in der Mitte des Falls.
    keyframes(`lts-t${i}`, [
      [0, 'opacity:0;transform:scaleY(.2)'],
      [start, `opacity:0;transform:scaleY(.2);animation-timing-function:${EASE.inOut}`],
      [mid, `opacity:.85;transform:scaleY(1);animation-timing-function:${EASE.inOut}`],
      [land, 'opacity:0;transform:scaleY(.3)'],
      [100, 'opacity:0;transform:scaleY(.3)'],
    ]),
    // Kurzes Aufleuchten der Kante beim Aufsetzen.
    keyframes(`lts-f${i}`, [
      [0, 'opacity:0'],
      [land - 1, 'opacity:0'],
      [land + 0.6, `opacity:1;animation-timing-function:${EASE.out}`],
      [land + 6, 'opacity:.35'],
      [T.hold, 'opacity:.35'],
      [T.out, 'opacity:0'],
      [100, 'opacity:0'],
    ], [
      // Im Flug leuchtet die Kante wieder auf.
      [launch, `opacity:.35;animation-timing-function:${EASE.out}`],
      [launch + 2, 'opacity:1'],
      [100, 'opacity:1'],
    ]),
    keyframes(`lts-u${i}`, [
      [0, `opacity:0;transform:translateY(${cq(0.8)})`],
      [land + 0.5, `opacity:0;transform:translateY(${cq(0.8)});animation-timing-function:${EASE.out}`],
      [land + 4, 'opacity:1;transform:translateY(0)'],
      [T.hold, 'opacity:1;transform:translateY(0)'],
      [T.out - 1, 'opacity:0;transform:translateY(0)'],
      [100, 'opacity:0;transform:translateY(0)'],
    ], [
      [launch, 'opacity:1;transform:translateY(0)'],
      [launch + 3, 'opacity:0;transform:translateY(0)'],
      [100, 'opacity:0;transform:translateY(0)'],
    ]),
    keyframes(`lts-p${i}`, [
      [0, 'transform:scaleX(0)'],
      [land + 2, 'transform:scaleX(0);animation-timing-function:linear'],
      [T.hold, 'transform:scaleX(1)'],
      [100, 'transform:scaleX(1)'],
    ]),
  ].join('')
}

/** Splitter, die beim Bruch aus den Schnittlinien rieseln. Fest verteilt, nicht zufällig. */
const SHARDS = Array.from({ length: 16 }, (_, n) => {
  const line = n % (COUNT - 1)
  const row = Math.floor(n / (COUNT - 1))
  return {
    x: VIDEO.x + ((line + 1) * VIDEO.w) / COUNT + (((n * 7) % 5) - 2) * 0.35,
    y: VIDEO.y + DROP + 4 + row * 7 + ((n * 3) % 4),
    dx: (((n * 5) % 7) - 3) * 0.6,
    dy: 7 + ((n * 11) % 6),
    size: 0.28 + ((n * 13) % 4) * 0.08,
    delay: (n % 5) * 0.6,
  }
})

/**
 * Die Kacheln des vierten Akts: erscheinen, schlucken jeden ankommenden Clip
 * mit einem kurzen Anschwellen, leuchten ab dem ersten Treffer und zählen im
 * Badge mit. Das Ausblenden am Schleifenende trägt `lts-app` für alles darin.
 */
function appFrames() {
  return LANDING_PLATFORMS.map((_, k) => {
    const appear = P.apps + k * 0.8
    const hits = CLIPS.flatMap((__, i) => (DESTINATION[i] === k ? [arrival(i)] : [])).sort((a, b) => a - b)
    const pulse = (hit: number, from: string, to: string): Frames => [
      [hit - 0.3, `${from};animation-timing-function:${EASE.out}`],
      [hit + 0.8, to],
    ]
    return [
      keyframes(`lts-app${k}`, [], [
        [0, `opacity:0;transform:translateY(${cq(1.2)}) scale(.85)`],
        [appear, `opacity:0;transform:translateY(${cq(1.2)}) scale(.85);animation-timing-function:${EASE.out}`],
        [appear + 4, 'opacity:1;transform:translateY(0) scale(1)'],
        [OUTRO, `opacity:1;transform:translateY(0) scale(1);animation-timing-function:${EASE.in}`],
        [remap(T.out), 'opacity:0;transform:translateY(0) scale(.96)'],
        [100, 'opacity:0;transform:translateY(0) scale(.96)'],
      ]),
      keyframes(`lts-gulp${k}`, [], [
        [0, 'transform:scale(1)'],
        ...hits.flatMap((hit): Frames => [
          ...pulse(hit, 'transform:scale(1)', `transform:scale(1.12);animation-timing-function:${EASE.inOut}`),
          [hit + 3.2, 'transform:scale(1)'],
        ]),
        [100, 'transform:scale(1)'],
      ]),
      keyframes(`lts-lit${k}`, [], [
        [0, 'opacity:0'],
        ...hits.flatMap((hit, n): Frames => [
          ...pulse(hit, n === 0 ? 'opacity:0' : 'opacity:.45', 'opacity:1'),
          [hit + 3.2, 'opacity:.45'],
        ]),
        [100, 'opacity:.45'],
      ]),
      keyframes(`lts-badge${k}`, [], [
        [0, 'opacity:0;transform:scale(.4)'],
        [hits[0] - 0.2, `opacity:0;transform:scale(.4);animation-timing-function:${EASE.pop}`],
        [hits[0] + 1.6, 'opacity:1;transform:scale(1)'],
        [100, 'opacity:1;transform:scale(1)'],
      ]),
      // Die Zahl im Badge: jede steht, bis die nächste kommt.
      ...hits.map((hit, n) =>
        keyframes(`lts-n${k}-${n}`, [], [
          [0, `opacity:0;transform:translateY(${cq(0.5)})`],
          [hit - 0.2, `opacity:0;transform:translateY(${cq(0.5)});animation-timing-function:${EASE.out}`],
          [hit + 1.2, 'opacity:1;transform:translateY(0)'],
          ...(n < hits.length - 1
            ? ([
                [hits[n + 1] - 0.2, 'opacity:1;transform:translateY(0)'],
                [hits[n + 1] + 0.8, `opacity:0;transform:translateY(${cq(-0.5)})`],
                [100, `opacity:0;transform:translateY(${cq(-0.5)})`],
              ] as Frames)
            : ([[100, 'opacity:1;transform:translateY(0)']] as Frames)),
        ]),
      ),
    ].join('')
  }).join('')
}

/** Wie viele Clips bei Plattform `k` ankommen. */
const hitsOf = (k: number) => DESTINATION.filter((destination) => destination === k).length

/** Wann der Abspielkopf einen Moment erreicht (Prozent der Schleife). */
const litAt = (moment: number) => T.scanFrom + (moment + 0.03) * (T.scanTo - T.scanFrom)

function buildCss() {
  const shardFrames = SHARDS.map((shard, n) =>
    keyframes(`lts-sh${n}`, [
      [0, 'opacity:0;transform:translate(0,0) rotate(0deg)'],
      [T.split - 0.5 + shard.delay, `opacity:0;transform:translate(0,0) rotate(0deg);animation-timing-function:${EASE.out}`],
      [T.split + 1 + shard.delay, 'opacity:.9'],
      [T.split + 14 + shard.delay, `opacity:0;transform:translate(${cq(shard.dx)},${cq(shard.dy)}) rotate(${90 + n * 20}deg)`],
      [100, 'opacity:0'],
    ]),
  ).join('')

  // Jeder gefundene Moment reserviert unten seinen Platz — der Platz
  // verschwindet, sobald sein Clip darauf landet.
  const slotFrames = MOMENTS.map((moment, j) => {
    const land = T.travel + j * T.stagger + T.flight
    return keyframes(`lts-slot${j}`, [
      [0, 'opacity:0'],
      [litAt(moment) - 0.4, `opacity:0;animation-timing-function:${EASE.out}`],
      [litAt(moment) + 2, 'opacity:1'],
      [land - 1, 'opacity:1'],
      [land + 1, 'opacity:0'],
      [100, 'opacity:0'],
    ])
  }).join('')

  // Über jedem Moment springt sein Score auf, sobald der Abspielkopf ihn trifft.
  const scoreFrames = MOMENTS.map((moment, j) => {
    const lit = litAt(moment)
    return keyframes(`lts-sc${j}`, [
      [0, `opacity:0;transform:translateY(${cq(0.6)}) scale(.7)`],
      [lit - 0.2, `opacity:0;transform:translateY(${cq(0.6)}) scale(.7);animation-timing-function:${EASE.out}`],
      [lit + 2.2, 'opacity:1;transform:translateY(0) scale(1)'],
      [100, 'opacity:1;transform:translateY(0) scale(1)'],
    ])
  }).join('')

  const markerFrames = MOMENTS.map((moment, j) => {
    const lit = litAt(moment)
    return keyframes(`lts-m${j}`, [
      [0, 'opacity:.28;transform:scaleY(1)'],
      [lit - 0.4, `opacity:.28;transform:scaleY(1);animation-timing-function:${EASE.out}`],
      [lit + 0.6, 'opacity:1;transform:scaleY(2.2)'],
      [lit + 3, 'opacity:1;transform:scaleY(1.6)'],
      [100, 'opacity:1;transform:scaleY(1.6)'],
    ])
  }).join('')

  const cutFrames = Array.from({ length: COUNT - 1 }, (_, k) =>
    keyframes(`lts-c${k}`, [
      [0, 'opacity:0;transform:scaleY(0)'],
      [33 + k * 0.5, `opacity:1;transform:scaleY(0);animation-timing-function:${EASE.inOut}`],
      [37.5, 'opacity:1;transform:scaleY(1)'],
      [T.apart - 2, 'opacity:1;transform:scaleY(1)'],
      [T.apart + 2, 'opacity:0;transform:scaleY(1)'],
      [100, 'opacity:0;transform:scaleY(1)'],
    ]),
  ).join('')

  return [
    // Das ganze Video: einblenden, laufen lassen, sinken — und beim Bruch
    // an die Streifen übergeben, die darunter dasselbe Bild zeigen.
    keyframes('lts-video', [
      [0, `opacity:0;transform:translateY(${cq(-1.2)}) scale(.985);animation-timing-function:${EASE.out}`],
      [T.in, 'opacity:1;transform:translateY(0) scale(1)'],
      [T.drop, `transform:translateY(0) scale(1);animation-timing-function:${EASE.inOut}`],
      [T.split - 0.1, `opacity:1;transform:translateY(${cq(DROP)}) scale(1)`],
      [T.split, `opacity:0;transform:translateY(${cq(DROP)}) scale(1)`],
      [100, `opacity:0;transform:translateY(${cq(DROP)}) scale(1)`],
    ]),
    // Die Ecken werden im Sinken so klein wie die der Streifen danach.
    keyframes('lts-frame', [
      [0, `border-radius:${cq(VIDEO.radius)}`],
      [T.drop, `border-radius:${cq(VIDEO.radius)};animation-timing-function:${EASE.inOut}`],
      [T.split, `border-radius:${cq(0.35)}`],
      [100, `border-radius:${cq(0.35)}`],
    ]),
    keyframes('lts-chrome', [
      [0, 'opacity:1'],
      [T.drop, 'opacity:1'],
      [T.drop + 4, 'opacity:0'],
      [100, 'opacity:0'],
    ]),
    keyframes('lts-fill', [
      [0, 'transform:scaleX(0)'],
      [T.scanFrom, 'transform:scaleX(0);animation-timing-function:linear'],
      [T.scanTo, 'transform:scaleX(1)'],
      [100, 'transform:scaleX(1)'],
    ]),
    keyframes('lts-head', [
      [0, 'left:0%'],
      [T.scanFrom, 'left:0%;animation-timing-function:linear'],
      [T.scanTo, 'left:100%'],
      [100, 'left:100%'],
    ]),
    keyframes('lts-scan', [
      [0, `opacity:0;transform:translateX(${cq(-8)})`],
      [T.scanFrom, `opacity:0;transform:translateX(${cq(-8)});animation-timing-function:linear`],
      [T.scanFrom + 2, 'opacity:1'],
      [T.scanTo - 2, 'opacity:1'],
      [T.scanTo, `opacity:0;transform:translateX(${cq(VIDEO.w)})`],
      [100, `opacity:0;transform:translateX(${cq(VIDEO.w)})`],
    ]),
    keyframes('lts-searching', [
      [0, 'opacity:0'],
      [T.scanFrom, 'opacity:1'],
      [T.scanTo - 3, 'opacity:1'],
      [T.scanTo - 2, 'opacity:0'],
      [100, 'opacity:0'],
    ]),
    keyframes('lts-found', [
      [0, 'opacity:0'],
      [T.scanTo - 2, 'opacity:0'],
      [T.scanTo - 1, 'opacity:1'],
      [100, 'opacity:1'],
    ]),
    keyframes('lts-cut', [
      [0, 'transform:translateY(0)'],
      [T.drop, `transform:translateY(0);animation-timing-function:${EASE.inOut}`],
      [T.split - 0.1, `transform:translateY(${cq(DROP)})`],
      [100, `transform:translateY(${cq(DROP)})`],
    ]),
    keyframes('lts-bottom', [
      [0, 'opacity:0'],
      [T.travel + (COUNT - 1) * T.stagger + T.flight, 'opacity:0'],
      [T.travel + (COUNT - 1) * T.stagger + T.flight + 4, 'opacity:1'],
      [T.hold, 'opacity:1'],
      [T.out, 'opacity:0'],
      [100, 'opacity:0'],
    ], [
      // Der Boden geht mit den Clips.
      [P.launch + 3, 'opacity:1'],
      [P.launch + 11, 'opacity:0'],
      [100, 'opacity:0'],
    ]),
    // Wo das Video war, bleibt sein Umriss — die Herkunft der Clips.
    keyframes('lts-ghost', [
      [0, 'opacity:0'],
      [T.split, `opacity:0;animation-timing-function:${EASE.out}`],
      [T.split + 6, 'opacity:1'],
      [T.hold, 'opacity:1'],
      [T.out, 'opacity:0'],
      [100, 'opacity:0'],
    ], [
      // Wo das Original stand, stehen jetzt die Kanäle.
      [P.apps, 'opacity:1'],
      [P.apps + 4, 'opacity:0'],
      [100, 'opacity:0'],
    ]),
    // Die Schlusszeile unter den Kacheln.
    keyframes('lts-pub', [], [
      [0, 'opacity:0'],
      [P.done - 5, `opacity:0;animation-timing-function:${EASE.out}`],
      [P.done - 1, 'opacity:1'],
      [OUTRO, 'opacity:1'],
      [remap(T.out), 'opacity:0'],
      [100, 'opacity:0'],
    ]),
    appFrames(),
    cutFrames,
    slotFrames,
    scoreFrames,
    markerFrames,
    shardFrames,
    ...CLIPS.map((_, i) => segment(i)),
    // Ohne Bewegung: die fertigen Clips als Standbild.
    `@media (prefers-reduced-motion:reduce){.lts-stage *{animation-delay:${f((-DURATION * remap(84)) / 100)}s!important;animation-play-state:paused!important}}`,
  ].join('')
}

/** Station der Scroll-Fassung für eine Station der Schleife (neuer Zeitplan). */
const toScrub = (percent: number) => ((percent - SCRUB_FROM) / (SCRUB_TO - SCRUB_FROM)) * 100

/** Die fünf Abschnitte unter der Bühne und ab wann sie erreicht sind. */
const STEPS = [
  { label: 'Finden', at: 0 },
  { label: 'Schneiden', at: toScrub(remap(T.drop)) },
  { label: 'Hochformat', at: toScrub(remap(T.travel)) },
  { label: 'Fertig', at: toScrub(remap(T.travel + (COUNT - 1) * T.stagger + T.flight)) },
  { label: 'Posten', at: toScrub(P.launch) },
]

/**
 * Über diesen Teil der Scroll-Strecke läuft die Verwandlung; im Rest bleiben
 * die fertigen Clips stehen, bevor die Bühne weiterzieht.
 */
const SCRUB_END = 86
const SCRUB_RANGE = `contain 0% contain ${SCRUB_END}%`

/** Alles, was die Scroll-Strecke antreibt — für CSS und `SmoothScrub`. */
const SCRUBBED = '.lts-stage *:not(.animate-pulse),.lts-step,.lts-rail-fill,.lts-hint,.lts-glow'

/**
 * Die Scroll-Fassung: Die Bühne klebt in der Mitte des Fensters, und der
 * Scrollweg darunter treibt dieselben Keyframes an wie sonst die Uhr. Wer
 * scrollt, zerlegt das Video selbst — und setzt es rückwärts wieder zusammen.
 *
 * Die Stil-Attribute der Elemente setzen `animation` als Kurzschreibweise,
 * und die stellt die Timeline auf die Uhr zurück. Deshalb `!important`: Nur
 * so gewinnt die Scroll-Timeline gegen das Inline-Attribut, ohne dass die
 * Schleife als Rückfall eigene Elemente bräuchte.
 *
 * `--lts-w` ist die Breite der Bühne, so gewählt, dass Bühne und Leiste
 * darunter immer ins Fenster passen; `top` zentriert beides unter der
 * Kopfleiste (4rem). `100vw` statt der tatsächlichen Breite ist hier nur für
 * die Zentrierung — um eine Scrollleiste daneben liegt sie nicht sichtbar.
 */
const SCRUB_CSS = [
  `.lts-scrub{view-timeline:--lts block;--lts-w:min(56rem,100vw - 2rem,(100svh - 10rem)*1.3)}`,
  // Die Scroll-Strecke als Inhalt, nicht als Innenabstand: `sticky` bewegt
  // sich nur innerhalb der Inhaltsbox seines Elternteils. Mit Untergrenze in
  // Pixeln: Nur in `svh` gerechnet wurde sie in kleinen Fenstern so kurz,
  // dass die ganze Verwandlung in fünf Rasten des Mausrads vorbei war.
  `.lts-scrub::after{content:'';display:block;height:max(160svh,1300px)}`,
  `@media (min-width:40rem){.lts-scrub{--lts-w:min(56rem,100vw - 3rem,(100svh - 10rem)*1.3)}}`,
  // Mit dem Mausrad länger als mit dem Finger: Ein Wisch trägt weit, eine
  // Raste nur rund 100 px — und die Verwandlung soll über viele Rasten gehen.
  // Nicht länger: Mit über vier Fenstern Strecke (440svh) war der Hero gut
  // sechs Bildschirme hoch, und die meisten davon zeigten fast nur Schwarz —
  // es sah aus, als hinge die Seite. So bleiben rund vier Rasten pro Akt.
  `@media (min-width:64rem),(hover:hover) and (pointer:fine){.lts-scrub::after{height:max(240svh,2100px)}}`,
  `.lts-pin{position:sticky;top:calc(4rem + (100svh - 4rem - var(--lts-w)*${STAGE_H / 100} - 3.5rem)/2);width:min(100%,var(--lts-w));margin-inline:auto}`,
  `${SCRUBBED}{animation-timeline:--lts!important;animation-iteration-count:1!important;animation-fill-mode:both!important;animation-range:${SCRUB_RANGE}!important}`,
  // Mit `SmoothScrub`: dieselben Keyframes, aber angehalten und eine Sekunde
  // lang — die Zeit setzt das Skript, das dem Scrollen weich nachzieht.
  `.lts-scrub[data-smooth] :is(${SCRUBBED}){animation-timeline:auto!important;animation-range:normal!important;animation-duration:1s!important;animation-delay:0s!important;animation-play-state:paused!important}`,
  '.lts-step,.lts-rail-fill,.lts-hint,.lts-glow{animation-timing-function:linear}',
  '.lts-rail,.lts-hint{display:flex}',
  // Das Mausrad im Hinweis dreht sich nach Uhr — es zeigt, was zu tun ist.
  '.lts-wheel{animation:lts-wheel 1.6s var(--ease-out-quint) infinite}',
  '@keyframes lts-wheel{0%{transform:translateY(0);opacity:1}70%{transform:translateY(.3rem);opacity:0}100%{transform:translateY(0);opacity:0}}',
  ...STEPS.map(({ at: reached }, n) =>
    n === 0
      ? `@keyframes lts-step0{from,to{opacity:1}}`
      : keyframesOnce(`lts-step${n}`, [
          [0, 'opacity:.35'],
          [reached - 1.5, 'opacity:.35'],
          [reached + 1.5, 'opacity:1'],
          [100, 'opacity:1'],
        ]),
  ),
  // Der Balken steht unter der Mitte jedes Abschnitts, sobald der erreicht ist.
  keyframesOnce('lts-rail', [
    ...STEPS.map(({ at: reached }, n): [number, string] => [reached, `transform:scaleX(${(n + 0.5) / STEPS.length})`]),
    [100, 'transform:scaleX(1)'],
  ]),
  // Das Licht hinter der Bühne wächst, je weiter die Verwandlung ist — am
  // hellsten, wenn die fertigen Clips stehen.
  keyframesOnce('lts-glow', [
    [0, 'opacity:.35;transform:scale(.8)'],
    [STEPS[3].at, 'opacity:1;transform:scale(1)'],
    [100, 'opacity:1;transform:scale(1)'],
  ]),
  keyframesOnce('lts-hint', [
    [0, 'opacity:1;transform:translateY(0)'],
    [3, 'opacity:1;transform:translateY(0)'],
    [10, 'opacity:0;transform:translateY(.5rem)'],
    [100, 'opacity:0;transform:translateY(.5rem)'],
  ]),
].join('')

/** Keyframes nur für die Scroll-Fassung — ohne Gegenstück in der Schleife. */
function keyframesOnce(name: string, frames: Array<[number, string]>) {
  return `@keyframes ${name}{${frames.map(([p, body]) => `${at(p)}{${body}}`).join('')}}`
}

/**
 * Schleife zuerst, die Scroll-Fassung danach: Gleichnamige `@keyframes`
 * überschreiben die früheren, sobald die Bedingung um sie herum greift.
 * `buildCss` füllt `SCRUB_FRAMES` und muss deshalb vorher laufen.
 */
const LOOP_CSS = buildCss()
const CSS =
  LOOP_CSS +
  '@supports (animation-timeline:view()){@media (prefers-reduced-motion:no-preference){' +
  SCRUB_CSS +
  SCRUB_FRAMES.join('') +
  '}}'

/**
 * Eine Animation, die mit der Schleife läuft. Die Kurven stehen in den
 * Keyframes selbst, jeder Abschnitt hat seine eigene.
 */
const run = (...names: string[]): React.CSSProperties => ({
  animation: names.map((name) => `${name} ${DURATION}s linear infinite`).join(','),
})

/**
 * Außen der Scroll-Rahmen (`.lts-scrub`): Mit Scroll-Timelines wird er um
 * die Scroll-Strecke höher, und die Bühne darin klebt, bis die Strecke
 * durchgescrollt ist. Ohne sie ist er ein gewöhnlicher Block, und die
 * Bühne läuft als Schleife — Hinweis und Leiste bleiben dann ausgeblendet.
 */
export function LongformToShorts({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`lts-scrub ${className ?? ''}`} style={style}>
      <style>{CSS}</style>
      <SmoothScrub selector={SCRUBBED} end={SCRUB_END / 100} />
      <figure className="lts-pin relative" style={{ containerType: 'inline-size' }}>
        {/* Licht in Logo-Blau hinter den Zielplätzen. Beim Kleben ist der
            Shader längst weggescrollt; ohne eigenes Licht stünde die Bühne
            auf flachem Schwarz. Breiter als die Bühne — der Rand der Seite
            schneidet es ab (`overflow-x: clip` an der Wurzel). */}
        <div
          aria-hidden
          className="lts-glow pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(0_160_252/0.2),rgb(0_160_252/0.06)_60%,transparent)]"
          style={{ top: '30cqw', width: '120cqw', height: '62cqw', animationName: 'lts-glow' }}
        />
        <div
          aria-hidden
          className="lts-stage relative w-full select-none"
          style={{ containerType: 'inline-size', aspectRatio: `100 / ${STAGE_H}` }}
        >
          <div
            className="absolute rounded-full"
            style={{ left: '15cqw', top: '-4cqw', width: '70cqw', height: '46cqw', background: 'radial-gradient(closest-side,rgb(255 255 255/0.12),transparent)' }}
          />
          <div
            className="absolute rounded-full"
            style={{ left: '8cqw', top: '44cqw', width: '84cqw', height: '34cqw', background: 'radial-gradient(closest-side,rgb(255 255 255/0.07),transparent)' }}
          />

          {/* Beschriftung oben und unten: was hineingeht, was herauskommt. */}
          <Label y={CARD.y + CARD.h + 2.2} style={run('lts-bottom')}>5 Shorts · 9:16 · untertitelt und bewertet</Label>

          {/* Der Nachhall des Originals: Wo das Video war, bleibt es weich und
              blass stehen — die Herkunft der Clips, ohne Rahmen. */}
          <div
            className="absolute overflow-hidden [mask-image:linear-gradient(to_bottom,#000_30%,transparent)]"
            style={{
              left: cq(VIDEO.x),
              top: cq(VIDEO.y + DROP),
              width: cq(VIDEO.w),
              height: cq(VIDEO.h),
              borderRadius: cq(VIDEO.radius),
              ...run('lts-ghost'),
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- dekorativ, per URL zugeschnitten */}
            <img
              src={FRAME_SRC}
              alt=""
              draggable={false}
              className="absolute inset-0 size-full object-cover opacity-[0.11] blur-[0.6cqw] grayscale"
            />
          </div>

          {/* Jeder gefundene Moment bekommt unten seinen Sockel, mit Länge — dort landet nachher sein Clip. */}
          {MOMENTS.map((moment, j) => (
            <div
              key={moment}
              className="absolute flex flex-col items-center justify-center overflow-hidden bg-white/[0.035] ring-1 ring-white/10 ring-inset"
              style={{
                left: cq(CARDS_X + j * (CARD.w + CARD.gap)),
                top: cq(CARD.y),
                width: cq(CARD.w),
                height: cq(CARD.h),
                borderRadius: cq(CARD.radius),
                ...run(`lts-slot${j}`),
              }}
            >
              <span className="absolute inset-x-0 bottom-0 h-2/3 bg-[radial-gradient(70%_80%_at_50%_100%,rgb(0_160_252/0.22),transparent)]" />
              <span className="relative font-mono tracking-[0.08em] text-white/45 uppercase @max-[36rem]:hidden" style={{ fontSize: '0.75cqw' }}>
                Moment {j + 1} · {CLIPS[j].time}
              </span>
            </div>
          ))}

          {/* Die Bühne der fertigen Clips: eine Lichtkante, auf der sie stehen. */}
          <div
            className="absolute"
            style={{ left: cq(CARDS_X - 4), right: cq(CARDS_X - 4), top: cq(CARD.y + CARD.h + 0.4), height: cq(4), ...run('lts-bottom') }}
          >
            <span className="absolute inset-x-0 top-0 h-[0.15cqw] bg-gradient-to-r from-transparent via-brand to-transparent shadow-[0_0_1.2cqw_rgb(0_160_252/0.8)]" />
            <span className="absolute inset-x-[6%] top-0 h-full bg-[radial-gradient(50%_100%_at_50%_0%,rgb(0_160_252/0.35),transparent)]" />
          </div>

          {/* ---------------------------------------------- Kanäle (4. Akt) */}
          {LANDING_PLATFORMS.map((platform, k) => (
            <div
              key={platform}
              className="absolute"
              style={{
                left: cq(APP.xs[k] - APP.size / 2),
                top: cq(APP.y - APP.size / 2),
                width: cq(APP.size),
                height: cq(APP.size),
                ...run(`lts-app${k}`),
              }}
            >
              <div className="absolute inset-0" style={run(`lts-gulp${k}`)}>
                <div
                  className="absolute inset-0 flex items-center justify-center bg-white/[0.06] ring-1 ring-white/15 backdrop-blur-sm ring-inset"
                  style={{ borderRadius: cq(APP.radius) }}
                >
                  <span className="absolute inset-x-[15%] top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
                  <PlatformLogo platform={platform} className="size-[4.6cqw] text-white" />
                </div>
                {/* Leuchtet, sobald der erste Clip angekommen ist. */}
                <div
                  className="absolute inset-0 shadow-[0_0_2.4cqw_rgb(0_160_252/0.55)] ring-[0.18cqw] ring-brand ring-inset"
                  style={{ borderRadius: cq(APP.radius), ...run(`lts-lit${k}`) }}
                />
              </div>

              <span
                className="absolute flex items-center justify-center rounded-full bg-brand font-semibold text-brand-ink tabular-nums shadow-[0_0_1.2cqw_rgb(0_160_252/0.7)]"
                // Auf dem Handy wären 2,6 cqw kaum 9 px — die Zahl soll lesbar bleiben.
                style={{
                  right: `min(${cq(-1)},-5px)`,
                  top: `min(${cq(-1)},-5px)`,
                  width: `max(${cq(2.6)},15px)`,
                  height: `max(${cq(2.6)},15px)`,
                  fontSize: `max(${cq(1.25)},9px)`,
                  ...run(`lts-badge${k}`),
                }}
              >
                {Array.from({ length: hitsOf(k) }, (_, n) => (
                  <span key={n} className="absolute" style={run(`lts-n${k}-${n}`)}>
                    {n + 1}
                  </span>
                ))}
              </span>

              <span
                className="absolute left-1/2 -translate-x-1/2 font-medium whitespace-nowrap text-white/60"
                style={{ top: `calc(100% + ${cq(1.2)})`, fontSize: 'max(8px,1.05cqw)' }}
              >
                {PLATFORM_LABEL[platform]}
              </span>
            </div>
          ))}

          <Label y={APP.y + APP.size / 2 + 5.2} style={run('lts-pub')}>
            5 Shorts · automatisch veröffentlicht
          </Label>

          {/* ---------------------------------------------------------- Video */}
          <div
            className="absolute overflow-hidden shadow-[0_2cqw_6cqw_rgb(0_0_0/0.55)] ring-1 ring-white/15"
            style={{
              left: cq(VIDEO.x),
              top: cq(VIDEO.y),
              width: cq(VIDEO.w),
              height: cq(VIDEO.h),
              ...run('lts-video', 'lts-frame'),
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- dekorativ, per URL zugeschnitten */}
            <img src={FRAME_SRC} alt="" draggable={false} className="absolute inset-0 size-full object-cover" />

            {/* Scan: ein Lichtband, das über das Bild fährt, während die KI sucht. */}
            <div
              className="absolute inset-y-0 mix-blend-screen"
              style={{
                left: 0,
                width: '8cqw',
                background: 'linear-gradient(90deg,transparent,rgb(4 157 255/0.35) 70%,rgb(203 233 255/0.9) 96%,transparent)',
                ...run('lts-scan'),
              }}
            />

            <div className="absolute inset-0" style={run('lts-chrome')}>
              <div className="absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-t from-black/80 to-transparent" />

              <div className="absolute flex items-center gap-[0.6cqw]" style={{ left: '1.6cqw', top: '1.4cqw' }}>
                <Chip>58:12</Chip>
              </div>

              {/* Über den Scores der Zeitleiste, nicht auf ihnen. */}
              <div className="absolute" style={{ left: '1.6cqw', bottom: '4.8cqw' }}>
                <span className="absolute bottom-0 left-0 whitespace-nowrap" style={run('lts-searching')}>
                  <Chip>
                    <span className="size-[0.6cqw] animate-pulse rounded-full bg-brand" />
                    Momente werden gesucht …
                  </Chip>
                </span>
                <span className="absolute bottom-0 left-0 whitespace-nowrap" style={run('lts-found')}>
                  <Chip>
                    <span className="size-[0.6cqw] rounded-full bg-brand" />
                    5 Momente gefunden
                  </Chip>
                </span>
              </div>

              {/* Zeitleiste mit Abspielkopf und den gefundenen Momenten. Was
                  die KI findet und schneidet, trägt das Blau des Logos. */}
              <div className="absolute" style={{ left: '1.6cqw', right: '1.6cqw', bottom: '1.6cqw', height: '0.32cqw' }}>
                <div className="absolute inset-0 rounded-full bg-white/20" />
                <div className="absolute inset-0 origin-left rounded-full bg-white/55" style={run('lts-fill')} />
                {MOMENTS.map((moment, j) => (
                  <div
                    key={moment}
                    className="absolute inset-y-0 rounded-full bg-brand shadow-[0_0_1cqw_rgb(0_160_252/0.9)]"
                    style={{ left: `${moment * 100}%`, width: '5.5%', ...run(`lts-m${j}`) }}
                  />
                ))}
                {MOMENTS.map((moment, j) => (
                  <span
                    key={moment}
                    className="absolute bottom-[1.1cqw] rounded-full bg-brand font-semibold text-brand-ink tabular-nums shadow-[0_0_1.2cqw_rgb(0_160_252/0.7)]"
                    style={{
                      left: `${(moment + 0.0275) * 100}%`,
                      marginLeft: '-1.25cqw',
                      fontSize: 'max(7px,0.85cqw)',
                      padding: '0.15cqw 0.45cqw',
                      ...run(`lts-sc${j}`),
                    }}
                  >
                    {CLIPS[j].score}
                  </span>
                ))}
                <div
                  className="absolute top-1/2 size-[1cqw] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_1cqw_rgb(255_255_255/0.9)]"
                  style={run('lts-head')}
                />
              </div>
            </div>
          </div>

          {/* ---------------------------------------------------- Schnittlinien */}
          <div
            className="absolute"
            style={{ left: cq(VIDEO.x), top: cq(VIDEO.y), width: cq(VIDEO.w), height: cq(VIDEO.h), ...run('lts-cut') }}
          >
            {Array.from({ length: COUNT - 1 }, (_, k) => (
              <div
                key={k}
                className="absolute inset-y-[-1cqw] origin-top bg-brand-light shadow-[0_0_1.2cqw_rgb(0_160_252/0.95)]"
                style={{ left: `${((k + 1) * 100) / COUNT}%`, width: '0.14cqw', marginLeft: '-0.07cqw', ...run(`lts-c${k}`) }}
              />
            ))}
          </div>

          {SHARDS.map((shard, n) => (
            <div
              key={n}
              className="absolute rounded-[0.08cqw] bg-white/80"
              style={{ left: cq(shard.x), top: cq(shard.y), width: cq(shard.size), height: cq(shard.size), ...run(`lts-sh${n}`) }}
            />
          ))}

          {/* ---------------------------------------------- Streifen → Clips */}
          {CLIPS.map((clip, i) => (
            <div
              key={clip.score}
              className="absolute"
              style={{
                left: cq(CARDS_X + i * (CARD.w + CARD.gap)),
                top: cq(CARD.y),
                width: cq(CARD.w),
                height: cq(CARD.h),
                ...run(`lts-x${i}`, `lts-o${i}`),
              }}
            >
              <div className="absolute inset-0" style={run(`lts-y${i}`)}>
                <div className="absolute inset-0" style={run(`lts-r${i}`)}>
                  {/* Lichtspur hinter der fallenden Karte. */}
                  <div
                    className="absolute bottom-[40%] left-1/2 origin-bottom -translate-x-1/2 blur-[0.4cqw]"
                    style={{
                      width: '62%',
                      height: '26cqw',
                      background: 'linear-gradient(to top,rgb(255 255 255/0.28),transparent)',
                      ...run(`lts-t${i}`),
                    }}
                  />

                  <div className="absolute inset-0 overflow-hidden bg-neutral-900" style={run(`lts-s${i}`)}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- dekorativ, per URL zugeschnitten */}
                    <img
                      src={FRAME_SRC}
                      alt=""
                      draggable={false}
                      className="absolute top-0 left-0 max-w-none origin-top-left object-cover"
                      style={{ width: cq(FRAME_LOCAL), height: cq(CARD.h), ...run(`lts-i${i}`) }}
                    />

                    <div className="absolute inset-0 ring-1 ring-white/40 ring-inset" style={{ borderRadius: 'inherit', ...run(`lts-f${i}`) }} />

                    <ClipOverlay clip={clip} style={run(`lts-u${i}`)} progress={run(`lts-p${i}`)} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Nur mit Scroll-Timeline sichtbar: Am Anfang sagt ein Hinweis, was
            zu tun ist; er verschwindet mit dem ersten Stück Scrollweg. Er
            liegt dort, wo später die Clips landen — bis dahin ist die Fläche leer. */}
        <div
          aria-hidden
          className="lts-hint pointer-events-none absolute inset-x-0 hidden justify-center"
          style={{ top: '58cqw', animationName: 'lts-hint' }}
        >
          <span className="glass-chip inline-flex items-center gap-2.5 rounded-full py-1.5 pr-3.5 pl-2 text-xs font-medium text-white/85">
            <span className="flex h-5 w-3.5 shrink-0 justify-center rounded-full ring-1 ring-white/45 ring-inset">
              <span className="lts-wheel mt-1 h-1.5 w-0.5 rounded-full bg-brand" />
            </span>
            <span>
              Scrollen<span className="hidden sm:inline"> — aus einem Video werden fünf Shorts</span>
            </span>
          </span>
        </div>

        {/* Wo die Verwandlung gerade steht. Der Balken rückt mit dem
            Scrollweg vor und steht unter jedem erreichten Abschnitt. */}
        <div aria-hidden className="lts-rail mx-auto mt-4 hidden w-full max-w-lg flex-col gap-2.5 px-2">
          <ol className="grid grid-cols-5 text-center">
            {STEPS.map((step, n) => (
              <li
                key={step.label}
                className="lts-step text-[0.5625rem] font-medium tracking-[0.06em] text-white uppercase sm:text-[0.625rem] sm:tracking-[0.14em]"
                style={{ animationName: `lts-step${n}` }}
              >
                {step.label}
              </li>
            ))}
          </ol>
          <div className="relative h-px w-full bg-white/15">
            <div
              className="lts-rail-fill absolute inset-0 origin-left bg-gradient-to-r from-brand-deep via-brand to-brand-light shadow-[0_0_8px_rgb(0_160_252/0.7)]"
              style={{ animationName: 'lts-rail' }}
            />
          </div>
        </div>

        <figcaption className="sr-only">
          Ein langes Querformat-Video zerfällt in fünf Abschnitte, die zu fertigen
          Shorts im Format 9:16 werden — mit Untertiteln, Score und Laufzeit. Danach
          fliegen die Shorts zu YouTube, TikTok und Instagram.
        </figcaption>
      </figure>
    </div>
  )
}

function Label({ y, style, children }: { y: number; style: React.CSSProperties; children: React.ReactNode }) {
  return (
    <p
      className="absolute inset-x-0 flex items-center justify-center gap-[1cqw] font-medium tracking-[0.18em] text-white/55 uppercase"
      style={{ top: cq(y), fontSize: 'max(9px,1.05cqw)', ...style }}
    >
      <span className="h-px w-[4cqw] bg-gradient-to-r from-transparent to-white/30" />
      {children}
      <span className="h-px w-[4cqw] bg-gradient-to-l from-transparent to-white/30" />
    </p>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-[0.5cqw] rounded-full bg-black/45 font-medium text-white/90 ring-1 ring-white/15 backdrop-blur-sm"
      style={{ fontSize: '0.95cqw', padding: '0.35cqw 0.8cqw' }}
    >
      {children}
    </span>
  )
}

function ClipOverlay({
  clip,
  style,
  progress,
}: {
  clip: (typeof CLIPS)[number]
  style: React.CSSProperties
  progress: React.CSSProperties
}) {
  return (
    <div className="absolute inset-0" style={style}>
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/75 to-transparent" />

      <span
        className="absolute inline-flex items-center gap-[0.35cqw] rounded-full bg-black/50 font-semibold text-white ring-1 ring-white/15 tabular-nums"
        style={{ left: '0.7cqw', top: '0.7cqw', fontSize: '0.8cqw', padding: '0.2cqw 0.55cqw' }}
      >
        <span className="size-[0.45cqw] rounded-full bg-brand" />
        {clip.score}
      </span>

      <p
        className="absolute inset-x-[0.6cqw] text-center leading-[1.15] font-extrabold tracking-tight text-white uppercase [text-shadow:0_0.15cqw_0.5cqw_rgb(0_0_0/0.7)]"
        style={{ top: '56%', fontSize: '1.2cqw' }}
      >
        {clip.words.map((word, w) => (
          <React.Fragment key={w}>
            {w > 0 ? ' ' : null}
            {w === clip.hot ? (
              <span className="rounded-[0.2cqw] bg-brand px-[0.25cqw] text-brand-ink [text-shadow:none]">{word}</span>
            ) : (
              word
            )}
          </React.Fragment>
        ))}
      </p>

      <div className="absolute inset-x-[0.7cqw] flex items-center gap-[0.5cqw]" style={{ bottom: '0.8cqw' }}>
        <div className="relative h-[0.22cqw] flex-1 overflow-hidden rounded-full bg-white/25">
          <div className="absolute inset-0 origin-left rounded-full bg-white" style={progress} />
        </div>
        <span className="font-medium text-white/80 tabular-nums" style={{ fontSize: '0.7cqw' }}>
          {clip.time}
        </span>
      </div>
    </div>
  )
}

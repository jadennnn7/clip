'use client'

import { useEffect, useRef } from 'react'
import { coverBox, SKY_POLE_X, SKY_POLE_Y, skyAngle } from './sky-motion'

/**
 * Der Nachthimmel hinter dem Hero — selbst gezeichnet statt Video, in den
 * Farben des früheren Hintergrundvideos (`hero-loop-smooth.mp4`, aus dessen
 * 4K-Original gemessen): fast schwarzes Navy oben (#01020b), zum Horizont
 * tiefes Blau (#08234b → #143669), eine Milchstraße in gesättigtem Blau
 * (#0f3464 → #1351b2, Kerne #3071df) mit dunklen Staubbändern, quer von
 * links unten zur oberen Mitte wie im Video, und blauweiße Sterne (#c1dafc).
 *
 * Ein Fragment-Shader zeichnet alles: Verlauf, Milchstraße aus Rauschen,
 * drei Lagen Sterne (dichter Staub, mittlere, funkelnde mit Kreuzstrahlen).
 * Der Himmel dreht sich langsam um einen Punkt rechts außerhalb des Bilds
 * (`sky-motion.ts`), der Verlauf bleibt stehen.
 *
 * Läuft mit 30 Bildern/s und nur, solange er im Bild ist. Mit „Bewegung
 * reduzieren" steht er still. Ohne WebGL bleibt die Grundfarbe.
 */
const VERTEX_SHADER = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uDpr;
uniform float uTime;
uniform float uAngle;
uniform vec2 uPole;
uniform vec3 uBox;
out vec4 outColor;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = r * p * 2.03 + 7.1;
    a *= 0.5;
  }
  return v;
}

vec3 rgb(float r, float g, float b) { return vec3(r, g, b) / 255.0; }

// Verlauf von oben nach unten, gemessen am Video (Spalte rechts der Mitte).
vec3 skyGradient(float y) {
  vec3 c = rgb(1.0, 3.0, 16.0);
  c = mix(c, rgb(0.0, 2.0, 12.0), clamp(y / 0.12, 0.0, 1.0));
  c = mix(c, rgb(1.0, 2.0, 14.0), clamp((y - 0.12) / 0.53, 0.0, 1.0));
  c = mix(c, rgb(0.0, 3.0, 22.0), clamp((y - 0.65) / 0.1, 0.0, 1.0));
  c = mix(c, rgb(0.0, 10.0, 39.0), clamp((y - 0.75) / 0.1, 0.0, 1.0));
  c = mix(c, rgb(1.0, 23.0, 60.0), clamp((y - 0.85) / 0.05, 0.0, 1.0));
  c = mix(c, rgb(8.0, 35.0, 75.0), clamp((y - 0.9) / 0.05, 0.0, 1.0));
  c = mix(c, rgb(20.0, 54.0, 105.0), clamp((y - 0.95) / 0.05, 0.0, 1.0));
  return c;
}

// Ein Stern je Zelle (oder keiner): Helligkeit, Gauß in CSS-Pixeln.
// \`spread\` > 1 macht die meisten Sterne schwach und wenige hell.
float stars(vec2 q, float cell, float density, float sigma, float spread, float seed) {
  vec2 g = q / cell;
  vec2 id = floor(g);
  if (hash12(id + seed) > density) return 0.0;
  vec2 pos = 0.2 + 0.6 * hash22(id + seed * 1.7);
  float d = length(fract(g) - pos) * cell * uBox.z;
  float b = pow(hash12(id + seed * 2.3), spread);
  return b * exp(-d * d / (2.0 * sigma * sigma));
}

// Ein Stück Milchstraße entlang der Achse \`dir\` ab \`from\`: körnig aus vielen
// kleinen Wolkenflecken, mit zerrissenen Staubbahnen in der Mitte.
// x = Leuchten, y = Nähe zur Mitte (für Sterndichte und Schimmer).
vec2 milkyWay(vec2 q, vec2 from, vec2 dir, float halfWidth, float seed) {
  vec2 nrm = vec2(-dir.y, dir.x);
  vec2 rel = q - from;
  float along = dot(rel, dir);
  float across = dot(rel, nrm);
  across -= 0.04 * sin(along * 2.6 + seed) + 0.08 * (fbm(vec2(along * 1.6, seed)) - 0.5);
  float width = halfWidth * (0.8 + 0.5 * fbm(vec2(along * 1.3, seed + 4.0)));
  float core = exp(-(across * across) / (width * width));
  float clumps = fbm(q * 48.0 + seed);
  float clouds = fbm(vec2(along * 6.0, across * 14.0) + seed * 2.0);
  float light = core
    * (0.4 + 0.6 * smoothstep(0.35, 0.72, clouds))
    * (0.7 + 0.55 * smoothstep(0.45, 0.82, clumps));
  // Staub: zerrissene Flecken und eine dunkle Bahn knapp neben der Mitte,
  // die das Band streckenweise in zwei Ströme teilt.
  float lane = fbm(vec2(along * 3.5, across * 9.0) + seed + 11.0);
  float split = (across - 0.012) / (width * 0.22);
  float dust = max(
    smoothstep(0.45, 0.62, lane) * exp(-(across * across) / (width * width * 0.6)),
    0.85 * exp(-split * split) * smoothstep(0.35, 0.6, fbm(vec2(along * 4.0, seed + 2.0))));
  return vec2(light * (1.0 - 0.95 * dust), core * (1.0 - 0.8 * dust));
}

void main() {
  vec2 css = vec2(gl_FragCoord.x, uRes.y * uDpr - gl_FragCoord.y) / uDpr;
  vec2 p = (css - uBox.xy) / uBox.z;

  // Der Himmel dreht sich um den Pol; der Verlauf (Atmosphäre) nicht.
  float c = cos(-uAngle);
  float s = sin(-uAngle);
  vec2 q = uPole + mat2(c, s, -s, c) * (p - uPole);

  vec3 color = skyGradient(p.y);

  // Milchstraße: ein breites Band von links unten zur oberen Mitte, dazu
  // ihr zweites Stück am rechten Rand, das nach oben ausläuft.
  vec2 band = milkyWay(q, vec2(0.1, 0.98), normalize(vec2(0.86, -0.88)), 0.12, 1.7);
  vec2 side = milkyWay(q, vec2(1.53, 1.02), normalize(vec2(0.49, -0.87)), 0.075, 5.3)
    * smoothstep(0.42, 0.75, q.y);
  // Weich gesättigt, damit helle Stellen blau bleiben statt ins Türkis
  // zu laufen.
  float light = 1.0 - exp(-(band.x + side.x) * 1.9);
  float near = max(band.y, side.y);
  color += rgb(15.0, 52.0, 100.0) * (light * 0.9 + near * 0.18);
  color += rgb(19.0, 81.0, 178.0) * smoothstep(0.4, 0.88, light) * 0.85;
  color += rgb(40.0, 95.0, 230.0) * smoothstep(0.7, 0.97, light) * 0.35;

  // Sterne: blaue Körner im Band, wenige feine überall, mittlere weiße,
  // dann die hellen mit blauem Schein.
  vec3 starColor = rgb(193.0, 218.0, 252.0);
  float specks = stars(q, 1.0 / 150.0, 0.35 * near * near, 0.7, 1.6, 3.0);
  float fine = stars(q, 1.0 / 220.0, 0.02 + 0.1 * near, 0.5, 3.0, 1.0);
  float mid = stars(q, 1.0 / 48.0, 0.28, 0.75, 1.5, 7.0);
  float twinkle = 0.75 + 0.25 * sin(uTime * 2.0 + hash12(floor(q * 48.0) + 7.0) * 40.0);
  color += rgb(60.0, 125.0, 255.0) * specks * 1.4;
  color += starColor * (fine * 0.7 + mid * 1.5 * twinkle);

  vec2 g = q * 6.0;
  vec2 base = floor(g);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 id = base + vec2(float(x), float(y));
      if (hash12(id + 31.0) > 0.22) continue;
      vec2 pos = 0.15 + 0.7 * hash22(id + 47.0);
      vec2 d = (g - id - pos) / 6.0 * uBox.z;
      float r2 = dot(d, d);
      float k = hash12(id + 53.0);
      float shine = (0.45 + 0.55 * hash12(id + 59.0))
        * (0.72 + 0.28 * sin(uTime * (0.8 + 1.6 * k) + k * 60.0));
      float spot = exp(-r2 / (2.0 * 1.4 * 1.4));
      float halo = exp(-r2 / (2.0 * 5.5 * 5.5));
      float glow = exp(-r2 / (2.0 * 14.0 * 14.0));
      float rays = exp(-abs(d.x) / 5.0) * exp(-d.y * d.y / 0.5)
                 + exp(-abs(d.y) / 5.0) * exp(-d.x * d.x / 0.5);
      vec3 blue = rgb(60.0, 120.0, 255.0);
      color += shine * (starColor * spot * 1.6 + blue * (halo * 0.55 + glow * 0.12) + starColor * rays * 0.35);
    }
  }

  color += (hash12(gl_FragCoord.xy + fract(uTime) * 91.0) - 0.5) / 255.0;
  outColor = vec4(color, 1.0);
}`

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null
}

export function NightSky({ className }: { className?: string }) {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    // Jedes Mal ein frisches Canvas (Fast Refresh: ein Canvas mit altem
    // Kontext gibt kein neues WebGL her).
    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false })
    if (!gl) return
    const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
    const program = gl.createProgram()
    if (!vs || !fs || !program) return
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return
    root.append(canvas)

    gl.useProgram(program)
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const aPos = gl.getAttribLocation(program, 'aPos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)
    const uniform = (name: string) => gl.getUniformLocation(program, name)
    const uRes = uniform('uRes')
    const uDpr = uniform('uDpr')
    const uTime = uniform('uTime')
    const uAngle = uniform('uAngle')
    const uPole = uniform('uPole')
    const uBox = uniform('uBox')

    const still = window.matchMedia('(prefers-reduced-motion: reduce)')
    let width = 0
    let height = 0
    let dpr = 1
    let raf = 0
    let last = -Infinity
    let inView = false

    const render = (seconds: number) => {
      const box = coverBox(width, height)
      gl.uniform2f(uRes, width, height)
      gl.uniform1f(uDpr, dpr)
      gl.uniform1f(uTime, seconds)
      gl.uniform1f(uAngle, skyAngle(seconds))
      gl.uniform2f(uPole, SKY_POLE_X, SKY_POLE_Y)
      gl.uniform3f(uBox, box.x, box.y, box.h)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    const resize = () => {
      width = root.clientWidth
      height = root.clientHeight
      // Der Himmel ist weich, nur die Sterne brauchen Schärfe: 1,5-fach
      // reicht und spart auf Retina fast die Hälfte der Pixel.
      dpr = Math.min(1.5, window.devicePixelRatio || 1)
      canvas.width = Math.max(1, Math.round(width * dpr))
      canvas.height = Math.max(1, Math.round(height * dpr))
      gl.viewport(0, 0, canvas.width, canvas.height)
      render(still.matches ? 0 : performance.now() / 1000)
    }

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      // 30 Bilder/s genügen für die langsame Drehung und das Funkeln.
      if (now - last < 30) return
      last = now
      render(now / 1000)
    }

    const update = () => {
      cancelAnimationFrame(raf)
      if (inView && !still.matches) raf = requestAnimationFrame(frame)
      else if (width) render(0)
    }

    const sizeObserver = new ResizeObserver(resize)
    sizeObserver.observe(root)
    const visibility = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting
      update()
    })
    visibility.observe(root)
    still.addEventListener('change', update)

    return () => {
      cancelAnimationFrame(raf)
      sizeObserver.disconnect()
      visibility.disconnect()
      still.removeEventListener('change', update)
      canvas.remove()
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }, [])

  return (
    <div
      ref={rootRef}
      aria-hidden
      className={className}
      style={{ background: '#01020b' }}
    />
  )
}

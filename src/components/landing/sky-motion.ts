/**
 * Bewegung des Nachthimmels im Hero. Der Himmel (`NightSky`) und der
 * Filmstreifen (`SkyFilmStrip`) lesen sie beide aus derselben Uhr
 * (`performance.now()`), damit das obere Ende des Bands mit dem Himmel treibt.
 *
 * Koordinaten sind die des 16:9-Rahmens, der den Hero ganz bedeckt (wie
 * `object-cover`): Einheit ist seine Höhe, y zeigt nach unten.
 */

/** Drehpunkt weit rechts außerhalb des Bilds: Links bewegt sich der Himmel
 *  vor allem auf und ab, wie im früheren Video. */
export const SKY_POLE_X = 3.2
export const SKY_POLE_Y = 0.55

/**
 * Drehwinkel in Bogenmaß. Zwei langsame Schwingungen mit krummen Perioden:
 * Der Himmel pendelt, kommt aber nie an derselben Stelle zum Stehen — eine
 * einzelne Schwingung wirkte wie ein Hin und Her.
 */
export function skyAngle(seconds: number) {
  const degrees =
    0.9 * Math.sin((2 * Math.PI * seconds) / 31) +
    0.5 * Math.sin((2 * Math.PI * seconds) / 47 + 1.3)
  return (degrees * Math.PI) / 180
}

/** Der 16:9-Rahmen, der eine Fläche `width` × `height` ganz bedeckt. */
export function coverBox(width: number, height: number) {
  const h = Math.max(height, (width * 9) / 16)
  const w = (h * 16) / 9
  return { x: (width - w) / 2, y: (height - h) / 2, w, h }
}

/**
 * Das Logo als statischer Import statt `src="/Logo.png"`: Next.js hängt einen
 * Hash des Inhalts an die Adresse. Wer `public/Logo.png` ersetzt, bekommt so
 * eine neue Adresse — mit dem festen Pfad blieb sie gleich, und der Browser
 * zeigte das alte Bild aus dem Cache weiter.
 *
 * Abgeleitete Kopien aktualisieren sich nicht von selbst: `src/app/icon.png`,
 * `apple-icon.png`, `favicon.ico` und das Wasserzeichen in
 * `remotion/overlays/watermark-logo.ts` müssen neu erzeugt werden.
 */
export { default as LOGO } from '../../public/Logo.png'

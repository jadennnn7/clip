/**
 * Der Base-UI-Slider meldet `number | readonly number[]` — je nachdem, ob er
 * einen oder mehrere Griffe hat. Alle Slider hier sind einwertig, also
 * normalisiert dieser Helfer auf eine Zahl, statt die Union an jeder
 * Aufrufstelle erneut aufzulösen.
 */
export function singleValue(value: number | readonly number[]): number {
  return Array.isArray(value) ? value[0] : (value as number)
}

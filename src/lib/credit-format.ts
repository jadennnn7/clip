const creditFormatter = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 })

export function formatCredits(credits: number): string {
  return creditFormatter.format(credits)
}

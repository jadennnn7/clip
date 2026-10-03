/**
 * Die ID eines Clips aus der Pipeline: für dasselbe Konto, denselben Job und
 * dasselbe Segment immer dieselbe.
 *
 * Zwei Stellen legen diese Clips an — der Browser, wenn er das Ergebnis in den
 * Workspace übernimmt, und der Worker, wenn er sie für die Kanäle einplant.
 * Mit derselben ID gehören Queue-Eintrag und Workspace-Clip zusammen, und ein
 * zweites Gerät, das dasselbe Ergebnis übernimmt, überschreibt die Clips,
 * statt sie zu verdoppeln.
 */
export async function pipelineClipId(userId: string, sourceJobId: string, index: number): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${userId}:${sourceJobId}:${index}`))
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

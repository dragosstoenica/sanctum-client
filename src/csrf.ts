/**
 * Read a cookie value from `document.cookie`. Returns `null` on SSR / missing.
 */
export function readCookie(name: string): string | null {
  if (typeof document === 'undefined' || !document.cookie) return null
  const target = encodeURIComponent(name)
  for (const segment of document.cookie.split(';')) {
    const eq = segment.indexOf('=')
    if (eq < 0) continue
    const key = segment.slice(0, eq).trim()
    if (key !== target && key !== name) continue
    return decodeURIComponent(segment.slice(eq + 1).trim())
  }
  return null
}

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export function isStateChanging(method: string | undefined): boolean {
  return STATE_CHANGING.has((method ?? 'GET').toUpperCase())
}

export function joinURL(base: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  const trimmedBase = base.replace(/\/+$/, '')
  const trimmedPath = path.replace(/^\/+/, '')
  return `${trimmedBase}/${trimmedPath}`
}

export function appendQuery(
  url: string,
  query: Record<string, string | number | boolean | null | undefined> | undefined,
): string {
  if (!query) return url
  const params = new URLSearchParams()
  let count = 0
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue
    params.append(key, value === null ? '' : String(value))
    count++
  }
  if (count === 0) return url
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}${params.toString()}`
}

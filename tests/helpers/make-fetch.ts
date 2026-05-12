export type FetchHandler = (
  request: Request,
) =>
  | { status?: number; body?: unknown; headers?: Record<string, string> }
  | Promise<{ status?: number; body?: unknown; headers?: Record<string, string> }>

export function makeFetch(handler: FetchHandler): typeof fetch {
  return (async (input: Request | string, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init)
    const result = await handler(request)
    const headers = new Headers(result.headers ?? { 'content-type': 'application/json' })
    return new Response(
      result.body === undefined
        ? null
        : typeof result.body === 'string'
          ? result.body
          : JSON.stringify(result.body),
      { status: result.status ?? 200, headers },
    )
  }) as typeof fetch
}

/** Router for path-prefix-based mock responses. */
export function makeRouter(
  routes: Record<string, FetchHandler | { status?: number; body?: unknown }>,
  fallback?: FetchHandler,
): typeof fetch {
  return makeFetch(async (request) => {
    const url = new URL(request.url)
    for (const [pattern, handler] of Object.entries(routes)) {
      if (url.pathname === pattern || url.pathname.endsWith(pattern)) {
        if (typeof handler === 'function') return handler(request)
        return handler
      }
    }
    if (fallback) return fallback(request)
    return { status: 404, body: { message: 'no route', path: url.pathname } }
  })
}

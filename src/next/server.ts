import 'server-only'

import { cookies, headers as nextHeaders } from 'next/headers'

import { createSanctumClient } from '../client'
import type { SanctumClient, SanctumConfigInput } from '../types'

export interface NextServerClientOptions<TUser = unknown> extends SanctumConfigInput<TUser> {
  /**
   * Cookies forwarded from the incoming request to Laravel. Defaults to all
   * cookies on the current request.
   */
  forwardCookies?: string[]
  /** Forward selected request headers to Laravel (User-Agent, Accept-Language, etc). */
  forwardHeaders?: string[]
}

/**
 * Create a per-request Sanctum client for use in Server Components, Server
 * Actions, or Route Handlers. Each call MUST return a fresh client — never
 * cache this across requests, or you will cross-contaminate users.
 */
export async function getSanctumClient<TUser = unknown>(
  options: NextServerClientOptions<TUser>,
): Promise<SanctumClient<TUser>> {
  const cookieStore = await cookies()
  const headerStore = await nextHeaders()

  const cookieHeader = (options.forwardCookies ?? cookieStore.getAll().map((c) => c.name))
    .map((name) => {
      const value = cookieStore.get(name)?.value
      return value === undefined ? null : `${name}=${encodeURIComponent(value)}`
    })
    .filter((s): s is string => s !== null)
    .join('; ')

  const forwardHeaders = options.forwardHeaders ?? ['user-agent', 'accept-language', 'referer']
  const extraHeaders: Record<string, string> = {}
  for (const name of forwardHeaders) {
    const value = headerStore.get(name)
    if (value) extraHeaders[name] = value
  }

  const baseFetch = options.fetch ?? globalThis.fetch.bind(globalThis)
  const serverFetch: typeof fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init)
    const merged = new Headers(request.headers)
    if (cookieHeader) merged.set('cookie', cookieHeader)
    for (const [k, v] of Object.entries(extraHeaders)) {
      if (!merged.has(k)) merged.set(k, v)
    }
    return baseFetch(new Request(request, { headers: merged }))
  }

  return createSanctumClient<TUser>({
    ...options,
    fetch: serverFetch,
    crossTabSync: false,
    autoFetchUser: false,
  })
}

/**
 * Fetch the current user during SSR / RSC. Returns null on 401/419. Throws on
 * other errors so they bubble to the error boundary.
 */
export async function getSanctumUser<TUser = unknown>(
  options: NextServerClientOptions<TUser>,
): Promise<TUser | null> {
  const client = await getSanctumClient<TUser>(options)
  return client.fetchUser()
}

/**
 * Read the CSRF token from cookies during SSR. Use this to render a hidden
 * field or inject into a meta tag for non-JS form posts.
 */
export async function getSanctumCsrfToken(cookieName = 'XSRF-TOKEN'): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(cookieName)?.value ?? null
}

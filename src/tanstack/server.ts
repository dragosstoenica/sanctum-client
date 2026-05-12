import 'server-only'

import { createSanctumClient } from '../client'
import type { SanctumClient, SanctumConfigInput } from '../types'

export interface TanStackServerOptions<TUser = unknown> extends SanctumConfigInput<TUser> {
  /** Cookie header from the incoming request, forwarded to Laravel. */
  cookie?: string
  /** Additional headers to forward (User-Agent, etc). */
  headers?: Record<string, string>
}

/**
 * Build a per-request Sanctum client inside a TanStack Start server function.
 * Reads cookies from the provided request and bridges them to Laravel.
 *
 * @example
 *   import { createServerFn } from '@tanstack/react-start'
 *   import { getRequest } from '@tanstack/react-start/server'
 *   import { getSanctumClient } from 'sanctum-client/tanstack/server'
 *
 *   export const $getMe = createServerFn().handler(async () => {
 *     const request = getRequest()
 *     const client = await getSanctumClient({
 *       baseURL: process.env.LARAVEL_URL!,
 *       cookie: request.headers.get('cookie') ?? undefined,
 *     })
 *     return client.fetchUser()
 *   })
 */
export async function getSanctumClient<TUser = unknown>(
  options: TanStackServerOptions<TUser>,
): Promise<SanctumClient<TUser>> {
  const cookieHeader = options.cookie ?? ''
  const extraHeaders = options.headers ?? {}
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

/** Convenience wrapper that returns the user (or null on 401/419). */
export async function getSanctumUser<TUser = unknown>(
  options: TanStackServerOptions<TUser>,
): Promise<TUser | null> {
  const client = await getSanctumClient<TUser>(options)
  return client.fetchUser()
}

/**
 * Build a `cookie` header value from an incoming Request's cookies, optionally
 * filtered to a specific allowlist. Use this when you have a `Request` object
 * inside a server function.
 */
export function bridgeSanctumCookies(
  request: Request,
  allowlist?: string[],
): string {
  const cookie = request.headers.get('cookie')
  if (!cookie) return ''
  if (!allowlist || allowlist.length === 0) return cookie
  const wanted = new Set(allowlist)
  return cookie
    .split(';')
    .map((c) => c.trim())
    .filter((c) => {
      const eq = c.indexOf('=')
      const name = eq >= 0 ? c.slice(0, eq) : c
      return wanted.has(name)
    })
    .join('; ')
}

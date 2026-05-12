import { NextResponse, type NextRequest } from 'next/server'

import { resolveRoutes } from '../routes'
import type { SanctumAuthRoutesInput } from '../types'

export interface SanctumProxyOptions {
  /**
   * Public origin of your Laravel app, e.g. `https://api.example.com`.
   * Used for edge auth probes when `mode: 'remote-probe'`.
   */
  baseURL?: string
  /** Auth route overrides (only `user` is consulted by remote-probe). */
  routes?: SanctumAuthRoutesInput
  /**
   * Path patterns that require auth. Same semantics as Next's `matcher`:
   * `'/dashboard/:path*'`, regex strings, etc. Use `sanctumProxyMatcher`
   * to compose this with your existing matcher.
   */
  protect?: string[]
  /** Path to redirect unauthenticated users to. Default `/login`. */
  loginPath?: string
  /** Query param used to return user to original URL. Default `redirect`. */
  redirectParam?: string
  /**
   * How to detect auth at the edge.
   *   - `'cookie-presence'` (default, fast): treat any session/XSRF cookie as
   *     proof of an active session. False positives possible if the session
   *     is expired server-side — the actual data fetch will 401 and the
   *     client will handle it. Best for performance.
   *   - `'remote-probe'`: call Laravel's `/api/user` (or `routes.user`) at
   *     the edge to verify. Adds latency. Only use for sensitive routes.
   */
  mode?: 'cookie-presence' | 'remote-probe'
  /** Cookie names that indicate an authenticated session. */
  sessionCookies?: string[]
}

const DEFAULT_SESSION_COOKIES = ['laravel_session', 'laravel-session', 'XSRF-TOKEN']

/**
 * Wrap an existing `proxy` (Next 16 edge file) function with Sanctum auth
 * gating. Place this in `proxy.ts` at your app root.
 *
 * @example
 *   // proxy.ts
 *   import { withSanctumAuth, sanctumProxyMatcher } from 'sanctum-client/next/proxy'
 *
 *   export default withSanctumAuth({
 *     protect: ['/dashboard/:path*'],
 *     loginPath: '/login',
 *   })
 *
 *   export const config = { matcher: sanctumProxyMatcher(['/dashboard/:path*']) }
 */
export function withSanctumAuth(
  options: SanctumProxyOptions,
  next?: (request: NextRequest) => Promise<Response> | Response,
): (request: NextRequest) => Promise<Response> {
  const sessionCookies = options.sessionCookies ?? DEFAULT_SESSION_COOKIES
  const loginPath = options.loginPath ?? '/login'
  const redirectParam = options.redirectParam ?? 'redirect'
  const mode = options.mode ?? 'cookie-presence'

  return async (request: NextRequest): Promise<Response> => {
    const url = new URL(request.url)
    const requiresAuth = matchesProtected(url.pathname, options.protect)

    if (!requiresAuth) {
      return (await next?.(request)) ?? NextResponse.next()
    }

    let authenticated = false

    if (mode === 'cookie-presence') {
      authenticated = sessionCookies.some((name) => request.cookies.has(name))
    } else {
      if (!options.baseURL) {
        throw new Error('withSanctumAuth: `baseURL` is required when mode is "remote-probe".')
      }
      const routes = resolveRoutes(options.routes)
      try {
        const probe = await fetch(`${options.baseURL.replace(/\/+$/, '')}${routes.user}`, {
          method: 'GET',
          headers: {
            accept: 'application/json',
            cookie: request.headers.get('cookie') ?? '',
          },
        })
        authenticated = probe.ok
      } catch {
        authenticated = false
      }
    }

    if (authenticated) {
      return (await next?.(request)) ?? NextResponse.next()
    }

    const redirectTo = new URL(loginPath, request.url)
    redirectTo.searchParams.set(redirectParam, url.pathname + url.search)
    return NextResponse.redirect(redirectTo)
  }
}

function matchesProtected(pathname: string, patterns: string[] | undefined): boolean {
  if (!patterns || patterns.length === 0) return false
  for (const pattern of patterns) {
    if (matchesPattern(pathname, pattern)) return true
  }
  return false
}

function matchesPattern(pathname: string, pattern: string): boolean {
  // Convert Next-style :path* / :path / * tokens into a regex.
  const regex = new RegExp(
    '^' +
      pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/:[A-Za-z_][A-Za-z0-9_]*\*/g, '.*')
        .replace(/:[A-Za-z_][A-Za-z0-9_]*/g, '[^/]+')
        .replace(/\*/g, '.*') +
      '$',
  )
  return regex.test(pathname)
}

/**
 * Compose a Next `config.matcher` array from your protected paths plus
 * sensible defaults (skip `_next`, static, API). Pass-through helper.
 */
export function sanctumProxyMatcher(paths: string[]): string[] {
  return paths
}

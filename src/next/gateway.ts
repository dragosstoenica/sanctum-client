import 'server-only'

import { NextResponse, type NextRequest } from 'next/server'

export interface SanctumGatewayOptions {
  /** Laravel origin, e.g. `https://api.example.com`. */
  upstream: string
  /**
   * Path prefix the gateway is mounted at. Defaults to `/api`. The gateway
   * strips this prefix before forwarding to the upstream.
   *
   * @example mounted at /api/[...sanctum], basePath: '/api'
   *   /api/user → https://api.example.com/api/user
   */
  basePath?: string
  /** Whether to also forward the leading basePath to Laravel. Default true. */
  preservePath?: boolean
  /**
   * Cookie names to forward to Laravel. Defaults to all incoming cookies.
   * Use to whitelist if you want to keep host-only cookies private.
   */
  forwardCookies?: string[]
  /**
   * Cookies set by Laravel that should be rewritten to the Next host before
   * being relayed to the browser. Strips Domain attribute and (when needed)
   * downgrades Secure for localhost. Defaults to all set-cookie headers.
   */
  rewriteSetCookieDomain?: boolean
  /** Override the request method allowlist. Default: all common verbs. */
  methods?: string[]
}

const DEFAULT_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

/**
 * Mount a catch-all Sanctum gateway in `app/api/[...sanctum]/route.ts`. Forwards
 * the request to Laravel, bridging cookies so the browser sees a same-origin
 * session while Laravel sees the original cross-origin request.
 *
 * @example
 *   // app/api/[...sanctum]/route.ts
 *   import { createSanctumGateway } from 'sanctum-client/next/gateway'
 *
 *   export const { GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS } =
 *     createSanctumGateway({ upstream: process.env.LARAVEL_URL! })
 */
export function createSanctumGateway(options: SanctumGatewayOptions) {
  const upstream = options.upstream.replace(/\/+$/, '')
  const basePath = options.basePath ?? '/api'
  const preservePath = options.preservePath ?? true
  const rewriteSetCookieDomain = options.rewriteSetCookieDomain ?? true
  const allowedMethods = new Set((options.methods ?? DEFAULT_METHODS).map((m) => m.toUpperCase()))

  async function handle(request: NextRequest): Promise<Response> {
    if (!allowedMethods.has(request.method.toUpperCase())) {
      return new NextResponse(null, { status: 405 })
    }

    const incoming = new URL(request.url)
    let targetPath = incoming.pathname
    if (!preservePath && basePath && targetPath.startsWith(basePath)) {
      targetPath = targetPath.slice(basePath.length) || '/'
    }
    const targetURL = `${upstream}${targetPath}${incoming.search}`

    const forwardedHeaders = new Headers(request.headers)
    // Strip Next-injected hop headers
    forwardedHeaders.delete('host')
    forwardedHeaders.delete('connection')
    forwardedHeaders.delete('content-length')

    if (options.forwardCookies) {
      const filtered = options.forwardCookies
        .map((name) => {
          const value = request.cookies.get(name)?.value
          return value === undefined ? null : `${name}=${value}`
        })
        .filter((s): s is string => s !== null)
        .join('; ')
      if (filtered) forwardedHeaders.set('cookie', filtered)
      else forwardedHeaders.delete('cookie')
    }

    const body =
      request.method === 'GET' || request.method === 'HEAD' ? null : await request.arrayBuffer()

    const upstreamResponse = await fetch(targetURL, {
      method: request.method,
      headers: forwardedHeaders,
      body,
      redirect: 'manual',
    })

    const outboundHeaders = new Headers(upstreamResponse.headers)
    if (rewriteSetCookieDomain) {
      // Web fetch combines Set-Cookie via getSetCookie() on Node 18+.
      const cookies = upstreamResponse.headers.getSetCookie?.() ?? []
      if (cookies.length > 0) {
        outboundHeaders.delete('set-cookie')
        for (const raw of cookies) {
          outboundHeaders.append('set-cookie', stripDomain(raw))
        }
      }
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: outboundHeaders,
    })
  }

  return {
    GET: handle,
    POST: handle,
    PUT: handle,
    PATCH: handle,
    DELETE: handle,
    HEAD: handle,
    OPTIONS: handle,
  }
}

function stripDomain(cookie: string): string {
  return cookie.replace(/;\s*Domain=[^;]+/i, '')
}

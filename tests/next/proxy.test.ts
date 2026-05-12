// @vitest-environment node
import { NextRequest } from 'next/server'
import { describe, expect, it, vi } from 'vitest'

import { sanctumProxyMatcher, withSanctumAuth } from '../../src/next/proxy'

function makeRequest(url: string, cookies: Record<string, string> = {}): NextRequest {
  const headers = new Headers()
  const cookieHeader = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
  if (cookieHeader) headers.set('cookie', cookieHeader)
  return new NextRequest(new Request(url, { headers }))
}

describe('withSanctumAuth (proxy)', () => {
  it('passes through when no protect patterns match', async () => {
    const handler = withSanctumAuth({ protect: ['/dashboard/:path*'] })
    const result = await handler(makeRequest('https://app.example.com/marketing'))
    expect(result.status).toBe(200)
  })

  it('redirects when protected route has no session cookie', async () => {
    const handler = withSanctumAuth({
      protect: ['/dashboard/:path*'],
      loginPath: '/login',
    })
    const result = await handler(makeRequest('https://app.example.com/dashboard/home'))
    expect(result.status).toBeGreaterThanOrEqual(300)
    expect(result.status).toBeLessThan(400)
    const location = result.headers.get('location')
    expect(location).toContain('/login')
    expect(location).toContain('redirect=%2Fdashboard%2Fhome')
  })

  it('passes through when laravel_session cookie present (cookie-presence mode)', async () => {
    const handler = withSanctumAuth({ protect: ['/dashboard/:path*'] })
    const result = await handler(
      makeRequest('https://app.example.com/dashboard', { laravel_session: 'sess-1' }),
    )
    expect(result.status).toBe(200)
  })

  it('exact route match works without wildcard', async () => {
    const handler = withSanctumAuth({ protect: ['/account'] })
    const protectedReq = await handler(makeRequest('https://app.example.com/account'))
    expect(protectedReq.headers.get('location')).toContain('/login')
    const publicReq = await handler(makeRequest('https://app.example.com/account-recovery'))
    expect(publicReq.status).toBe(200)
  })

  it('remote-probe mode calls upstream user endpoint', async () => {
    const probe = vi.fn<typeof fetch>(async () => new Response('{}', { status: 200 }))
    const originalFetch = globalThis.fetch
    globalThis.fetch = probe
    try {
      const handler = withSanctumAuth({
        protect: ['/admin'],
        mode: 'remote-probe',
        baseURL: 'https://api.example.com',
      })
      const result = await handler(
        makeRequest('https://app.example.com/admin', { laravel_session: 'irrelevant' }),
      )
      expect(probe).toHaveBeenCalled()
      const probedUrl = String(probe.mock.calls[0]?.[0] ?? '')
      expect(probedUrl).toContain('https://api.example.com/api/user')
      expect(result.status).toBe(200)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('remote-probe redirects when upstream returns 401', async () => {
    const probe = vi.fn<typeof fetch>(async () => new Response('{}', { status: 401 }))
    const originalFetch = globalThis.fetch
    globalThis.fetch = probe
    try {
      const handler = withSanctumAuth({
        protect: ['/admin'],
        mode: 'remote-probe',
        baseURL: 'https://api.example.com',
      })
      const result = await handler(makeRequest('https://app.example.com/admin'))
      expect(result.headers.get('location')).toContain('/login')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('forwards to provided next() handler on pass-through', async () => {
    const next = vi.fn(async () => new Response('next ran', { status: 200 }))
    const handler = withSanctumAuth({ protect: ['/x'] }, next)
    await handler(makeRequest('https://app.example.com/public'))
    expect(next).toHaveBeenCalledOnce()
  })

  it('sanctumProxyMatcher passes through paths', () => {
    expect(sanctumProxyMatcher(['/foo/:path*'])).toEqual(['/foo/:path*'])
  })
})

// @vitest-environment node
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createSanctumGateway } from '../../src/next/gateway'

let originalFetch: typeof fetch
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  originalFetch = globalThis.fetch
  fetchMock = vi.fn()
  globalThis.fetch = fetchMock as unknown as typeof fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

function makeNextRequest(url: string, init: RequestInit = {}): NextRequest {
  return new NextRequest(new Request(url, init))
}

describe('createSanctumGateway', () => {
  it('forwards GET to upstream preserving path and query', async () => {
    fetchMock.mockResolvedValue(new Response('{"ok":true}', { status: 200 }))
    const gw = createSanctumGateway({ upstream: 'https://api.example.com' })

    const req = makeNextRequest('https://app.example.com/api/user?include=roles')
    const res = await gw.GET(req)
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledOnce()
    const [calledUrl, calledInit] = fetchMock.mock.calls[0] ?? []
    expect(calledUrl).toBe('https://api.example.com/api/user?include=roles')
    expect((calledInit as RequestInit).method).toBe('GET')
  })

  it('forwards POST body', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))
    const gw = createSanctumGateway({ upstream: 'https://api.example.com' })

    const req = makeNextRequest('https://app.example.com/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.c', password: 'x' }),
    })
    await gw.POST(req)
    const [, init] = fetchMock.mock.calls[0] ?? []
    expect((init as RequestInit).method).toBe('POST')
    expect((init as RequestInit).body).toBeDefined()
  })

  it('strips Domain attribute from Set-Cookie responses', async () => {
    const upstreamHeaders = new Headers()
    upstreamHeaders.append(
      'set-cookie',
      'laravel_session=abc; Path=/; Domain=api.example.com; HttpOnly',
    )
    upstreamHeaders.append('set-cookie', 'XSRF-TOKEN=xyz; Path=/; Domain=api.example.com')
    fetchMock.mockResolvedValue(new Response(null, { status: 204, headers: upstreamHeaders }))

    const gw = createSanctumGateway({ upstream: 'https://api.example.com' })
    const res = await gw.GET(makeNextRequest('https://app.example.com/api/csrf'))
    const cookies = res.headers.getSetCookie?.() ?? []
    expect(cookies.length).toBeGreaterThanOrEqual(1)
    for (const c of cookies) {
      expect(c.toLowerCase()).not.toContain('domain=')
    }
  })

  it('forwards cookies from incoming request', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))
    const gw = createSanctumGateway({ upstream: 'https://api.example.com' })

    const headers = new Headers({ cookie: 'laravel_session=sess-1; XSRF-TOKEN=tok-1' })
    const req = new NextRequest(new Request('https://app.example.com/api/user', { headers }))
    await gw.GET(req)
    const [, init] = fetchMock.mock.calls[0] ?? []
    const forwarded = (init as RequestInit).headers as Headers
    expect(forwarded.get('cookie')).toContain('laravel_session=sess-1')
  })

  it('respects forwardCookies allowlist', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))
    const gw = createSanctumGateway({
      upstream: 'https://api.example.com',
      forwardCookies: ['laravel_session'],
    })

    const headers = new Headers({ cookie: 'laravel_session=keep; secret_thing=drop' })
    const req = new NextRequest(new Request('https://app.example.com/api/user', { headers }))
    await gw.GET(req)
    const [, init] = fetchMock.mock.calls[0] ?? []
    const forwarded = (init as RequestInit).headers as Headers
    expect(forwarded.get('cookie')).toBe('laravel_session=keep')
  })

  it('strips hop-by-hop headers (host)', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))
    const gw = createSanctumGateway({ upstream: 'https://api.example.com' })
    const req = makeNextRequest('https://app.example.com/api/x')
    await gw.GET(req)
    const [, init] = fetchMock.mock.calls[0] ?? []
    const forwarded = (init as RequestInit).headers as Headers
    expect(forwarded.get('host')).toBeNull()
  })

  it('rejects disallowed methods with 405', async () => {
    const gw = createSanctumGateway({ upstream: 'https://api.example.com', methods: ['GET'] })
    const req = makeNextRequest('https://app.example.com/api/x', { method: 'POST' })
    const res = await gw.POST(req)
    expect(res.status).toBe(405)
  })
})

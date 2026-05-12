// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const cookieStore = new Map<string, string>()
const headerStore = new Map<string, string>()

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      cookieStore.has(name) ? { name, value: cookieStore.get(name)! } : undefined,
    getAll: () => [...cookieStore.entries()].map(([name, value]) => ({ name, value })),
  })),
  headers: vi.fn(async () => ({
    get: (name: string) => headerStore.get(name.toLowerCase()) ?? null,
  })),
}))

const { getSanctumClient, getSanctumCsrfToken, getSanctumUser } = await import(
  '../../src/next/server'
)

beforeEach(() => {
  cookieStore.clear()
  headerStore.clear()
})

describe('next/server', () => {
  it('forwards cookies from incoming request to Laravel', async () => {
    cookieStore.set('laravel_session', 'sess-1')
    cookieStore.set('XSRF-TOKEN', 'tok-1')
    let capturedCookie: string | null = null
    const client = await getSanctumClient({
      baseURL: 'https://api.example.com',
      fetch: (async (input: Request | string, init?: RequestInit) => {
        const req = input instanceof Request ? input : new Request(input, init)
        capturedCookie = req.headers.get('cookie')
        return new Response('{"id":1}', { status: 200, headers: { 'content-type': 'application/json' } })
      }) as typeof fetch,
    })
    await client.fetchUser()
    expect(capturedCookie).toContain('laravel_session=sess-1')
    expect(capturedCookie).toContain('XSRF-TOKEN=tok-1')
  })

  it('forwards selected request headers (user-agent, accept-language)', async () => {
    headerStore.set('user-agent', 'TestAgent/1.0')
    headerStore.set('accept-language', 'en-US')
    let capturedUA: string | null = null
    const client = await getSanctumClient({
      baseURL: 'https://api.example.com',
      fetch: (async (input: Request | string, init?: RequestInit) => {
        const req = input instanceof Request ? input : new Request(input, init)
        capturedUA = req.headers.get('user-agent')
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
      }) as typeof fetch,
    })
    await client.fetch('/api/user')
    expect(capturedUA).toBe('TestAgent/1.0')
  })

  it('crossTabSync and autoFetchUser are forced off on server', async () => {
    const client = await getSanctumClient({ baseURL: 'https://api.example.com' })
    expect(client.config.crossTabSync).toBe(false)
    expect(client.config.autoFetchUser).toBe(false)
  })

  it('getSanctumUser returns null on 401', async () => {
    const user = await getSanctumUser({
      baseURL: 'https://api.example.com',
      fetch: (async () =>
        new Response('{"message":"Unauthenticated"}', {
          status: 401,
          headers: { 'content-type': 'application/json' },
        })) as typeof fetch,
    })
    expect(user).toBeNull()
  })

  it('getSanctumCsrfToken reads from cookie store', async () => {
    cookieStore.set('XSRF-TOKEN', 'csrf-abc')
    expect(await getSanctumCsrfToken()).toBe('csrf-abc')
  })

  it('getSanctumCsrfToken returns null when missing', async () => {
    expect(await getSanctumCsrfToken()).toBeNull()
  })

  it('forwardCookies allowlist limits which cookies are sent', async () => {
    cookieStore.set('laravel_session', 'keep')
    cookieStore.set('secret', 'drop')
    let captured: string | null = null
    const client = await getSanctumClient({
      baseURL: 'https://api.example.com',
      forwardCookies: ['laravel_session'],
      fetch: (async (input: Request | string, init?: RequestInit) => {
        const req = input instanceof Request ? input : new Request(input, init)
        captured = req.headers.get('cookie')
        return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
      }) as typeof fetch,
    })
    await client.fetch('/api/user')
    expect(captured).toContain('laravel_session=keep')
    expect(captured).not.toContain('secret=drop')
  })
})

// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const cookieStore = new Map<string, string>()

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      cookieStore.has(name) ? { name, value: cookieStore.get(name)! } : undefined,
    getAll: () => [...cookieStore.entries()].map(([name, value]) => ({ name, value })),
  })),
  headers: vi.fn(async () => ({
    get: () => null,
  })),
}))

const { getCsrfCookie, sanctumLogin, sanctumLogout, withSanctum } = await import(
  '../../src/next/actions'
)

beforeEach(() => {
  cookieStore.clear()
})

const USER = { id: 1, email: 'a@b.c' }

function jsonFetch(map: Record<string, { status?: number; body?: unknown }>): typeof fetch {
  return (async (input: Request | string, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input, init)
    const path = new URL(req.url).pathname
    const route = map[path]
    if (!route) {
      return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } })
    }
    const status = route.status ?? 200
    const isNullBody = status === 204 || status === 205 || status === 304
    return new Response(isNullBody ? null : JSON.stringify(route.body ?? {}), {
      status,
      headers: isNullBody ? {} : { 'content-type': 'application/json' },
    })
  }) as typeof fetch
}

describe('next/actions', () => {
  it('sanctumLogin returns { ok: true, user } on success', async () => {
    cookieStore.set('XSRF-TOKEN', 'csrf-1')
    const result = await sanctumLogin(
      {
        baseURL: 'https://api.example.com',
        fetch: jsonFetch({
          '/sanctum/csrf-cookie': { status: 204 },
          '/login': { body: {} },
          '/api/user': { body: USER },
        }),
      },
      { email: 'a@b.c', password: 'x' },
    )
    expect(result.ok).toBe(true)
    expect(result.user).toEqual(USER)
  })

  it('sanctumLogin surfaces validation errors on 422', async () => {
    cookieStore.set('XSRF-TOKEN', 'csrf-1')
    const result = await sanctumLogin(
      {
        baseURL: 'https://api.example.com',
        fetch: jsonFetch({
          '/sanctum/csrf-cookie': { status: 204 },
          '/login': { status: 422, body: { message: 'bad', errors: { email: ['invalid'] } } },
        }),
      },
      { email: 'x', password: 'y' },
    )
    expect(result.ok).toBe(false)
    expect(result.error?.message).toBe('bad')
    expect(result.error?.errors?.email).toEqual(['invalid'])
  })

  it('sanctumLogout returns ok on success', async () => {
    cookieStore.set('XSRF-TOKEN', 'csrf-1')
    const result = await sanctumLogout({
      baseURL: 'https://api.example.com',
      fetch: jsonFetch({
        '/sanctum/csrf-cookie': { status: 204 },
        '/logout': { status: 204 },
      }),
    })
    expect(result.ok).toBe(true)
  })

  it('withSanctum returns ok:false if unauthenticated', async () => {
    const handler = withSanctum(
      {
        baseURL: 'https://api.example.com',
        fetch: jsonFetch({ '/api/user': { status: 401, body: {} } }),
      },
      async ({ user }) => ({ greeting: `hi ${(user as { email: string }).email}` }),
    )
    const result = await handler()
    expect(result).toEqual({ ok: false, error: 'unauthenticated' })
  })

  it('withSanctum invokes inner fn with user when authed', async () => {
    const handler = withSanctum<typeof USER, [string], { greeting: string }>(
      {
        baseURL: 'https://api.example.com',
        fetch: jsonFetch({ '/api/user': { body: USER } }),
      },
      async ({ user }, name) => ({ greeting: `${name} ${user.email}` }),
    )
    const result = await handler('hi')
    expect(result).toEqual({ ok: true, data: { greeting: 'hi a@b.c' } })
  })

  it('getCsrfCookie reads from cookie store', async () => {
    cookieStore.set('XSRF-TOKEN', 'abc')
    expect(await getCsrfCookie()).toBe('abc')
  })
})

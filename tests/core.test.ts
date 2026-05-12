import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createSanctumClient } from '../src/client'
import { SanctumHttpError } from '../src/errors'
import { memoryStorage } from '../src/storage'
import type { SanctumFetchOptions } from '../src/types'
import { makeFetch } from './helpers/make-fetch'

type TestUser = { id: number; email: string }

describe('createSanctumClient', () => {
  beforeEach(() => {
    document.cookie = ''
  })
  afterEach(() => {
    document.cookie = ''
  })

  it('throws if baseURL missing', () => {
    expect(() => createSanctumClient({ baseURL: '' })).toThrow(/baseURL/)
  })

  it('resolves defaults and exposes config', () => {
    const client = createSanctumClient<TestUser>({
      baseURL: 'https://api.example.com',
      fetch: makeFetch(async () => ({ body: {} })),
    })
    expect(client.config.mode).toBe('cookie')
    expect(client.config.routes.user).toBe('/api/user')
    expect(client.config.routes.login).toBe('/login')
    expect(client.getState()).toEqual({ status: 'unknown', user: null, error: null })
  })

  it('fetches CSRF cookie before POST in cookie mode', async () => {
    const calls: string[] = []
    document.cookie = 'XSRF-TOKEN=abc123'
    const client = createSanctumClient({
      baseURL: 'https://api.example.com',
      fetch: makeFetch(async (request) => {
        calls.push(`${request.method} ${request.url}`)
        if (request.url.endsWith('/sanctum/csrf-cookie')) return { status: 204 }
        if (request.url.endsWith('/login')) {
          expect(request.headers.get('X-XSRF-TOKEN')).toBe('abc123')
          return { body: { ok: true } }
        }
        if (request.url.endsWith('/api/user')) return { body: { id: 1, email: 'a@b.c' } }
        return { status: 404 }
      }),
    })
    await client.login({ email: 'a@b.c', password: 'x' })
    expect(calls[0]).toContain('/sanctum/csrf-cookie')
    expect(calls[1]).toContain('/login')
    expect(client.getState().status).toBe('authenticated')
  })

  it('emits login event with user', async () => {
    document.cookie = 'XSRF-TOKEN=t'
    const client = createSanctumClient<TestUser>({
      baseURL: 'https://api.example.com',
      fetch: makeFetch(async (request) => {
        if (request.url.endsWith('/sanctum/csrf-cookie')) return { status: 204 }
        if (request.url.endsWith('/login')) return { body: {} }
        return { body: { id: 7, email: 'a@b.c' } as TestUser }
      }),
    })
    const onLogin = vi.fn()
    client.on('login', onLogin)
    await client.login({ email: 'a@b.c', password: 'x' })
    expect(onLogin).toHaveBeenCalledWith({ user: { id: 7, email: 'a@b.c' } })
  })

  it('uses Bearer token in token mode', async () => {
    const storage = memoryStorage()
    await storage.setItem('sanctum.token', 'tok123')
    let captured: string | null = null
    const client = createSanctumClient({
      baseURL: 'https://api.example.com',
      mode: 'token',
      storage,
      fetch: makeFetch(async (request) => {
        captured = request.headers.get('Authorization')
        return { body: { id: 1, email: 'a@b.c' } }
      }),
    })
    await client.fetchUser()
    expect(captured).toBe('Bearer tok123')
  })

  it('transitions to unauthenticated on 401 during fetchUser', async () => {
    const client = createSanctumClient({
      baseURL: 'https://api.example.com',
      fetch: makeFetch(async () => ({ status: 401, body: { message: 'no' } })),
    })
    const result = await client.fetchUser()
    expect(result).toBeNull()
    expect(client.getState().status).toBe('unauthenticated')
  })

  it('login failure sets unauthenticated and throws', async () => {
    document.cookie = 'XSRF-TOKEN=t'
    const client = createSanctumClient({
      baseURL: 'https://api.example.com',
      fetch: makeFetch(async (request) => {
        if (request.url.endsWith('/sanctum/csrf-cookie')) return { status: 204 }
        return { status: 422, body: { message: 'bad', errors: { email: ['invalid'] } } }
      }),
    })
    await expect(client.login({ email: 'x', password: 'y' })).rejects.toBeInstanceOf(
      SanctumHttpError,
    )
    expect(client.getState().status).toBe('unauthenticated')
  })

  it('logout clears state and fires event even if endpoint 401s', async () => {
    document.cookie = 'XSRF-TOKEN=t'
    const client = createSanctumClient({
      baseURL: 'https://api.example.com',
      fetch: makeFetch(async (request) => {
        if (request.url.endsWith('/sanctum/csrf-cookie')) return { status: 204 }
        return { status: 401, body: {} }
      }),
    })
    client.setUser({ id: 1, email: 'a@b.c' })
    const onLogout = vi.fn()
    client.on('logout', onLogout)
    await client.logout()
    expect(client.getState().status).toBe('unauthenticated')
    expect(client.getState().user).toBeNull()
    expect(onLogout).toHaveBeenCalled()
  })

  it('appends query params and skips undefined', async () => {
    let capturedUrl = ''
    const client = createSanctumClient({
      baseURL: 'https://api.example.com',
      fetch: makeFetch(async (request) => {
        capturedUrl = request.url
        return { body: {} }
      }),
    })
    const opts: SanctumFetchOptions = { query: { a: 1, b: undefined, c: 'x' } }
    await client.fetch('/api/things', opts)
    expect(capturedUrl).toContain('a=1')
    expect(capturedUrl).toContain('c=x')
    expect(capturedUrl).not.toContain('b=')
  })

  it('state subscribers see updates', async () => {
    const client = createSanctumClient({
      baseURL: 'https://api.example.com',
      fetch: makeFetch(async () => ({ body: { id: 1, email: 'a@b.c' } })),
    })
    const states: string[] = []
    client.subscribe((s) => states.push(s.status))
    await client.fetchUser()
    expect(states).toContain('loading')
    expect(states).toContain('authenticated')
  })
})

import { describe, expect, it } from 'vitest'

import { createSanctumClient } from '../src/client'
import {
  createSanctumRouterContext,
  requireAuthBeforeLoad,
  requireGuestBeforeLoad,
  sanctumLoader,
} from '../src/tanstack'
import { makeRouter } from './helpers/make-fetch'

const USER = { id: 1, email: 'a@b.c' }

function newClient(handler: Parameters<typeof makeRouter>[0]) {
  return createSanctumClient({
    baseURL: 'https://api.example.com',
    autoFetchUser: false,
    fetch: makeRouter(handler),
  })
}

describe('tanstack adapter', () => {
  it('createSanctumRouterContext exposes the client under .sanctum', () => {
    const client = newClient({})
    const ctx = createSanctumRouterContext(client)
    expect(ctx.sanctum).toBe(client)
  })

  it('sanctumLoader resolves user from context', async () => {
    const client = newClient({ '/api/user': { body: USER } })
    const ctx = createSanctumRouterContext(client)
    const result = await sanctumLoader({ context: ctx })
    expect(result.user).toEqual(USER)
  })

  it('sanctumLoader returns null for 401', async () => {
    const client = newClient({ '/api/user': { status: 401, body: {} } })
    const ctx = createSanctumRouterContext(client)
    const result = await sanctumLoader({ context: ctx })
    expect(result.user).toBeNull()
  })

  it('sanctumLoader returns cached user without refetch', async () => {
    const calls: string[] = []
    const client = newClient({
      '/api/user': (req) => {
        calls.push(req.url)
        return { body: USER }
      },
    })
    client.setUser(USER)
    const ctx = createSanctumRouterContext(client)
    const result = await sanctumLoader({ context: ctx })
    expect(result.user).toEqual(USER)
    expect(calls).toHaveLength(0)
  })

  it('sanctumLoader refetches when force=true', async () => {
    const calls: string[] = []
    const client = newClient({
      '/api/user': (req) => {
        calls.push(req.url)
        return { body: USER }
      },
    })
    client.setUser(USER)
    const ctx = createSanctumRouterContext(client)
    await sanctumLoader({ context: ctx, force: true })
    expect(calls).toHaveLength(1)
  })

  it('requireAuthBeforeLoad fetches user when unknown and passes when authed', async () => {
    const client = newClient({ '/api/user': { body: USER } })
    const ctx = createSanctumRouterContext(client)
    await expect(
      requireAuthBeforeLoad({ context: ctx, location: { href: '/dashboard' } }),
    ).resolves.toBeUndefined()
    expect(client.getState().user).toEqual(USER)
  })

  it('requireAuthBeforeLoad throws a redirect when unauthed', async () => {
    const client = newClient({ '/api/user': { status: 401, body: {} } })
    const ctx = createSanctumRouterContext(client)
    try {
      await requireAuthBeforeLoad({
        context: ctx,
        location: { href: '/dashboard?x=1' },
        options: { loginPath: '/login', redirectParam: 'next' },
      })
      throw new Error('expected redirect')
    } catch (err) {
      const r = err as { options?: { to?: string; search?: Record<string, string> } }
      expect(r.options?.to).toBe('/login')
      expect(r.options?.search?.next).toBe('/dashboard?x=1')
    }
  })

  it('requireAuthBeforeLoad uses already-authenticated state without refetch', async () => {
    const calls: string[] = []
    const client = newClient({
      '/api/user': (req) => {
        calls.push(req.url)
        return { body: USER }
      },
    })
    client.setUser(USER)
    const ctx = createSanctumRouterContext(client)
    await requireAuthBeforeLoad({ context: ctx, location: { href: '/dashboard' } })
    expect(calls).toHaveLength(0)
  })

  it('requireGuestBeforeLoad throws when authed', async () => {
    const client = newClient({})
    client.setUser(USER)
    const ctx = createSanctumRouterContext(client)
    try {
      await requireGuestBeforeLoad({ context: ctx, options: { redirectTo: '/home' } })
      throw new Error('expected redirect')
    } catch (err) {
      const r = err as { options?: { to?: string } }
      expect(r.options?.to).toBe('/home')
    }
  })

  it('requireGuestBeforeLoad passes when not authed', async () => {
    const client = newClient({})
    const ctx = createSanctumRouterContext(client)
    await expect(requireGuestBeforeLoad({ context: ctx })).resolves.toBeUndefined()
  })
})

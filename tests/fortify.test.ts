import { describe, expect, it, vi } from 'vitest'

import { createSanctumClient } from '../src/client'
import { createSanctumFortify } from '../src/fortify/createSanctumFortify'
import { memoryStorage } from '../src/storage'
import { makeRouter } from './helpers/make-fetch'

const USER = { id: 1, email: 'a@b.c', name: 'Alice' }

describe('createSanctumFortify', () => {
  it('register: posts to /register, then fetches user, emits login', async () => {
    document.cookie = 'XSRF-TOKEN=csrf-x'
    const calls: string[] = []
    const client = createSanctumClient({
      baseURL: 'https://api.example.com',
      fetch: makeRouter({
        '/sanctum/csrf-cookie': () => {
          calls.push('csrf')
          return { status: 204 }
        },
        '/register': (req) => {
          calls.push(`register ${req.method}`)
          return { status: 201, body: {} }
        },
        '/api/user': () => {
          calls.push('user')
          return { body: USER }
        },
      }),
    })
    const onLogin = vi.fn()
    client.on('login', onLogin)

    const fortify = createSanctumFortify(client)
    const user = await fortify.register({
      name: 'Alice',
      email: 'a@b.c',
      password: 'secret',
      password_confirmation: 'secret',
    })

    expect(user).toEqual(USER)
    expect(calls).toContain('csrf')
    expect(calls).toContain('register POST')
    expect(calls).toContain('user')
    expect(onLogin).toHaveBeenCalledWith({ user: USER })
  })

  it('register in token mode: extracts token from response and stores it', async () => {
    const storage = memoryStorage()
    let authHeader: string | null = null
    const client = createSanctumClient({
      baseURL: 'https://api.example.com',
      mode: 'token',
      storage,
      fetch: makeRouter({
        '/register': () => ({ body: { token: 'abc-token' } }),
        '/api/user': (req) => {
          authHeader = req.headers.get('Authorization')
          return { body: USER }
        },
      }),
    })
    const fortify = createSanctumFortify(client)
    const user = await fortify.register({
      name: 'A',
      email: 'a@b.c',
      password: 'x',
      password_confirmation: 'x',
    })
    expect(user).toEqual(USER)
    expect(await storage.getItem('sanctum.token')).toBe('abc-token')
    expect(authHeader).toBe('Bearer abc-token')
  })

  it('forgotPassword posts and returns status', async () => {
    document.cookie = 'XSRF-TOKEN=t'
    const client = createSanctumClient({
      baseURL: 'https://api.example.com',
      fetch: makeRouter({
        '/sanctum/csrf-cookie': { status: 204 },
        '/forgot-password': { body: { status: 'passwords.sent' } },
      }),
    })
    const result = await createSanctumFortify(client).forgotPassword({ email: 'a@b.c' })
    expect(result).toEqual({ status: 'passwords.sent' })
  })

  it('resetPassword posts payload to /reset-password', async () => {
    document.cookie = 'XSRF-TOKEN=t'
    let body: string | null = null
    const client = createSanctumClient({
      baseURL: 'https://api.example.com',
      fetch: makeRouter({
        '/sanctum/csrf-cookie': { status: 204 },
        '/reset-password': async (req) => {
          body = await req.text()
          return { body: { status: 'passwords.reset' } }
        },
      }),
    })
    const result = await createSanctumFortify(client).resetPassword({
      token: 'tok',
      email: 'a@b.c',
      password: 'new',
      password_confirmation: 'new',
    })
    expect(result.status).toBe('passwords.reset')
    expect(body).toContain('"token":"tok"')
  })

  it('updateProfile triggers PUT then refetches user', async () => {
    document.cookie = 'XSRF-TOKEN=t'
    let methodSeen = ''
    const client = createSanctumClient({
      baseURL: 'https://api.example.com',
      fetch: makeRouter({
        '/sanctum/csrf-cookie': { status: 204 },
        '/user/profile-information': (req) => {
          methodSeen = req.method
          return { status: 200, body: {} }
        },
        '/api/user': { body: { ...USER, name: 'Updated' } },
      }),
    })
    const user = await createSanctumFortify(client).updateProfile({ name: 'Updated' })
    expect(methodSeen).toBe('PUT')
    expect(user).toEqual({ ...USER, name: 'Updated' })
  })

  it('twoFactor: enable POSTs, disable DELETEs to the same path', async () => {
    document.cookie = 'XSRF-TOKEN=t'
    const calls: string[] = []
    const client = createSanctumClient({
      baseURL: 'https://api.example.com',
      fetch: makeRouter({
        '/sanctum/csrf-cookie': { status: 204 },
        '/user/two-factor-authentication': (req) => {
          calls.push(req.method)
          return { status: 204 }
        },
      }),
    })
    const fortify = createSanctumFortify(client)
    await fortify.twoFactor.enable()
    await fortify.twoFactor.disable()
    expect(calls).toEqual(['POST', 'DELETE'])
  })

  it('twoFactor.challenge submits code and refetches user', async () => {
    document.cookie = 'XSRF-TOKEN=t'
    const client = createSanctumClient({
      baseURL: 'https://api.example.com',
      fetch: makeRouter({
        '/sanctum/csrf-cookie': { status: 204 },
        '/two-factor-challenge': { body: {} },
        '/api/user': { body: USER },
      }),
    })
    const user = await createSanctumFortify(client).twoFactor.challenge({ code: '123456' })
    expect(user).toEqual(USER)
  })

  it('twoFactor.qrCode fetches SVG', async () => {
    const client = createSanctumClient({
      baseURL: 'https://api.example.com',
      fetch: makeRouter({
        '/user/two-factor-qr-code': { body: { svg: '<svg/>' } },
      }),
    })
    expect(await createSanctumFortify(client).twoFactor.qrCode()).toEqual({ svg: '<svg/>' })
  })
})

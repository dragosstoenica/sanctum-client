import { beforeEach, describe, expect, it, vi } from 'vitest'

const secureStoreMock = {
  store: new Map<string, string>(),
  getItemAsync: vi.fn(async (key: string) => secureStoreMock.store.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    secureStoreMock.store.set(key, value)
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    secureStoreMock.store.delete(key)
  }),
}

vi.mock('expo-secure-store', () => secureStoreMock)

// Import after the mock is registered.
const { createExpoSanctumClient, secureStoreAdapter, readSecureToken } = await import(
  '../src/expo'
)
const { makeRouter } = await import('./helpers/make-fetch')

describe('expo adapter', () => {
  beforeEach(() => {
    secureStoreMock.store.clear()
    secureStoreMock.getItemAsync.mockClear()
    secureStoreMock.setItemAsync.mockClear()
    secureStoreMock.deleteItemAsync.mockClear()
  })

  it('secureStoreAdapter wraps SecureStore methods', async () => {
    const adapter = secureStoreAdapter()
    await adapter.setItem('k', 'v')
    expect(await adapter.getItem('k')).toBe('v')
    await adapter.removeItem('k')
    expect(await adapter.getItem('k')).toBeNull()
  })

  it('secureStoreAdapter returns null on read errors', async () => {
    secureStoreMock.getItemAsync.mockRejectedValueOnce(new Error('keychain locked'))
    const adapter = secureStoreAdapter()
    expect(await adapter.getItem('k')).toBeNull()
  })

  it('createExpoSanctumClient enforces token mode + SecureStore', async () => {
    const client = createExpoSanctumClient({
      baseURL: 'https://api.example.com',
      fetch: makeRouter({ '/login': { body: { token: 'tok-x' } }, '/api/user': { body: { id: 1 } } }),
    })
    expect(client.config.mode).toBe('token')
    expect(client.config.withCredentials).toBe(false)
    expect(client.config.crossTabSync).toBe(false)

    await client.login({ email: 'a@b.c', password: 'x' })
    expect(await client.getToken()).toBe('tok-x')
    expect(secureStoreMock.setItemAsync).toHaveBeenCalledWith('sanctum.token', 'tok-x', undefined)
  })

  it('readSecureToken reads from SecureStore', async () => {
    secureStoreMock.store.set('sanctum.token', 'tok-r')
    expect(await readSecureToken()).toBe('tok-r')
  })

  it('readSecureToken returns null on error', async () => {
    secureStoreMock.getItemAsync.mockRejectedValueOnce(new Error('locked'))
    expect(await readSecureToken()).toBeNull()
  })
})

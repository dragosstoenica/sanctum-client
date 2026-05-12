import type { StorageAdapter } from './types'

export function memoryStorage(): StorageAdapter {
  const store = new Map<string, string>()
  return {
    getItem(key) {
      return store.get(key) ?? null
    },
    setItem(key, value) {
      store.set(key, value)
    },
    removeItem(key) {
      store.delete(key)
    },
  }
}

let warned = false

/**
 * Browser localStorage adapter. Opt-in only — XSS-exposed. Emits a one-time
 * dev console warning to make the security tradeoff visible.
 */
export function localStorageAdapter(): StorageAdapter {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return memoryStorage()
  }
  if (!warned && typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.warn(
      '[sanctum-client] localStorageAdapter is XSS-exposed. Prefer cookie mode for web sessions; use memoryStorage for ephemeral PAT mode.',
    )
    warned = true
  }
  const ls = window.localStorage
  return {
    getItem(key) {
      try {
        return ls.getItem(key)
      } catch {
        return null
      }
    },
    setItem(key, value) {
      try {
        ls.setItem(key, value)
      } catch {
        /* quota / private mode — fail silent */
      }
    },
    removeItem(key) {
      try {
        ls.removeItem(key)
      } catch {
        /* ignore */
      }
    },
  }
}

type CrossTabPayload =
  | { type: 'login'; user: unknown }
  | { type: 'logout' }
  | { type: 'tokenUpdated'; token: string | null }
  | { type: 'sessionExpired' }

export interface CrossTabAdapter {
  publish(payload: CrossTabPayload): void
  destroy(): void
}

export function createCrossTabAdapter(
  channelName: string,
  onMessage: (payload: CrossTabPayload) => void,
): CrossTabAdapter {
  if (typeof window === 'undefined') {
    return { publish() {}, destroy() {} }
  }

  // Primary: BroadcastChannel
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(channelName)
    const handler = (event: MessageEvent) => {
      if (event.data && typeof event.data === 'object' && 'type' in event.data) {
        onMessage(event.data as CrossTabPayload)
      }
    }
    channel.addEventListener('message', handler)
    return {
      publish(payload) {
        try {
          channel.postMessage(payload)
        } catch {
          /* ignore */
        }
      },
      destroy() {
        channel.removeEventListener('message', handler)
        channel.close()
      },
    }
  }

  // Fallback: storage event on a versioned localStorage key
  if (typeof window.localStorage !== 'undefined') {
    const key = `${channelName}:msg`
    const handler = (event: StorageEvent) => {
      if (event.key !== key || !event.newValue) return
      try {
        const payload = JSON.parse(event.newValue) as { ts: number; data: CrossTabPayload }
        if (payload && payload.data && typeof payload.data === 'object') {
          onMessage(payload.data)
        }
      } catch {
        /* ignore malformed */
      }
    }
    window.addEventListener('storage', handler)
    return {
      publish(payload) {
        try {
          window.localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data: payload }))
        } catch {
          /* quota / private mode — ignore */
        }
      },
      destroy() {
        window.removeEventListener('storage', handler)
      },
    }
  }

  return { publish() {}, destroy() {} }
}

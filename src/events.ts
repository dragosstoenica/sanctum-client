import type { SanctumEventMap, SanctumUnsubscribe } from './types'

type AnyHandler = (payload: unknown) => void

export function createEventBus<TUser = unknown>() {
  type Map = SanctumEventMap<TUser>
  type Handler<K extends keyof Map> = (payload: Map[K]) => void

  const handlers = new Map<keyof Map, Set<AnyHandler>>()

  function on<K extends keyof Map>(event: K, handler: Handler<K>): SanctumUnsubscribe {
    let set = handlers.get(event)
    if (!set) {
      set = new Set()
      handlers.set(event, set)
    }
    set.add(handler as AnyHandler)
    return () => {
      set!.delete(handler as AnyHandler)
    }
  }

  function off<K extends keyof Map>(event: K, handler: Handler<K>): void {
    handlers.get(event)?.delete(handler as AnyHandler)
  }

  function emit<K extends keyof Map>(event: K, payload: Map[K]): void {
    const set = handlers.get(event)
    if (!set) return
    for (const handler of set) {
      try {
        ;(handler as Handler<K>)(payload)
      } catch {
        // listener errors are isolated
      }
    }
  }

  function clear(): void {
    handlers.clear()
  }

  return { on, off, emit, clear }
}

export type EventBus<TUser = unknown> = ReturnType<typeof createEventBus<TUser>>

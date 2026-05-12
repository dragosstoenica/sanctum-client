import type { SanctumState, SanctumStatus, SanctumUnsubscribe } from './types'

export function createStateMachine<TUser>(initial: SanctumState<TUser>) {
  let state: SanctumState<TUser> = initial
  const listeners = new Set<(s: SanctumState<TUser>) => void>()

  function get(): SanctumState<TUser> {
    return state
  }

  function set(next: Partial<SanctumState<TUser>>): {
    state: SanctumState<TUser>
    previousStatus: SanctumStatus
    statusChanged: boolean
  } {
    const previousStatus = state.status
    const merged: SanctumState<TUser> = { ...state, ...next }
    if (
      merged.status === state.status &&
      merged.user === state.user &&
      merged.error === state.error
    ) {
      return { state, previousStatus, statusChanged: false }
    }
    state = merged
    for (const listener of listeners) {
      try {
        listener(state)
      } catch {
        // listener errors isolated
      }
    }
    return { state, previousStatus, statusChanged: previousStatus !== state.status }
  }

  function subscribe(listener: (s: SanctumState<TUser>) => void): SanctumUnsubscribe {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  function clear(): void {
    listeners.clear()
  }

  return { get, set, subscribe, clear }
}

export type StateMachine<TUser> = ReturnType<typeof createStateMachine<TUser>>

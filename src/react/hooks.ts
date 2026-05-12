import { useCallback, useContext, useRef, useState, useSyncExternalStore } from 'react'

import type { SanctumClient, SanctumState } from '../types'
import { SanctumContext } from './context'

/**
 * Get the {@link SanctumClient} from the nearest `<SanctumProvider>` ancestor.
 *
 * @throws if called outside a `<SanctumProvider>`.
 */
export function useSanctum<TUser = unknown>(): SanctumClient<TUser> {
  const ctx = useContext(SanctumContext)
  if (!ctx) {
    throw new Error('useSanctum: <SanctumProvider> is missing from the tree.')
  }
  return ctx as SanctumClient<TUser>
}

function selectState<TUser>(client: SanctumClient<TUser>) {
  return client.getState()
}

/**
 * Subscribe to the full Sanctum {@link SanctumState} (status, user, error).
 * Most consumers want {@link useAuth} or {@link useUser} instead.
 */
export function useSanctumState<TUser = unknown>(): SanctumState<TUser> {
  const client = useSanctum<TUser>()
  const subscribe = useCallback(
    (cb: () => void) => client.subscribe(cb),
    [client],
  )
  const getSnapshot = useCallback(() => selectState(client), [client])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export interface AuthSummary<TUser> {
  user: TUser | null
  status: SanctumState<TUser>['status']
  isAuthenticated: boolean
  isLoading: boolean
  isUnknown: boolean
  error: unknown
}

/**
 * Reactive auth summary with the four flags most UI cares about.
 *
 * @example
 * ```tsx
 * const { user, isAuthenticated, isLoading } = useAuth<MyUser>()
 * if (isLoading) return <Spinner />
 * return isAuthenticated ? <App user={user!} /> : <Login />
 * ```
 */
export function useAuth<TUser = unknown>(): AuthSummary<TUser> {
  const state = useSanctumState<TUser>()
  return {
    user: state.user,
    status: state.status,
    isAuthenticated: state.status === 'authenticated',
    isLoading: state.status === 'loading' || state.status === 'unknown',
    isUnknown: state.status === 'unknown',
    error: state.error,
  }
}

/** Reactive accessor for the typed user, or `null` if not signed in. */
export function useUser<TUser = unknown>(): TUser | null {
  return useSanctumState<TUser>().user
}

export interface MutationResult<TArgs extends unknown[], TResult> {
  mutate: (...args: TArgs) => Promise<TResult>
  isPending: boolean
  error: unknown
  data: TResult | undefined
  reset: () => void
}

/**
 * Minimal mutation hook used by the built-in auth + Fortify hooks. Returns
 * `{ mutate, isPending, error, data, reset }` similar to TanStack Query's
 * `useMutation` but without the dependency.
 *
 * The `mutate` identity is stable for the component's lifetime — safe to use
 * in dependency arrays.
 */
export function useMutation<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
): MutationResult<TArgs, TResult> {
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [data, setData] = useState<TResult | undefined>(undefined)

  // Keep a stable ref to the latest `fn` so `mutate` itself can be a singleton
  // for the lifetime of the component — no deps, no recreated identity per
  // render, no stale closures.
  const fnRef = useRef(fn)
  fnRef.current = fn

  const mutate = useCallback(async (...args: TArgs): Promise<TResult> => {
    setIsPending(true)
    setError(null)
    try {
      const result = await fnRef.current(...args)
      setData(result)
      setIsPending(false)
      return result
    } catch (err) {
      setError(err)
      setIsPending(false)
      throw err
    }
  }, [])

  const reset = useCallback(() => {
    setData(undefined)
    setError(null)
    setIsPending(false)
  }, [])

  return { mutate, isPending, error, data, reset }
}

/**
 * Mutation hook for `POST /login`. Returns the {@link MutationResult} pattern;
 * call `mutate({ email, password })` from a form's submit handler.
 */
export function useLogin<TUser = unknown>() {
  const client = useSanctum<TUser>()
  const fn = useCallback(
    (credentials: Record<string, unknown>) => client.login(credentials),
    [client],
  )
  return useMutation(fn)
}

/** Mutation hook for `POST /logout`. Always clears local state, even if the request fails. */
export function useLogout() {
  const client = useSanctum()
  const fn = useCallback(() => client.logout(), [client])
  return useMutation(fn)
}

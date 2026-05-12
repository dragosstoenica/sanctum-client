import { type QueryClient, queryOptions, useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useEffect } from 'react'

// Public subpath import to keep module identity stable across bundlers — see
// `src/fortify/hooks.ts` for the rationale.
import { useSanctum } from 'sanctum-client/react'

import type { SanctumClient, SanctumEventMap } from '../types'

export const SANCTUM_USER_QUERY_KEY = ['sanctum', 'user'] as const

export function sanctumQueryOptions<TUser = unknown>(client: SanctumClient<TUser>) {
  return queryOptions<TUser | null>({
    queryKey: SANCTUM_USER_QUERY_KEY,
    queryFn: () => client.fetchUser(),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })
}

export function useSanctumQuery<TUser = unknown>(): UseQueryResult<TUser | null> {
  const client = useSanctum<TUser>()
  return useQuery(sanctumQueryOptions(client))
}

const DEFAULT_INVALIDATE_EVENTS: Array<keyof SanctumEventMap> = [
  'login',
  'logout',
  'userUpdated',
  'crossTabLogin',
  'crossTabLogout',
  'sessionExpired',
]

/**
 * Bind a TanStack Query QueryClient to a Sanctum client so the user query is
 * invalidated whenever auth lifecycle events fire. Returns the unsubscribe fn.
 */
export function bindSanctumToQueryClient<TUser = unknown>(
  client: SanctumClient<TUser>,
  queryClient: QueryClient,
  events: Array<keyof SanctumEventMap> = DEFAULT_INVALIDATE_EVENTS,
): () => void {
  const unsubs = events.map((event) =>
    client.on(event as keyof SanctumEventMap<TUser>, () => {
      void queryClient.invalidateQueries({ queryKey: SANCTUM_USER_QUERY_KEY })
    }),
  )
  return () => {
    for (const u of unsubs) u()
  }
}

/**
 * React hook variant — mounts the binding for the lifetime of the component.
 * Usually placed in your app root next to `<SanctumProvider>`.
 */
export function useBindSanctumToQueryClient<TUser = unknown>(
  queryClient: QueryClient,
  events?: Array<keyof SanctumEventMap>,
): void {
  const client = useSanctum<TUser>()
  useEffect(() => bindSanctumToQueryClient(client, queryClient, events), [client, queryClient, events])
}

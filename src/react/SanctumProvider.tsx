import { type ReactNode, useEffect, useRef } from 'react'

import type { SanctumClient } from '../types'
import { SanctumContext } from './context'

export interface SanctumProviderProps<TUser> {
  /** The Sanctum client instance — created once at module load. */
  client: SanctumClient<TUser>
  /**
   * Hydrate the provider with a known user (e.g. from SSR). Pass `null` to
   * explicitly mark the session as unauthenticated. Omit to let the client's
   * `autoFetchUser` flow probe `/api/user` on mount.
   */
  initialUser?: TUser | null
  children: ReactNode
}

/**
 * Mounts the Sanctum client in React context so hooks like {@link useAuth},
 * {@link useLogin}, and the Fortify hooks can find it.
 *
 * Place at the top of your app (or inside a `'use client'` wrapper in Next).
 * The client itself is typically created once at module scope.
 *
 * @example
 * ```tsx
 * import { createSanctumClient } from 'sanctum-client'
 * import { SanctumProvider } from 'sanctum-client/react'
 *
 * const sanctum = createSanctumClient({ baseURL, mode: 'cookie' })
 *
 * createRoot(rootEl).render(
 *   <SanctumProvider client={sanctum}>
 *     <App />
 *   </SanctumProvider>,
 * )
 * ```
 */
export function SanctumProvider<TUser>({
  client,
  initialUser,
  children,
}: SanctumProviderProps<TUser>): ReactNode {
  const initialized = useRef(false)

  if (!initialized.current && initialUser !== undefined) {
    client.setUser(initialUser)
  }
  initialized.current = true

  useEffect(() => {
    if (!client.config.autoFetchUser) return
    if (initialUser !== undefined) return
    void client.initialize()
  }, [client, initialUser])

  return (
    <SanctumContext.Provider value={client as SanctumClient<unknown>}>
      {children}
    </SanctumContext.Provider>
  )
}

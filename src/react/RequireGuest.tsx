import { type ReactNode } from 'react'

import { useAuth } from './hooks'

export interface RequireGuestProps {
  children: ReactNode
  loading?: ReactNode
  /** Rendered when the user IS authenticated (i.e. guest-only content denied). */
  fallback?: ReactNode
}

export function RequireGuest({ children, loading = null, fallback = null }: RequireGuestProps): ReactNode {
  const { isAuthenticated, isLoading } = useAuth()
  if (isLoading) return <>{loading}</>
  if (isAuthenticated) return <>{fallback}</>
  return <>{children}</>
}

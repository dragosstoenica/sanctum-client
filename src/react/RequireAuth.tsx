import { type ReactNode } from 'react'

import { useAuth } from './hooks'

export interface RequireAuthProps {
  children: ReactNode
  /** Rendered while status is 'unknown' or 'loading'. */
  loading?: ReactNode
  /** Rendered when status is 'unauthenticated' (or 'error'). */
  fallback?: ReactNode
}

export function RequireAuth({ children, loading = null, fallback = null }: RequireAuthProps): ReactNode {
  const { isAuthenticated, isLoading } = useAuth()
  if (isLoading) return <>{loading}</>
  if (!isAuthenticated) return <>{fallback}</>
  return <>{children}</>
}

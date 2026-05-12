'use client'

// Re-export the public subpaths so the consumer's bundler sees a single
// module identity per subpath. See `src/fortify/hooks.ts` for the rationale.
export {
  SanctumProvider,
  RequireAuth,
  RequireGuest,
  useSanctum,
  useSanctumState,
  useAuth,
  useUser,
  useLogin,
  useLogout,
  useMutation,
} from 'sanctum-client/react'
export type {
  SanctumProviderProps,
  AuthSummary,
  MutationResult,
} from 'sanctum-client/react'
export {
  createSanctumClient,
  memoryStorage,
  localStorageAdapter,
} from 'sanctum-client'
export type { SanctumClient, SanctumConfigInput } from 'sanctum-client'

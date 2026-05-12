import * as SecureStore from 'expo-secure-store'
import { createSanctumClient } from 'sanctum-client'
import type { SanctumClient, SanctumConfigInput, StorageAdapter } from 'sanctum-client'

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
  AuthSummary,
  MutationResult,
  SanctumProviderProps,
} from 'sanctum-client/react'

export interface SecureStoreOptions {
  /** Key used for SecureStore. Default: `'sanctum.token'` */
  key?: string
  /** SecureStore options forwarded to set/get (e.g. requireAuthentication). */
  options?: SecureStore.SecureStoreOptions
}

export function secureStoreAdapter(options: SecureStoreOptions = {}): StorageAdapter {
  const storeOptions = options.options
  return {
    async getItem(key) {
      try {
        return await SecureStore.getItemAsync(key, storeOptions)
      } catch {
        return null
      }
    },
    async setItem(key, value) {
      await SecureStore.setItemAsync(key, value, storeOptions)
    },
    async removeItem(key) {
      await SecureStore.deleteItemAsync(key, storeOptions)
    },
  }
}

export interface ExpoSanctumConfig<TUser = unknown>
  extends Omit<SanctumConfigInput<TUser>, 'mode' | 'storage'> {
  /** Optional override; token mode is enforced. */
  mode?: 'token'
  storage?: StorageAdapter
  secureStore?: SecureStoreOptions
}

/**
 * Create a Sanctum client preconfigured for Expo:
 * - PAT (token) mode is enforced — cookies are not viable on React Native
 * - SecureStore is the default storage (iOS Keychain / Android Keystore)
 * - Cross-tab sync is disabled (single process)
 */
export function createExpoSanctumClient<TUser = unknown>(
  config: ExpoSanctumConfig<TUser>,
): SanctumClient<TUser> {
  return createSanctumClient<TUser>({
    ...config,
    mode: 'token',
    storage: config.storage ?? secureStoreAdapter(config.secureStore),
    crossTabSync: false,
    withCredentials: false,
  })
}

/**
 * Read the bearer token from SecureStore directly. Use sparingly — usually
 * `client.getToken()` is what you want.
 */
export async function readSecureToken(
  key = 'sanctum.token',
  options?: SecureStore.SecureStoreOptions,
): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key, options)
  } catch {
    return null
  }
}

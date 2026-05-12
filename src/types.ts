export type SanctumMode = 'cookie' | 'token'

export type SanctumStatus =
  | 'unknown'
  | 'loading'
  | 'authenticated'
  | 'unauthenticated'
  | 'error'

export interface SanctumAuthRoutes {
  csrf: string
  login: string
  logout: string
  user: string
  register: string
  forgotPassword: string
  resetPassword: string
  verifyEmail: string
  confirmPassword: string
  profile: string
  password: string
  twoFactorEnable: string
  twoFactorDisable: string
  twoFactorConfirm: string
  twoFactorChallenge: string
  twoFactorRecovery: string
  twoFactorQrCode: string
  twoFactorSecretKey: string
}

export type SanctumAuthRoutesInput = Partial<SanctumAuthRoutes>

export interface StorageAdapter {
  getItem(key: string): string | null | Promise<string | null>
  setItem(key: string, value: string): void | Promise<void>
  removeItem(key: string): void | Promise<void>
}

export interface SanctumConfig<TUser = unknown> {
  baseURL: string
  mode: SanctumMode
  routes: SanctumAuthRoutes
  storage: StorageAdapter
  fetch: typeof fetch
  csrfHeader: string
  csrfCookie: string
  withCredentials: boolean
  tokenStorageKey: string
  tokenExtractor: (response: unknown) => string | null | undefined
  crossTabSync: boolean
  crossTabChannel: string
  autoFetchUser: boolean
  onUnauthenticated?: () => void
  onSessionExpired?: () => void
  /**
   * Optional hook called whenever a Response is received. Use to capture rate
   * limit headers, log requests, or intercept before parsing.
   */
  onResponse?: (ctx: { request: Request; response: Response }) => void
  /** Used at type level only — pin the user shape across hooks. */
  __user?: TUser
}

export type SanctumConfigInput<TUser = unknown> = {
  baseURL: string
  mode?: SanctumMode
  routes?: SanctumAuthRoutesInput
  storage?: StorageAdapter
  fetch?: typeof fetch
  csrfHeader?: string
  csrfCookie?: string
  withCredentials?: boolean
  tokenStorageKey?: string
  tokenExtractor?: (response: unknown) => string | null | undefined
  crossTabSync?: boolean
  crossTabChannel?: string
  autoFetchUser?: boolean
  onUnauthenticated?: () => void
  onSessionExpired?: () => void
  onResponse?: (ctx: { request: Request; response: Response }) => void
  __user?: TUser
}

export type SanctumRequestBody = BodyInit | object | null | undefined

export interface SanctumFetchOptions extends Omit<RequestInit, 'body' | 'headers'> {
  headers?: Record<string, string>
  body?: SanctumRequestBody
  query?: Record<string, string | number | boolean | null | undefined>
  /** Skip CSRF cookie acquisition for this request (rare). */
  skipCsrf?: boolean
}

export interface SanctumRawResult<T> {
  data: T
  response: Response
}

export type SessionExpiredReason =
  | 'unauthenticated'
  | 'csrf-mismatch'
  | 'cross-tab'

export type SanctumEventMap<TUser = unknown> = {
  statusChanged: { status: SanctumStatus; previous: SanctumStatus }
  userUpdated: { user: TUser | null }
  login: { user: TUser }
  logout: undefined
  tokenUpdated: { token: string | null }
  sessionExpired: { reason: SessionExpiredReason }
  crossTabLogin: { user: TUser | null }
  crossTabLogout: undefined
  error: { error: unknown; phase: 'init' | 'login' | 'logout' | 'request' | 'user' }
  request: { request: Request }
  response: { request: Request; response: Response }
}

export interface SanctumState<TUser = unknown> {
  status: SanctumStatus
  user: TUser | null
  error: unknown
}

export type SanctumUnsubscribe = () => void

export interface SanctumClient<TUser = unknown> {
  config: SanctumConfig<TUser>

  /** Reactive snapshot getter. */
  getState(): SanctumState<TUser>
  subscribe(listener: (state: SanctumState<TUser>) => void): SanctumUnsubscribe

  /** Typed event bus. */
  on<K extends keyof SanctumEventMap<TUser>>(
    event: K,
    handler: (payload: SanctumEventMap<TUser>[K]) => void,
  ): SanctumUnsubscribe
  emit<K extends keyof SanctumEventMap<TUser>>(
    event: K,
    payload: SanctumEventMap<TUser>[K],
  ): void

  /** Core HTTP wrapper. Returns parsed JSON. Throws SanctumHttpError on non-2xx. */
  fetch<T = unknown>(path: string, options?: SanctumFetchOptions): Promise<T>
  /** Same as fetch() but returns the raw Response alongside parsed body. */
  raw<T = unknown>(
    path: string,
    options?: SanctumFetchOptions,
  ): Promise<SanctumRawResult<T>>

  /** Auth lifecycle. */
  initialize(): Promise<void>
  fetchUser(): Promise<TUser | null>
  login(credentials: Record<string, unknown>): Promise<TUser>
  logout(): Promise<void>
  setUser(user: TUser | null): void
  setToken(token: string | null): Promise<void>
  getToken(): Promise<string | null>

  /** Manually fetch + cache the CSRF cookie (cookie mode). No-op otherwise. */
  ensureCsrf(): Promise<void>

  /** Tear down listeners (cross-tab channels, etc). */
  destroy(): void
}

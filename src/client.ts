import { encodeBody, parseResponse } from './body'
import { createCrossTabAdapter } from './crossTab'
import { isStateChanging, readCookie } from './csrf'
import { SanctumConfigError, SanctumHttpError, SanctumNetworkError } from './errors'
import { createEventBus } from './events'
import { resolveRoutes } from './routes'
import { createStateMachine } from './state'
import { memoryStorage } from './storage'
import type {
  SanctumClient,
  SanctumConfig,
  SanctumConfigInput,
  SanctumFetchOptions,
  SanctumRawResult,
} from './types'
import { appendQuery, joinURL } from './url'

const DEFAULT_TOKEN_KEY = 'sanctum.token'

function defaultTokenExtractor(response: unknown): string | null | undefined {
  if (!response || typeof response !== 'object') return null
  const obj = response as Record<string, unknown>
  if (typeof obj.token === 'string') return obj.token
  if (typeof obj.access_token === 'string') return obj.access_token
  if (obj.data && typeof obj.data === 'object') {
    const data = obj.data as Record<string, unknown>
    if (typeof data.token === 'string') return data.token
    if (typeof data.access_token === 'string') return data.access_token
  }
  return null
}

function resolveConfig<TUser>(input: SanctumConfigInput<TUser>): SanctumConfig<TUser> {
  if (!input.baseURL) {
    throw new SanctumConfigError('createSanctumClient: `baseURL` is required.')
  }
  return {
    baseURL: input.baseURL.replace(/\/+$/, ''),
    mode: input.mode ?? 'cookie',
    routes: resolveRoutes(input.routes),
    storage: input.storage ?? memoryStorage(),
    fetch: input.fetch ?? globalThis.fetch.bind(globalThis),
    csrfHeader: input.csrfHeader ?? 'X-XSRF-TOKEN',
    csrfCookie: input.csrfCookie ?? 'XSRF-TOKEN',
    withCredentials: input.withCredentials ?? (input.mode ?? 'cookie') === 'cookie',
    tokenStorageKey: input.tokenStorageKey ?? DEFAULT_TOKEN_KEY,
    tokenExtractor: input.tokenExtractor ?? defaultTokenExtractor,
    crossTabSync: input.crossTabSync ?? true,
    crossTabChannel: input.crossTabChannel ?? 'sanctum-auth',
    autoFetchUser: input.autoFetchUser ?? true,
    ...(input.onUnauthenticated !== undefined && { onUnauthenticated: input.onUnauthenticated }),
    ...(input.onSessionExpired !== undefined && { onSessionExpired: input.onSessionExpired }),
    ...(input.onResponse !== undefined && { onResponse: input.onResponse }),
  }
}

/**
 * Create a framework-agnostic Sanctum client.
 *
 * Pass a `baseURL` pointing at your Laravel app and pick `mode: 'cookie'` for
 * SPA session-cookie auth or `mode: 'token'` for Personal Access Tokens.
 * Default routes match a vanilla Sanctum + Fortify install — override any
 * subset via the `routes` option.
 *
 * @example Cookie mode (SPA)
 * ```ts
 * import { createSanctumClient } from 'sanctum-client'
 *
 * const sanctum = createSanctumClient({
 *   baseURL: 'http://localhost:8000',
 *   mode: 'cookie',
 * })
 * await sanctum.login({ email, password })
 * const user = await sanctum.fetchUser()
 * ```
 *
 * @example Token mode (mobile / cross-origin API)
 * ```ts
 * const sanctum = createSanctumClient({
 *   baseURL: 'https://api.example.com',
 *   mode: 'token',
 *   routes: { login: '/api/token/login' },
 * })
 * ```
 *
 * @typeParam TUser - Shape of the authenticated user returned by `routes.user`.
 */
export function createSanctumClient<TUser = unknown>(
  input: SanctumConfigInput<TUser>,
): SanctumClient<TUser> {
  const config = resolveConfig(input)
  const events = createEventBus<TUser>()
  const state = createStateMachine<TUser>({ status: 'unknown', user: null, error: null })

  let csrfFetched = false
  let csrfInflight: Promise<void> | null = null

  const crossTab = config.crossTabSync
    ? createCrossTabAdapter(config.crossTabChannel, (payload) => {
        if (payload.type === 'logout') {
          state.set({ status: 'unauthenticated', user: null, error: null })
          events.emit('crossTabLogout', undefined)
        } else if (payload.type === 'login') {
          const user = payload.user as TUser | null
          state.set({ status: user ? 'authenticated' : 'unauthenticated', user, error: null })
          events.emit('crossTabLogin', { user })
        } else if (payload.type === 'sessionExpired') {
          state.set({ status: 'unauthenticated', user: null, error: null })
          events.emit('sessionExpired', { reason: 'cross-tab' })
        } else if (payload.type === 'tokenUpdated') {
          events.emit('tokenUpdated', { token: payload.token })
        }
      })
    : null

  function setState(next: Parameters<typeof state.set>[0]): void {
    const before = state.get().status
    const { state: now, statusChanged } = state.set(next)
    if (statusChanged) {
      events.emit('statusChanged', { status: now.status, previous: before })
    }
  }

  async function getToken(): Promise<string | null> {
    if (config.mode !== 'token') return null
    return (await config.storage.getItem(config.tokenStorageKey)) ?? null
  }

  async function setToken(token: string | null): Promise<void> {
    if (config.mode !== 'token') return
    if (token) {
      await config.storage.setItem(config.tokenStorageKey, token)
    } else {
      await config.storage.removeItem(config.tokenStorageKey)
    }
    events.emit('tokenUpdated', { token })
    crossTab?.publish({ type: 'tokenUpdated', token })
  }

  async function ensureCsrf(): Promise<void> {
    if (config.mode !== 'cookie') return
    if (csrfFetched) return
    if (csrfInflight) return csrfInflight
    csrfInflight = (async () => {
      const url = joinURL(config.baseURL, config.routes.csrf)
      const request = new Request(url, {
        method: 'GET',
        credentials: config.withCredentials ? 'include' : 'same-origin',
      })
      const response = await config.fetch(request)
      if (!response.ok) {
        throw new SanctumHttpError(response, await safeParse(response))
      }
      csrfFetched = true
    })()
    try {
      await csrfInflight
    } finally {
      csrfInflight = null
    }
  }

  async function buildRequest(
    path: string,
    options: SanctumFetchOptions,
  ): Promise<Request> {
    const method = (options.method ?? 'GET').toUpperCase()
    const url = appendQuery(joinURL(config.baseURL, path), options.query)
    const headers = new Headers()
    headers.set('Accept', 'application/json')
    headers.set('X-Requested-With', 'XMLHttpRequest')

    const { body, contentType } = encodeBody(options.body)
    if (contentType && !options.headers?.['Content-Type'] && !options.headers?.['content-type']) {
      headers.set('Content-Type', contentType)
    }

    if (config.mode === 'cookie' && isStateChanging(method) && !options.skipCsrf) {
      await ensureCsrf()
      const csrf = readCookie(config.csrfCookie)
      if (csrf) headers.set(config.csrfHeader, csrf)
    }

    if (config.mode === 'token') {
      const token = await getToken()
      if (token) headers.set('Authorization', `Bearer ${token}`)
    }

    if (options.headers) {
      for (const [k, v] of Object.entries(options.headers)) headers.set(k, v)
    }

    const { method: _m, body: _b, headers: _h, query: _q, skipCsrf: _s, ...rest } = options
    void _m
    void _b
    void _h
    void _q
    void _s

    return new Request(url, {
      method,
      headers,
      body,
      credentials: config.withCredentials ? 'include' : 'same-origin',
      ...rest,
    })
  }

  async function performFetch<T>(
    path: string,
    options: SanctumFetchOptions,
  ): Promise<SanctumRawResult<T>> {
    const request = await buildRequest(path, options)
    events.emit('request', { request })

    let response: Response
    try {
      response = await config.fetch(request)
    } catch (cause) {
      const err = new SanctumNetworkError(cause)
      events.emit('error', { error: err, phase: 'request' })
      throw err
    }

    events.emit('response', { request, response })
    config.onResponse?.({ request, response })

    const data = await safeParse(response)

    if (!response.ok) {
      if (response.status === 401 || response.status === 419) {
        if (response.status === 419) csrfFetched = false
        if (state.get().status === 'authenticated') {
          setState({ status: 'unauthenticated', user: null, error: null })
          events.emit('sessionExpired', {
            reason: response.status === 419 ? 'csrf-mismatch' : 'unauthenticated',
          })
          config.onSessionExpired?.()
          config.onUnauthenticated?.()
        }
      }
      throw new SanctumHttpError(response, data)
    }

    return { data: data as T, response }
  }

  async function fetchJSON<T>(path: string, options: SanctumFetchOptions = {}): Promise<T> {
    const { data } = await performFetch<T>(path, options)
    return data
  }

  async function raw<T>(
    path: string,
    options: SanctumFetchOptions = {},
  ): Promise<SanctumRawResult<T>> {
    return performFetch<T>(path, options)
  }

  async function fetchUser(): Promise<TUser | null> {
    setState({ status: 'loading' })
    try {
      const user = await fetchJSON<TUser>(config.routes.user)
      setState({ status: 'authenticated', user, error: null })
      events.emit('userUpdated', { user })
      return user
    } catch (error) {
      if (error instanceof SanctumHttpError && (error.status === 401 || error.status === 419)) {
        setState({ status: 'unauthenticated', user: null, error: null })
        return null
      }
      setState({ status: 'error', error })
      events.emit('error', { error, phase: 'user' })
      throw error
    }
  }

  async function login(credentials: Record<string, unknown>): Promise<TUser> {
    setState({ status: 'loading' })
    try {
      const response = await fetchJSON<unknown>(config.routes.login, {
        method: 'POST',
        body: credentials,
      })
      if (config.mode === 'token') {
        const token = config.tokenExtractor(response)
        if (!token) {
          throw new SanctumConfigError(
            'Token mode: login response did not contain a token. Provide `tokenExtractor` if your API returns a non-standard shape.',
          )
        }
        await setToken(token)
      }
      const user = await fetchJSON<TUser>(config.routes.user)
      setState({ status: 'authenticated', user, error: null })
      events.emit('login', { user })
      events.emit('userUpdated', { user })
      crossTab?.publish({ type: 'login', user })
      return user
    } catch (error) {
      setState({ status: 'unauthenticated', user: null, error })
      events.emit('error', { error, phase: 'login' })
      throw error
    }
  }

  async function logout(): Promise<void> {
    try {
      await fetchJSON<unknown>(config.routes.logout, { method: 'POST' })
    } catch (error) {
      // Logout endpoint may 401 if session is already gone — treat as success.
      if (!(error instanceof SanctumHttpError) || error.status !== 401) {
        events.emit('error', { error, phase: 'logout' })
      }
    } finally {
      if (config.mode === 'token') {
        await setToken(null)
      }
      setState({ status: 'unauthenticated', user: null, error: null })
      events.emit('logout', undefined)
      crossTab?.publish({ type: 'logout' })
      csrfFetched = false
    }
  }

  async function initialize(): Promise<void> {
    if (!config.autoFetchUser) return
    try {
      await fetchUser()
    } catch {
      // already recorded via emit('error')
    }
  }

  function setUser(user: TUser | null): void {
    setState({
      status: user ? 'authenticated' : 'unauthenticated',
      user,
      error: null,
    })
    events.emit('userUpdated', { user })
  }

  function destroy(): void {
    crossTab?.destroy()
    events.clear()
    state.clear()
  }

  const client: SanctumClient<TUser> = {
    config,
    getState: state.get,
    subscribe: state.subscribe,
    on: events.on,
    emit: events.emit,
    fetch: fetchJSON,
    raw,
    initialize,
    fetchUser,
    login,
    logout,
    setUser,
    setToken,
    getToken,
    ensureCsrf,
    destroy,
  }

  return client
}

async function safeParse(response: Response): Promise<unknown> {
  try {
    return await parseResponse(response.clone())
  } catch {
    return null
  }
}

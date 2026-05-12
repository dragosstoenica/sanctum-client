import 'server-only'

import { cookies } from 'next/headers'

import { getSanctumClient, type NextServerClientOptions } from './server'

export interface LoginActionResult<TUser> {
  ok: boolean
  user?: TUser
  error?: { message: string; errors?: Record<string, string[]> }
}

/**
 * Server Action helper for password login. Bridges cookies from incoming
 * request, performs login against Laravel, propagates any `Set-Cookie`
 * back to the response.
 *
 * Note: cookies set during fetch within a Server Action are NOT automatically
 * relayed to the browser. You must use a route handler / gateway for that.
 * This helper is best paired with `sanctum-client/next/gateway`.
 */
export async function sanctumLogin<TUser = unknown>(
  options: NextServerClientOptions<TUser>,
  credentials: Record<string, unknown>,
): Promise<LoginActionResult<TUser>> {
  const client = await getSanctumClient<TUser>(options)
  try {
    const user = await client.login(credentials)
    return { ok: true, user }
  } catch (error) {
    return formatError(error)
  }
}

export async function sanctumLogout<TUser = unknown>(
  options: NextServerClientOptions<TUser>,
): Promise<{ ok: boolean; error?: { message: string } }> {
  const client = await getSanctumClient<TUser>(options)
  try {
    await client.logout()
    return { ok: true }
  } catch (error) {
    return { ok: false, error: { message: errorMessage(error) } }
  }
}

/**
 * Wrap a Server Action handler with an authenticated Sanctum client. Calls
 * the inner function only if the user is authenticated; otherwise returns
 * `{ ok: false, error: 'unauthenticated' }`.
 */
export function withSanctum<TUser, TArgs extends unknown[], TResult>(
  options: NextServerClientOptions<TUser>,
  fn: (
    ctx: { user: TUser; client: Awaited<ReturnType<typeof getSanctumClient<TUser>>> },
    ...args: TArgs
  ) => Promise<TResult>,
): (...args: TArgs) => Promise<{ ok: true; data: TResult } | { ok: false; error: string }> {
  return async (...args: TArgs) => {
    const client = await getSanctumClient<TUser>(options)
    const user = await client.fetchUser()
    if (!user) return { ok: false, error: 'unauthenticated' }
    const data = await fn({ user, client }, ...args)
    return { ok: true, data }
  }
}

/**
 * Read the current request's XSRF cookie. Useful for injecting into form
 * payloads when performing non-JS submits via Server Actions.
 */
export async function getCsrfCookie(name = 'XSRF-TOKEN'): Promise<string | null> {
  const store = await cookies()
  return store.get(name)?.value ?? null
}

function formatError<TUser>(error: unknown): LoginActionResult<TUser> {
  const message = errorMessage(error)
  const errs =
    error && typeof error === 'object' && 'errors' in error
      ? ((error as { errors: unknown }).errors as Record<string, string[]> | null)
      : null
  return {
    ok: false,
    error: { message, ...(errs ? { errors: errs } : {}) },
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Unknown error'
}

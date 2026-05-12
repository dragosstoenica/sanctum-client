import { redirect } from '@tanstack/react-router'

import type { SanctumClient } from '../types'

export interface SanctumRouterContext<TUser = unknown> {
  sanctum: SanctumClient<TUser>
}

/**
 * Build a router context object for TanStack Router/Start. Pass into
 * `createRouter({ context: createSanctumRouterContext(client) })` or
 * compose with your existing context.
 */
export function createSanctumRouterContext<TUser>(
  client: SanctumClient<TUser>,
): SanctumRouterContext<TUser> {
  return { sanctum: client }
}

export interface RouteContextWithSanctum<TUser = unknown> {
  sanctum: SanctumClient<TUser>
}

/**
 * Route loader that resolves the current user before render. Returns the
 * user payload so child components/loaders can read it from `Route.useLoaderData()`.
 *
 * If the client already has an authenticated user in cache, returns it
 * synchronously without hitting the network. Pass `{ force: true }` (or set
 * it on the loader call) to force a refetch.
 */
export async function sanctumLoader<TUser = unknown>({
  context,
  force = false,
}: {
  context: RouteContextWithSanctum<TUser>
  force?: boolean
}): Promise<{ user: TUser | null }> {
  if (!force) {
    const state = context.sanctum.getState()
    if (state.status === 'authenticated' && state.user) {
      return { user: state.user }
    }
  }
  const user = await context.sanctum.fetchUser()
  return { user }
}

export interface RequireAuthOptions {
  /** Path to redirect unauthenticated users to. Default `/login`. */
  loginPath?: string
  /** Search param used to capture the original URL. Default `redirect`. */
  redirectParam?: string
}

/**
 * `beforeLoad` guard that throws a redirect to the login route if the user
 * is not authenticated. Refetches the user if status is unknown.
 */
export async function requireAuthBeforeLoad<TUser = unknown>({
  context,
  location,
  options,
}: {
  context: RouteContextWithSanctum<TUser>
  // `pathname` and `search` are accepted but not consumed; declared loosely so
  // TanStack's `ParsedLocation<TSearchSchema>` is assignable here regardless
  // of the route's search schema.
  location: { href: string; pathname?: string; search?: unknown }
  options?: RequireAuthOptions
}): Promise<void> {
  const state = context.sanctum.getState()
  let user = state.user
  if (state.status === 'unknown' || state.status === 'loading') {
    user = await context.sanctum.fetchUser()
  }
  if (!user) {
    const loginPath = options?.loginPath ?? '/login'
    const redirectParam = options?.redirectParam ?? 'redirect'
    throw redirect({
      to: loginPath,
      search: { [redirectParam]: location.href } as Record<string, string>,
    })
  }
}

export interface RequireGuestOptions {
  /** Path to redirect authenticated users away to. Default `/`. */
  redirectTo?: string
}

export async function requireGuestBeforeLoad<TUser = unknown>({
  context,
  options,
}: {
  context: RouteContextWithSanctum<TUser>
  options?: RequireGuestOptions
}): Promise<void> {
  const state = context.sanctum.getState()
  if (state.status === 'authenticated') {
    throw redirect({ to: options?.redirectTo ?? '/' })
  }
}

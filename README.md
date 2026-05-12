# sanctum-client

Laravel Sanctum authentication for React, Next.js 16+, Expo, and TanStack Router/Start. One package, framework-agnostic core, opt-in adapters via subpath imports.

```sh
pnpm add sanctum-client
```

## What you get

- **Cookie mode** (SPA) and **token mode** (PAT / mobile)
- **CSRF lifecycle** handled automatically
- **Cross-tab sync** via `BroadcastChannel` (with `storage` event fallback)
- **Laravel Fortify** lifecycle: register, forgot/reset password, email verification, 2FA, profile/password updates
- **Next.js 16+ App Router**: `proxy.ts` route gating, catch-all gateway to Laravel, RSC helpers, Server Actions
- **Expo / React Native**: `SecureStore` token storage, token-only mode enforced
- **TanStack Router / Start**: loader-based SSR hydration, `beforeLoad` guards, route context
- **TanStack Query**: optional cache mirroring

---

## Table of contents

- [Laravel backend setup](#laravel-backend-setup) — required for **every** client
- [React + Vite](#react--vite)
- [Next.js 16+](#nextjs-16)
- [TanStack Router / Start](#tanstack-router--start)
- [Expo](#expo)
- [Fortify hooks](#fortify-hooks)
- [TanStack Query integration](#tanstack-query-integration)
- [Storage & security](#storage--security)
- [Troubleshooting](#troubleshooting)

---

## Laravel backend setup

This section applies to **every** client. Skipping these steps will cause CSRF 419s, 401s on `/api/user`, or silent CORS failures.

### 1. Install Sanctum + Fortify

```sh
composer require laravel/sanctum laravel/fortify
php artisan vendor:publish --provider="Laravel\Sanctum\SanctumServiceProvider"
php artisan vendor:publish --provider="Laravel\Fortify\FortifyServiceProvider"
php artisan migrate
```

Register the Fortify provider in `bootstrap/providers.php`:

```php
return [
    AppServiceProvider::class,
    FortifyServiceProvider::class,
];
```

### 2. Add `HasApiTokens` + `TwoFactorAuthenticatable` to your User model

```php
use Laravel\Fortify\TwoFactorAuthenticatable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable {
    use HasApiTokens, HasFactory, Notifiable, TwoFactorAuthenticatable;
}
```

Also hide the 2FA secret/recovery columns:

```php
#[Hidden(['password', 'remember_token', 'two_factor_recovery_codes', 'two_factor_secret'])]
```

### 3. Enable Sanctum SPA middleware + register `routes/api.php`

`bootstrap/app.php`:

```php
->withRouting(
    web: __DIR__.'/../routes/web.php',
    api: __DIR__.'/../routes/api.php',          // ← add this
    commands: __DIR__.'/../routes/console.php',
    health: '/up',
)
->withMiddleware(function (Middleware $middleware): void {
    $middleware->statefulApi();                 // ← Sanctum SPA cookie auth
})
```

`routes/api.php`:

```php
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->get('/user', fn (Request $r) => $r->user());

// Optional: token-mode login endpoint for mobile/Expo clients.
Route::post('/token/login', function (Request $request) {
    $request->validate(['email' => 'required|email', 'password' => 'required']);
    $user = \App\Models\User::where('email', $request->email)->first();
    if (! $user || ! \Hash::check($request->password, $user->password)) {
        return response()->json(['message' => 'Invalid credentials.'], 422);
    }
    $token = $user->createToken('sanctum-client')->plainTextToken;
    return response()->json(['token' => $token, 'user' => $user]);
});
```

### 4. SPA-friendly `config/fortify.php`

Set `views` to `false` so Fortify returns JSON instead of Blade:

```php
'views' => false,
```

Confirm the features array enables what your client uses (defaults are fine for most apps):

```php
'features' => [
    Features::registration(),
    Features::resetPasswords(),
    Features::updateProfileInformation(),
    Features::updatePasswords(),
    Features::twoFactorAuthentication(['confirm' => true, 'confirmPassword' => true]),
],
```

### 5. CORS + Sanctum stateful domains + session cookies

Publish CORS:

```sh
php artisan config:publish cors
```

`config/cors.php`:

```php
return [
    'paths' => [
        'api/*', 'login', 'logout', 'register',
        'forgot-password', 'reset-password',
        'email/verification-notification',
        'two-factor-challenge', 'user/*',
        'sanctum/csrf-cookie',
    ],
    'allowed_methods' => ['*'],
    'allowed_origins' => array_filter(explode(',', (string) env('FRONTEND_ORIGINS', ''))),
    'allowed_headers' => ['*'],
    'supports_credentials' => true,   // ← REQUIRED for cookie mode
];
```

`.env`:

```env
# Cookie-mode frontends. Don't include token-mode (Expo) origins here.
FRONTEND_ORIGINS=http://localhost:5173,http://localhost:3000
SANCTUM_STATEFUL_DOMAINS=localhost:5173,localhost:3000

# SameSite=Lax + Secure=false is required for HTTP localhost dev.
SESSION_SAME_SITE=lax
SESSION_SECURE_COOKIE=false
```

**Critical:** if any frontend uses token mode (Expo, native), do **not** include its origin in `SANCTUM_STATEFUL_DOMAINS`. Sanctum will try to apply the CSRF dance and 419 the token-mode requests.

### 6. The `localhost` vs `127.0.0.1` trap

Browsers treat `localhost:5173` and `127.0.0.1:8000` as **different sites**, so `SameSite=Lax` cookies from Laravel won't be sent back. Pick one hostname and use it everywhere:

| ❌ Broken                       | ✅ Works                       |
|---|---|
| Vite on `localhost:5173` → Laravel on `127.0.0.1:8000` | both on `localhost`           |
| Browser tab loads from `127.0.0.1`, fetches from `localhost` | both on `127.0.0.1`           |

Easiest fix: set `*_API_URL=http://localhost:8000` in each frontend's `.env`.

---

## React + Vite

### Install

```sh
pnpm add sanctum-client
```

### `vite.config.ts`

Subpaths (`sanctum-client/react`, `/fortify`, `/react-query`) share a single `SanctumContext` module. Vite's dep optimizer can pre-bundle each subpath separately and duplicate that module, which causes `useSanctum: <SanctumProvider> is missing from the tree.` errors at runtime. Pin all subpaths to their dist files and exclude them from pre-bundling:

```ts
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const require = createRequire(import.meta.url)
const sanctumRoot = dirname(require.resolve('sanctum-client/package.json'))

export default defineConfig({
  plugins: [react()],
  // Use `localhost` so the browser and the Laravel host are same-site under
  // SameSite=Lax. See the Laravel section above for the rationale.
  server: { host: '127.0.0.1' /* or omit and rely on default */ },
  resolve: {
    alias: [
      { find: /^sanctum-client$/, replacement: resolve(sanctumRoot, 'dist/index.js') },
      { find: /^sanctum-client\/react$/, replacement: resolve(sanctumRoot, 'dist/react/index.js') },
      { find: /^sanctum-client\/fortify$/, replacement: resolve(sanctumRoot, 'dist/fortify/index.js') },
      { find: /^sanctum-client\/react-query$/, replacement: resolve(sanctumRoot, 'dist/react-query/index.js') },
    ],
  },
  optimizeDeps: {
    exclude: [
      'sanctum-client',
      'sanctum-client/react',
      'sanctum-client/fortify',
      'sanctum-client/react-query',
    ],
  },
})
```

### `.env`

```env
VITE_API_URL=http://localhost:8000
```

### Client

```tsx
// src/sanctum.ts
import { createSanctumClient } from 'sanctum-client'

export const sanctum = createSanctumClient({
  baseURL: import.meta.env.VITE_API_URL,
  mode: 'cookie',
})
```

```tsx
// src/main.tsx
import { SanctumProvider } from 'sanctum-client/react'
import { sanctum } from './sanctum'

createRoot(document.getElementById('root')!).render(
  <SanctumProvider client={sanctum}>
    <App />
  </SanctumProvider>,
)
```

```tsx
// src/LoginForm.tsx
import { useLogin } from 'sanctum-client/react'

function LoginForm() {
  const { mutate, isPending, error } = useLogin()
  return (
    <form onSubmit={(e) => {
      e.preventDefault()
      const data = new FormData(e.currentTarget)
      void mutate({ email: data.get('email'), password: data.get('password') })
    }}>
      {/* ... */}
    </form>
  )
}
```

---

## Next.js 16+

App Router only. Uses `proxy.ts` (Next 16's replacement for `middleware.ts`).

### Install

```sh
pnpm add sanctum-client
```

### `.env.local`

```env
# Server-side fetches to Laravel.
LARAVEL_URL=http://127.0.0.1:8000

# Public client base — the catch-all gateway forwards /api/* to Laravel.
NEXT_PUBLIC_API_BASE=/api
```

### Per-request server client

```ts
// src/lib/sanctum-server.ts
import 'server-only'
import { getSanctumUser } from 'sanctum-client/next/server'

export const currentUser = () =>
  getSanctumUser({ baseURL: process.env.LARAVEL_URL! })
```

### Root layout (RSC)

```tsx
// src/app/layout.tsx
import { currentUser } from '@/lib/sanctum-server'
import { Providers } from './providers'

// Reading cookies makes the layout dynamic — opt out of SSG.
export const dynamic = 'force-dynamic'

export default async function RootLayout({ children }) {
  const user = await currentUser().catch(() => null)
  return (
    <html>
      <body>
        <Providers initialUser={user}>{children}</Providers>
      </body>
    </html>
  )
}
```

```tsx
// src/app/providers.tsx
'use client'
import { SanctumProvider } from 'sanctum-client/react'   // ← /react, NOT /next
import { sanctum } from '@/sanctum'

export function Providers({ initialUser, children }) {
  return <SanctumProvider client={sanctum} initialUser={initialUser}>{children}</SanctumProvider>
}
```

> **Important:** import `SanctumProvider` and all hooks from `sanctum-client/react`, never from `sanctum-client/next`. Turbopack pre-bundles each subpath independently and an inconsistent import path will produce two `SanctumContext` modules.

### Catch-all gateway

```ts
// src/app/api/[...sanctum]/route.ts
import { createSanctumGateway } from 'sanctum-client/next/gateway'

export const { GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS } = createSanctumGateway({
  upstream: process.env.LARAVEL_URL!,
  basePath: '/api',
  preservePath: false,   // /api/sanctum/csrf-cookie → /sanctum/csrf-cookie upstream
})

export const runtime = 'nodejs'
```

### Edge route gating (`proxy.ts` at the app root)

```ts
// proxy.ts (Next 16+; this file is called `middleware.ts` in Next ≤15)
import { withSanctumAuth } from 'sanctum-client/next/proxy'

export default withSanctumAuth({
  protect: ['/dashboard/:path*'],
  loginPath: '/login',
})

export const config = { matcher: ['/dashboard/:path*'] }
```

### Client

```ts
// src/sanctum.ts
'use client'
import { createSanctumClient } from 'sanctum-client'

export const sanctum = createSanctumClient({
  baseURL: process.env.NEXT_PUBLIC_API_BASE ?? '/api',
  mode: 'cookie',
})
```

### Laravel `.env` additions for Next

```env
SANCTUM_STATEFUL_DOMAINS=localhost:3000,127.0.0.1:3000
FRONTEND_ORIGINS=http://localhost:3000
```

> The gateway lives on Next's origin, so the browser sees same-origin cookies. Laravel sees an `Origin` of `localhost:3000` (or whatever your Next URL is) — that's what needs to be in `SANCTUM_STATEFUL_DOMAINS`.

---

## TanStack Router / Start

### Install

```sh
pnpm add sanctum-client
```

### `vite.config.ts`

Same Vite dep-optimizer caveat as the plain Vite app — alias subpaths to dist files:

```ts
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

import { tanstackRouter } from '@tanstack/router-plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const require = createRequire(import.meta.url)
const sanctumRoot = dirname(require.resolve('sanctum-client/package.json'))

export default defineConfig({
  resolve: {
    alias: [
      { find: /^sanctum-client$/, replacement: resolve(sanctumRoot, 'dist/index.js') },
      { find: /^sanctum-client\/react$/, replacement: resolve(sanctumRoot, 'dist/react/index.js') },
      { find: /^sanctum-client\/fortify$/, replacement: resolve(sanctumRoot, 'dist/fortify/index.js') },
      { find: /^sanctum-client\/tanstack$/, replacement: resolve(sanctumRoot, 'dist/tanstack/index.js') },
    ],
  },
  optimizeDeps: {
    exclude: [
      'sanctum-client',
      'sanctum-client/react',
      'sanctum-client/fortify',
      'sanctum-client/tanstack',
    ],
  },
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), viteReact()],
})
```

### Router setup

```tsx
// src/router.tsx
import { createRouter } from '@tanstack/react-router'
import { createSanctumRouterContext } from 'sanctum-client/tanstack'

import { routeTree } from './routeTree.gen'
import { sanctum } from './sanctum'

export function getRouter() {
  return createRouter({
    routeTree,
    context: createSanctumRouterContext(sanctum),
  })
}
```

```tsx
// src/main.tsx
import { RouterProvider } from '@tanstack/react-router'
import { SanctumProvider } from 'sanctum-client/react'
import { getRouter } from './router'
import { sanctum } from './sanctum'

const router = getRouter()
createRoot(document.getElementById('app')!).render(
  <SanctumProvider client={sanctum}>
    <RouterProvider router={router} />
  </SanctumProvider>,
)
```

### Typed root route

```tsx
// src/routes/__root.tsx
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import type { RouteContextWithSanctum } from 'sanctum-client/tanstack'

import type { AppUser } from '../sanctum'

export const Route = createRootRouteWithContext<RouteContextWithSanctum<AppUser>>()({
  component: () => <Outlet />,
})
```

### Guarded route + loader

```tsx
// src/routes/dashboard.tsx
import { createFileRoute } from '@tanstack/react-router'
import { requireAuthBeforeLoad, sanctumLoader } from 'sanctum-client/tanstack'

import type { AppUser } from '../sanctum'

export const Route = createFileRoute('/dashboard')({
  beforeLoad: ({ context, location }) =>
    requireAuthBeforeLoad<AppUser>({ context, location, options: { loginPath: '/login' } }),
  loader: ({ context }) => sanctumLoader<AppUser>({ context }),
  component: Dashboard,
})

function Dashboard() {
  const { user } = Route.useLoaderData()
  return <pre>{JSON.stringify(user, null, 2)}</pre>
}
```

### TanStack Start (SSR + server functions)

Use `sanctum-client/tanstack/server` inside a `createServerFn(...)`:

```ts
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { bridgeSanctumCookies, getSanctumClient } from 'sanctum-client/tanstack/server'

export const getMe = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest()
  const client = await getSanctumClient({
    baseURL: process.env.LARAVEL_URL!,
    cookie: bridgeSanctumCookies(request, ['laravel_session', 'XSRF-TOKEN']),
  })
  return client.fetchUser()
})
```

---

## Expo

### Install

```sh
pnpm add sanctum-client expo-secure-store
```

### `.env`

```env
EXPO_PUBLIC_API_URL=http://localhost:8000   # iOS Simulator
# EXPO_PUBLIC_API_URL=http://10.0.2.2:8000  # Android Emulator
# EXPO_PUBLIC_API_URL=http://192.168.x.y:8000  # Physical device (LAN IP, run `php artisan serve --host=0.0.0.0`)
```

### Client

```ts
// sanctum.ts
import { createExpoSanctumClient } from 'sanctum-client/expo'

export const sanctum = createExpoSanctumClient({
  baseURL: process.env.EXPO_PUBLIC_API_URL!,
  // Fortify's web /login returns a session cookie which RN cannot store.
  // Point sanctum-client at a custom token-issuing endpoint instead.
  routes: { login: '/api/token/login' },
})
```

### Root layout

```tsx
// app/_layout.tsx
import { Stack } from 'expo-router'
import { SanctumProvider } from 'sanctum-client/react'
import { sanctum } from '../sanctum'

export default function RootLayout() {
  return (
    <SanctumProvider client={sanctum}>
      <Stack />
    </SanctumProvider>
  )
}
```

### Laravel-side caveats for Expo

- **Do NOT** add Expo's origin to `SANCTUM_STATEFUL_DOMAINS`. Sanctum will try CSRF on token-mode requests and 419 them.
- Bind Laravel to `0.0.0.0` for physical device testing: `php artisan serve --host=0.0.0.0 --port=8000`.
- Fortify routes (`/register`, `/forgot-password`, `/two-factor-*`) require sessions + CSRF and won't work over PAT mode. To support them on mobile, expose mirror endpoints under an `auth:sanctum`-guarded API group on the Laravel side.
- `expo-secure-store` doesn't polyfill on Expo web (no Keychain in browsers). Test on a real simulator or device. For web targets, fall back to `localStorageAdapter` from `sanctum-client` and accept the XSS exposure.

---

## Fortify hooks

```tsx
import {
  useRegister,
  useForgotPassword,
  useResetPassword,
  useUpdateProfile,
  useUpdatePassword,
  useConfirmPassword,
  useTwoFactor,
  useTwoFactorChallenge,
} from 'sanctum-client/fortify'
```

All endpoints are configurable via `routes` on `createSanctumClient`. Defaults match a vanilla Sanctum + Fortify install.

**Fortify 2FA requires password confirmation** before enabling. Expected flow:

```ts
await fortify.confirmPassword({ password })   // sets a session flag
await fortify.twoFactor.enable()              // would 423 Locked without the line above
```

---

## TanStack Query integration

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  sanctumQueryOptions,
  useSanctumQuery,
  bindSanctumToQueryClient,
} from 'sanctum-client/react-query'
```

- `useSanctumQuery()` — mirrors the auth user into the query cache
- `bindSanctumToQueryClient(client, queryClient)` — auto-invalidates the user query on `login`, `logout`, `userUpdated`, `sessionExpired`, and cross-tab events

---

## Storage & security

- **Cookie mode** (default for web): the browser owns an `httpOnly` session cookie. No JS-accessible token. CSRF is fetched and propagated automatically.
- **Token mode** on web: `memoryStorage` by default — token lost on refresh but immune to XSS exfiltration. Opt in to `localStorageAdapter` with explicit config; the package logs a one-time XSS-exposure warning in dev.
- **Token mode** on native: `SecureStore` (iOS Keychain / Android Keystore) via `sanctum-client/expo`. Never use `AsyncStorage`.

The gateway helper for Next strips the `Domain` attribute from `Set-Cookie` headers so Laravel cookies don't leak to the wrong host.

---

## Troubleshooting

### `useSanctum: <SanctumProvider> is missing from the tree.`

You have two copies of the `SanctumContext` module due to bundler dedup. Always check:

1. Are you importing `SanctumProvider` AND your hooks from the same subpath? Use `sanctum-client/react` everywhere; don't mix with `sanctum-client/next`/`expo`.
2. For Vite: did you add the `resolve.alias` + `optimizeDeps.exclude` block from the React + Vite section?
3. For Turbopack/Next: this is fixed by always importing the provider and hooks from `sanctum-client/react`.

### `419 (CSRF token mismatch)` on `/login`

Almost always one of:

- The browser tab origin is **not** in `SANCTUM_STATEFUL_DOMAINS`. (Tab hostname + port must match exactly — `localhost:3000` and `127.0.0.1:3000` are different.)
- The browser tab and Laravel are on different hosts (e.g. `localhost:5173` → `127.0.0.1:8000`). Pick one hostname for both.
- `SESSION_SAME_SITE` is `strict`. Use `lax` for dev.

### `401 Unauthorized` on `/api/user` after a fresh login

- `supports_credentials: true` is missing from `config/cors.php`.
- Your client isn't sending `credentials: 'include'` (it does by default in cookie mode — check that you're not overriding `withCredentials: false`).
- The browser silently dropped the `Set-Cookie` due to `SameSite=None` + non-HTTPS. Use `lax` + `Secure=false` for HTTP localhost.

### `423 Locked` on `/user/two-factor-authentication`

Fortify requires password re-confirmation before enabling 2FA. Call `useConfirmPassword().mutate({ password })` first.

### Next.js: "Cannot read properties of null" during static prerender

Your layout reads cookies and Next is trying to SSG the page. Add `export const dynamic = 'force-dynamic'` to the layout.

### Expo: `ExpoSecureStore.default.setValueWithKeyAsync is not a function`

`expo-secure-store` does not work on Expo web. Test on a real simulator/device, or use `localStorageAdapter` on the web target (XSS-exposed).

---

## License

MIT

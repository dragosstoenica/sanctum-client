import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'react/index': 'src/react/index.ts',
    'fortify/index': 'src/fortify/index.ts',
    'react-query/index': 'src/react-query/index.ts',
    'next/index': 'src/next/index.ts',
    'next/server': 'src/next/server.ts',
    'next/proxy': 'src/next/proxy.ts',
    'next/gateway': 'src/next/gateway.ts',
    'next/actions': 'src/next/actions.ts',
    'expo/index': 'src/expo/index.ts',
    'tanstack/index': 'src/tanstack/index.ts',
    'tanstack/server': 'src/tanstack/server.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  tsconfig: 'tsconfig.build.json',
  // Splitting off — Fortify / React-Query / TanStack import `useSanctum` etc
  // via the package's public subpath (`sanctum-client/react`). tsup leaves
  // those self-imports as externals (see below), so the consumer's bundler
  // resolves them once and dedupes module identity. With `splitting: true`
  // some bundlers (Vite's dep optimizer in particular) still inlined private
  // chunks per-subpath, producing duplicate SanctumContext instances.
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: [
    'react',
    'react-dom',
    'next',
    'next/headers',
    'next/server',
    'server-only',
    'client-only',
    '@tanstack/react-query',
    '@tanstack/react-router',
    '@tanstack/react-start',
    'expo-router',
    'expo-secure-store',
    // Self-references: subpaths import shared hooks from the public package
    // path rather than relative paths. Mark them external so tsup doesn't
    // inline a second copy of the context module.
    'sanctum-client',
    'sanctum-client/react',
  ],
})

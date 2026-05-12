import { resolve } from 'node:path'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      // `server-only` and `client-only` are Next.js virtual markers; in tests
      // we stub them with empty modules.
      'server-only': resolve(__dirname, 'tests/stubs/server-only.ts'),
      'client-only': resolve(__dirname, 'tests/stubs/client-only.ts'),
      // Self-imports: subpaths use the public package path so consumer bundlers
      // dedupe module identity. In tests we redirect those back to src so the
      // running test code and the package code share the same context module.
      'sanctum-client/react': resolve(__dirname, 'src/react/index.ts'),
      'sanctum-client': resolve(__dirname, 'src/index.ts'),
    },
  },
  test: {
    environment: 'happy-dom',
    globals: false,
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/types.ts'],
      reporter: ['text', 'html'],
    },
  },
})

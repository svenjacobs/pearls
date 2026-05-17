/**
 * Vitest config for repository integration tests.
 *
 * Requires a running Redis instance via Docker (testcontainers).
 * Run with: pnpm test:integration
 */
import { mergeConfig } from 'vite'
import { defineConfig } from 'vitest/config'

import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['src/**/*.integration.test.ts'],
      globalSetup: ['src/lib/test/redis-setup.ts'],
      setupFiles: ['src/lib/test/redis-flush.ts'],
      testTimeout: 60_000, // container startup can be slow on first pull
      // Run all integration test files serially in a single worker to prevent
      // concurrent FLUSHALL calls from interfering with tests in other files.
      maxWorkers: 1,
      isolate: false,
      fileParallelism: false,
    },
  }),
)

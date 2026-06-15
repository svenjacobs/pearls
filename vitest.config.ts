import { svelteTesting } from '@testing-library/svelte/vite'
import { mergeConfig } from 'vite'
import { defineConfig } from 'vitest/config'

import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    // Compiles Svelte components in browser/client mode and auto-unmounts them
    // after each test, so component tests can render and assert on the DOM.
    plugins: [svelteTesting()],
    test: {
      include: ['src/**/*.test.ts'],
      exclude: ['src/**/*.integration.test.ts', '**/node_modules/**'],
    },
  }),
)

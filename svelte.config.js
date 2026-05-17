import adapter from '@sveltejs/adapter-node'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Consult https://svelte.dev/docs/kit/integrations
  // for more information about preprocessors
  preprocess: vitePreprocess(),

  kit: {
    files: {
      serviceWorker: 'src/service-worker.ts',
    },
    adapter: adapter({
      host: '0.0.0.0',
      port: 3000,
    }),
    serviceWorker: {
      register: false,
    },
  },
}

export default config

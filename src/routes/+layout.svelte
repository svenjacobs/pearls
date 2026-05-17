<script lang="ts">
  import { pwaInfo } from 'virtual:pwa-info'

  import { browser } from '$app/environment'
  import { onNavigate } from '$app/navigation'
  import favicon from '$lib/assets/favicon.svg'
  import { getTheme } from '$lib/storage'

  const webManifestLink = pwaInfo?.webManifest.linkTag ?? ''

  let { children } = $props()
  import '../app.css'

  // Keep the dark class in sync when the OS color scheme changes. Only acts
  // when the user's theme preference is 'system'; explicit light/dark choices
  // are unaffected. Registered once for the lifetime of the app.
  $effect(() => {
    if (!browser) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onchange = (e: MediaQueryListEvent) => {
      if (getTheme() === 'system') document.documentElement.classList.toggle('dark', e.matches)
    }
    mq.addEventListener('change', onchange)
    return () => mq.removeEventListener('change', onchange)
  })

  // Progressive enhancement: use the View Transitions API when available
  // for a subtle cross-fade between routes.
  onNavigate((navigation) => {
    if (!document.startViewTransition) return
    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve()
        await navigation.complete
      })
    })
  })
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- trusted build-time value from vite-plugin-pwa virtual module -->
  {@html webManifestLink}
</svelte:head>

{@render children()}

<!--
  InstallPrompt — dismissible info box shown on the start route when the app is
  running in a browser tab (not installed as a PWA). Offers a native install
  button where supported, otherwise explains how to install manually (iOS/Safari).
  Dismissal is persisted in localStorage ("don't show again").
-->
<script lang="ts">
  import { browser } from '$app/environment'
  import Button from '$lib/components/Button.svelte'
  import { installPrompt } from '$lib/installPrompt.svelte'
  import * as m from '$lib/paraglide/messages.js'
  import { getInstallPromptDismissed, setInstallPromptDismissed } from '$lib/storage'

  // True when the app is already running as an installed PWA.
  const isStandalone = (): boolean => {
    if (!browser) return false
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS Safari exposes navigator.standalone instead of the display-mode query.
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    )
  }

  // iOS / iPadOS, where installation is manual via Share → Add to Home Screen.
  const isIos = (): boolean => {
    if (!browser) return false
    const ua = navigator.userAgent
    return (
      /iphone|ipad|ipod/i.test(ua) ||
      // iPadOS 13+ reports as "Macintosh" but is touch-capable.
      (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
    )
  }

  const ios = isIos()

  // Hidden during SSR (no localStorage / matchMedia); resolves to the real state
  // on the client, which also avoids a flash of the box during hydration.
  // Writable: dismissing overrides the computed value for the rest of the session.
  let dismissed = $derived(!browser || getInstallPromptDismissed() || isStandalone())

  const visible = $derived(!dismissed && !installPrompt.installed)

  const close = () => {
    dismissed = true
    setInstallPromptDismissed()
  }

  const install = async () => {
    const outcome = await installPrompt.prompt()
    if (outcome === 'accepted') close()
  }

  // iOS instructions inline the Share icon via the sentinel pattern.
  const iosParts = $derived(m.home_install_ios({ icon: '|||' }).split('|||') as [string, string])
</script>

{#if visible}
  <!-- pt-16 on mobile clears the page-anchored theme switch (top-right); on sm+ the
       box is narrow and centered, so it sits clear of the corner control. -->
  <div class="px-4 pt-16 sm:pt-4">
    <div
      class="relative mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 pr-12 text-left shadow-sm dark:border-amber-900/50 dark:bg-amber-950/30"
    >
      <span
        class="iconify heroicons--arrow-down-tray-20-solid mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400"
      ></span>
      <div class="flex min-w-0 flex-col gap-2">
        <p class="text-sm font-semibold text-amber-900 dark:text-amber-200">
          {m.home_install_title()}
        </p>
        {#if installPrompt.canInstall}
          <p class="text-sm text-amber-800 dark:text-amber-300/90">
            {m.home_install_description()}
          </p>
          <Button
            onclick={install}
            class="mt-1 min-h-11 self-center rounded-lg px-4 py-2 text-sm font-semibold"
          >
            <span class="iconify heroicons--arrow-down-tray-20-solid mr-1.5 size-4"></span>
            {m.action_install()}
          </Button>
        {:else if ios}
          <p class="text-sm text-amber-800 dark:text-amber-300/90">
            {iosParts[0]}<span
              class="iconify heroicons--arrow-up-on-square-20-solid mx-0.5 inline-block size-4 align-text-bottom"
            ></span>{iosParts[1]}
          </p>
        {:else}
          <p class="text-sm text-amber-800 dark:text-amber-300/90">
            {m.home_install_generic()}
          </p>
        {/if}
      </div>
      <button
        type="button"
        onclick={close}
        aria-label={m.nav_close()}
        class="absolute top-2 right-2 flex size-8 items-center justify-center rounded-full text-amber-700/70 transition-colors hover:bg-amber-100 hover:text-amber-900 active:scale-95 dark:text-amber-300/70 dark:hover:bg-amber-900/40 dark:hover:text-amber-100"
      >
        <span class="iconify heroicons--x-mark-20-solid size-5"></span>
      </button>
    </div>
  </div>
{/if}

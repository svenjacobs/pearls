<script lang="ts">
  import { resolve } from '$app/paths'
  import Button from '$lib/components/Button.svelte'
  import Footer from '$lib/components/Footer.svelte'
  import ThemeSwitch from '$lib/components/ThemeSwitch.svelte'
  import * as m from '$lib/paraglide/messages.js'

  import type { ActionData, PageData } from './$types'

  let { form, data }: { form: ActionData; data: PageData } = $props()

  // Blend hex color towards white (amount 0–1).
  const lighten = (hex: string, amount: number): string => {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    const mix = (c: number) =>
      Math.round(c + (255 - c) * amount)
        .toString(16)
        .padStart(2, '0')
    return `#${mix(r)}${mix(g)}${mix(b)}`
  }

  // Blend hex color towards black (amount 0–1).
  const darken = (hex: string, amount: number): string => {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    const mix = (c: number) =>
      Math.round(c * (1 - amount))
        .toString(16)
        .padStart(2, '0')
    return `#${mix(r)}${mix(g)}${mix(b)}`
  }

  const pearlHighlight = $derived(lighten(data.pearlColor, 0.6))
  const pearlShadow = $derived(darken(data.pearlColor, 0.3))

  const activeGamesLabel = $derived(
    data.activeGameCount === 1
      ? m.home_active_game()
      : m.home_active_games({ count: data.activeGameCount }),
  )
</script>

<svelte:head>
  <title>Pearls</title>
</svelte:head>

<div class="flex min-h-svh flex-col">
  <main class="relative flex flex-1 flex-col items-center justify-center gap-12 px-6 py-8 sm:py-16">
    <div class="absolute top-4 right-4">
      <ThemeSwitch
        class="border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900 active:scale-[0.97] dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
      />
    </div>
    <!-- Decorative pearl -->
    <div class="relative">
      <svg
        class="size-20 drop-shadow-lg sm:size-24"
        viewBox="0 0 96 96"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="pearl-g" cx="40%" cy="38%" r="50%">
            <stop offset="0%" stop-color={pearlHighlight} />
            <stop offset="55%" stop-color={data.pearlColor} />
            <stop offset="100%" stop-color={pearlShadow} />
          </radialGradient>
          <radialGradient id="pearl-h" cx="35%" cy="30%" r="28%">
            <stop offset="0%" stop-color="#fff" stop-opacity="0.85" />
            <stop offset="100%" stop-color="#fff" stop-opacity="0" />
          </radialGradient>
        </defs>
        <circle cx="48" cy="48" r="42" fill="url(#pearl-g)" />
        <circle cx="48" cy="48" r="42" fill="url(#pearl-h)" />
        <circle cx="36" cy="36" r="10" fill="#fff" fill-opacity="0.4" />
      </svg>
    </div>

    <!-- Title -->
    <div class="flex flex-col items-center gap-3 text-center">
      <h1
        class="font-display text-6xl font-black tracking-tight text-gray-900 sm:text-7xl dark:text-white"
      >
        Pearls
      </h1>
      <p class="max-w-xs text-base text-gray-500 sm:text-lg dark:text-gray-400">
        {m.home_tagline()}
      </p>
    </div>

    <div class="flex w-full max-w-xs flex-col items-center gap-6">
      <!-- New game -->
      <Button
        href={resolve('/new')}
        class="min-h-11 w-full rounded-xl px-8 py-3 text-base font-bold"
      >
        {m.action_new_game()}
      </Button>

      {#if data.activeGameCount > 0}
        <Button
          href={resolve('/games')}
          variant="ghost"
          class="min-h-11 w-full rounded-xl px-8 py-3 text-base font-medium"
        >
          {activeGamesLabel}
        </Button>
      {/if}

      <!-- Divider -->
      <div class="flex w-full items-center gap-3">
        <div
          class="h-px flex-1 bg-linear-to-r from-transparent via-gray-300 to-transparent dark:via-gray-600"
        ></div>
        <span class="text-xs font-medium text-gray-400 dark:text-gray-500"
          >{m.home_or_enter_code()}</span
        >
        <div
          class="h-px flex-1 bg-linear-to-r from-transparent via-gray-300 to-transparent dark:via-gray-600"
        ></div>
      </div>

      <!-- Join with code -->
      <form method="POST" action="?/join" class="flex w-full flex-col gap-3">
        <div class="flex gap-2">
          <input
            name="code"
            type="text"
            placeholder={m.form_game_code_placeholder()}
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
            maxlength="8"
            class="min-h-11 min-w-0 flex-1 rounded-xl bg-gray-100 px-4 py-2 font-mono text-sm tracking-widest text-gray-900 uppercase placeholder-gray-400 transition-colors outline-none hover:bg-gray-200 focus:ring-2 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500 dark:hover:bg-gray-700 {form?.missingCode
              ? 'ring-2 ring-red-500 focus:ring-red-500'
              : 'focus:ring-amber-500'}"
          />
          <Button
            type="submit"
            variant="ghost"
            class="min-h-11 rounded-xl px-4 py-2 text-sm font-medium hover:border-amber-500 hover:bg-transparent hover:text-amber-600 dark:hover:border-amber-400 dark:hover:bg-transparent dark:hover:text-amber-400"
          >
            {m.action_join()}
          </Button>
        </div>

        {#if form?.missingCode}
          <p class="flex items-center gap-1 text-xs text-red-500 dark:text-red-400">
            <span class="iconify heroicons--exclamation-circle-16-solid size-3.5 shrink-0"></span>
            {m.form_enter_game_code()}
          </p>
        {/if}
      </form>
    </div>

    <!-- Rules link -->
    <a
      href={resolve('/rules')}
      class="inline-flex items-center gap-1.5 text-sm text-gray-400 transition-colors hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300"
    >
      <span class="iconify heroicons--book-open-20-solid size-4"></span>
      {m.action_how_to_play()}
    </a>
  </main>
  <Footer />
</div>

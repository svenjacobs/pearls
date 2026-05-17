<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import * as m from '$lib/paraglide/messages.js'

  const STATUS_META: Record<number, { heading: () => string; detail: () => string }> = {
    404: {
      heading: m.error_404_heading,
      detail: m.error_404_detail,
    },
    403: {
      heading: m.error_403_heading,
      detail: m.error_403_detail,
    },
    500: {
      heading: m.error_500_heading,
      detail: m.error_500_detail,
    },
  }

  const meta = $derived(
    STATUS_META[page.status] ?? {
      heading: m.error_generic_heading,
      detail: () => page.error?.message ?? '',
    },
  )
</script>

<svelte:head>
  <title>{page.status} · Pearls</title>
</svelte:head>

<main class="flex min-h-svh flex-col items-center justify-center px-6 py-16">
  <div class="flex w-full max-w-sm flex-col items-center gap-6 text-center">
    <!-- Status code -->
    <p
      class="font-display text-8xl font-black tracking-tight text-amber-500 sm:text-9xl dark:text-amber-400"
    >
      {page.status}
    </p>

    <!-- Icon -->
    <span
      class="iconify heroicons--exclamation-circle-20-solid size-16 text-gray-300 dark:text-gray-600"
      aria-hidden="true"
    ></span>

    <!-- Heading + detail -->
    <div class="flex flex-col gap-2">
      <h1 class="font-display text-2xl font-bold text-gray-900 dark:text-white">
        {meta.heading()}
      </h1>
      <p class="text-sm leading-relaxed text-gray-500 dark:text-gray-400">{meta.detail()}</p>
    </div>

    <!-- Home link -->
    <a
      href={resolve('/')}
      class="mt-2 inline-flex items-center gap-1.5 text-sm text-gray-400 transition-colors hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300"
    >
      <span class="iconify heroicons--arrow-left-20-solid size-4"></span>
      {m.nav_back_to_home()}
    </a>
  </div>
</main>

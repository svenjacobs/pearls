<script lang="ts">
  import { invalidateAll } from '$app/navigation'
  import { resolve } from '$app/paths'
  import Button from '$lib/components/Button.svelte'
  import CloseButton from '$lib/components/CloseButton.svelte'
  import * as m from '$lib/paraglide/messages.js'

  import type { PageData } from './$types'
  import GameOverviewCard from './GameOverviewCard.svelte'

  let { data }: { data: PageData } = $props()

  // Refresh overview every 10 s to pick up external changes.
  $effect(() => {
    const id = setInterval(() => void invalidateAll(), 10_000)
    return () => clearInterval(id)
  })
</script>

<svelte:head>
  <title>Pearls — {m.games_heading()}</title>
</svelte:head>

<main class="flex min-h-svh flex-col items-center gap-8 p-6 py-10">
  <div class="flex w-full max-w-5xl items-center justify-between">
    <h1 class="text-lg font-semibold text-gray-900 dark:text-white">{m.games_heading()}</h1>
    <CloseButton />
  </div>

  <!-- New game — top-centered, styled like the root route button -->
  <div class="flex w-full max-w-xs flex-col items-center">
    <Button href={resolve('/new')} class="min-h-11 w-full rounded-xl px-8 py-3 text-base font-bold">
      {m.action_new_game()}
    </Button>
  </div>

  {#if data.games.length === 0}
    <div class="flex flex-1 flex-col items-center justify-center gap-3">
      <span class="iconify heroicons--face-frown size-12 text-gray-300 dark:text-gray-600"></span>
      <p class="text-sm text-gray-400 dark:text-gray-500">{m.games_empty()}</p>
    </div>
  {:else}
    <div class="flex flex-wrap justify-center gap-6">
      {#each data.games as game (game.sessionId)}
        <GameOverviewCard {game} />
      {/each}
    </div>
  {/if}
</main>

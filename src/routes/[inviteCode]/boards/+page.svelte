<script lang="ts">
  import { debounce } from 'es-toolkit'

  import { invalidateAll } from '$app/navigation'
  import CloseButton from '$lib/components/CloseButton.svelte'
  import ReconnectingBanner from '$lib/components/ReconnectingBanner.svelte'
  import { formatDuration } from '$lib/duration'
  import * as m from '$lib/paraglide/messages.js'
  import { getThemeColors } from '$lib/pearl-themes'
  import { connectSse } from '$lib/sse'

  import type { PageData } from './$types'
  import PlayerBoardCard from './PlayerBoardCard.svelte'

  let { data }: { data: PageData } = $props()

  // Collapse bursts of refresh events into a single refetch.
  const refresh = debounce(() => void invalidateAll(), 80, { edges: ['leading', 'trailing'] })

  let connected = $state(true)

  $effect(() =>
    connectSse('/api/game/events', {
      onRefresh: refresh,
      onConnectionChange: (c) => (connected = c),
    }),
  )

  let elapsed = $state(0)

  $effect(() => {
    elapsed = Math.floor((Date.now() - data.gameStartedAt) / 1_000)
    const id = setInterval(() => {
      elapsed = Math.floor((Date.now() - data.gameStartedAt) / 1_000)
    }, 1_000)
    return () => clearInterval(id)
  })
</script>

<ReconnectingBanner show={!connected} />

<main class="flex min-h-svh flex-col items-center gap-8 p-6 py-10">
  <div class="flex w-full max-w-5xl items-center justify-between">
    <div class="flex flex-col gap-0.5">
      <h1 class="text-lg font-semibold text-gray-900 dark:text-white">{m.boards_heading()}</h1>
      <p class="font-mono text-sm text-gray-500 dark:text-gray-400">{formatDuration(elapsed)}</p>
    </div>
    <CloseButton />
  </div>

  <div class="flex flex-wrap justify-center gap-10">
    {#each data.playerBoards as { player, board, score } (player.id)}
      <PlayerBoardCard
        name={player.name}
        isAI={player.isAI}
        {board}
        {score}
        isCurrentPlayer={player.id === data.currentPlayerId}
        isActiveTurn={player.id === data.activeTurnPlayerId}
        lockedTarget={player.id === data.activeTurnPlayerId ? data.lockedTarget : null}
        colors={[...getThemeColors(player.pearlTheme)]}
      />
    {/each}
  </div>
</main>

<script lang="ts">
  import { invalidateAll } from '$app/navigation'
  import CloseButton from '$lib/components/CloseButton.svelte'
  import Footer from '$lib/components/Footer.svelte'
  import * as m from '$lib/paraglide/messages.js'
  import { connectSse } from '$lib/sse'

  import type { PageData } from './$types'
  import StatCard from './StatCard.svelte'

  let { data }: { data: PageData } = $props()

  $effect(() => connectSse('/api/status/events', () => void invalidateAll()))
</script>

<svelte:head>
  <title>Pearls — {m.status_title()}</title>
</svelte:head>

<div class="flex min-h-svh flex-col">
  <main class="relative flex flex-1 flex-col items-center justify-center gap-6 p-6 py-10">
    <div class="absolute top-6 right-6">
      <CloseButton />
    </div>

    <div class="flex flex-wrap justify-center gap-6">
      <StatCard
        value={data.stats.activeGames}
        label={data.stats.activeGames === 1 ? m.status_active_game() : m.status_active_games()}
      />
      <StatCard
        value={data.stats.activeHumanPlayers}
        label={data.stats.activeHumanPlayers === 1
          ? m.status_active_player()
          : m.status_active_players()}
      />
    </div>
  </main>

  <Footer />
</div>

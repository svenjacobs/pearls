<!--
  GameOverviewCard — summary card for one active game on the /games overview route.
  Clicking the card navigates to the game board (same as the join action). The leave
  button is isolated via stopPropagation so it does not trigger card navigation.
  Shows participant names, a muted board preview, current score, and elapsed runtime
  (live timer while the game is in progress, "waiting" label otherwise).
-->
<script lang="ts">
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import { GameBoard } from '$lib'
  import LeaveGameButton from '$lib/components/LeaveGameButton.svelte'
  import { formatDuration } from '$lib/duration'
  import * as m from '$lib/paraglide/messages.js'
  import { getThemeColors } from '$lib/pearlThemes'

  import type { ActiveGameEntry } from './+page.server'

  let { game }: { game: ActiveGameEntry } = $props()

  let elapsed = $state(0)

  $effect(() => {
    if (game.startedAt == null) return
    elapsed = Math.floor((Date.now() - game.startedAt) / 1_000)
    const id = setInterval(() => {
      elapsed = Math.floor((Date.now() - (game.startedAt ?? 0)) / 1_000)
    }, 1_000)
    return () => clearInterval(id)
  })

  const colors = $derived([...getThemeColors(game.player.pearlTheme)])

  const gameHref = $derived(resolve('/[inviteCode]', { inviteCode: game.inviteCode }))
</script>

<div
  role="link"
  tabindex="0"
  onclick={() => void goto(gameHref)}
  onkeydown={(e) => e.key === 'Enter' && void goto(gameHref)}
  class="flex w-80 cursor-pointer flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-amber-300 hover:bg-amber-50 hover:shadow-md hover:shadow-amber-600/10 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-amber-700/60 dark:hover:bg-amber-900/20 dark:hover:shadow-amber-900/20"
>
  <!-- Participants -->
  <div class="flex flex-col gap-0.5">
    <p class="text-xs font-medium tracking-wide text-gray-400 uppercase dark:text-gray-500">
      {m.games_participants()}
    </p>
    <p class="truncate text-sm font-semibold text-gray-900 dark:text-white">
      {game.playerNames.join(', ')}
    </p>
  </div>

  <!-- Board -->
  <GameBoard board={game.board} {colors} muted class="w-full" />

  <!-- Score + runtime -->
  <div class="flex flex-col gap-0.5 text-sm">
    <span class="font-semibold text-gray-900 dark:text-white">
      {game.score === 1 ? m.boards_point() : m.boards_points({ score: game.score })}
    </span>
    {#if game.startedAt != null}
      <span class="font-mono text-xs text-gray-500 dark:text-gray-400"
        >{formatDuration(elapsed)}</span
      >
    {:else}
      <span class="text-xs text-gray-400 dark:text-gray-500">{m.game_status_waiting()}</span>
    {/if}
  </div>

  <!-- Actions — stop propagation so card click doesn't fire when interacting with leave flow -->
  <div role="none" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
    <LeaveGameButton
      action="?/leave"
      sessionId={game.sessionId}
      buttonTitle={m.action_leave_game()}
    />
  </div>
</div>

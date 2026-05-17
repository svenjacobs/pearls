<!--
  InitiativeBoard — shows all players' initiative dice in the waiting lobby.
  Each player sees a die face and a Roll button when it's their turn.
  Updates in real-time via the parent's SSE-triggered invalidateAll().
-->
<script lang="ts">
  import { untrack } from 'svelte'

  import Button from '$lib/components/Button.svelte'
  import Die from '$lib/components/game_assets/dice/Die.svelte'
  import { notification } from '$lib/notification.svelte'
  import * as m from '$lib/paraglide/messages'
  import { playerDisplayName } from '$lib/playerName'
  import type { GameInitiative } from '$lib/server/repository/types'
  import type { Player } from '$lib/server/repository/types'

  type Props = {
    initiative: GameInitiative
    /** All players in the game, in join order. */
    players: Player[]
    /** The current viewer's player ID — determines who sees the Roll button. */
    currentPlayerId: string
    /** When true, hide interactive controls (remove button). */
    isSpectator?: boolean
  }

  let { initiative, players, currentPlayerId, isSpectator = false }: Props = $props()

  let rolling = $state(false)

  const sortedPlayers = $derived(
    initiative.playerOrder
      ? initiative.playerOrder.map((id) => players.find((p) => p.id === id)!).filter(Boolean)
      : players,
  )

  const myRoll = $derived(initiative.rolls[currentPlayerId])
  const canRoll = $derived(
    !rolling &&
      initiative.playerOrder === null &&
      initiative.activePlayerIds.includes(currentPlayerId) &&
      (myRoll?.value ?? 0) === 0,
  )

  let prevRound = untrack(() => initiative.round)
  $effect(() => {
    const round = initiative.round
    if (round > prevRound && initiative.playerOrder === null) {
      const mustReroll = initiative.activePlayerIds.includes(currentPlayerId)
      notification.notify(
        mustReroll ? m.initiative_tie_must_reroll() : m.initiative_tie_waiting_reroll(),
        'info',
      )
    }
    prevRound = round
  })

  const rollDie = async () => {
    if (!canRoll) return
    rolling = true
    try {
      await fetch('/api/game/initiative/roll', { method: 'POST' })
    } finally {
      rolling = false
    }
  }
</script>

<div class="mt-4">
  <p
    class="mb-3 text-center text-xs font-semibold tracking-wider text-gray-400 uppercase dark:text-gray-500"
  >
    {m.initiative_heading()}
  </p>

  <div class="flex flex-col gap-2">
    {#each sortedPlayers as player, index (player.id)}
      {@const roll = initiative.rolls[player.id]}
      {@const isMe = player.id === currentPlayerId}
      {@const isActive = initiative.activePlayerIds.includes(player.id)}
      {@const needsRoll = isMe && isActive && (roll?.value ?? 0) === 0}
      {@const position = initiative.playerOrder ? index + 1 : null}

      <div
        class="flex items-center gap-3 rounded-xl border px-3 py-2 {roll?.locked
          ? 'border-gray-200 bg-gray-50 dark:border-gray-700/60 dark:bg-gray-800/40'
          : isActive
            ? 'border-amber-200 bg-amber-50 dark:border-amber-700/40 dark:bg-amber-900/20'
            : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900'}"
      >
        <!-- Position badge + die -->
        <div class="flex shrink-0 items-center gap-1.5">
          {#if position}
            <div
              class="flex size-6 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
            >
              {position}
            </div>
          {/if}
          <div
            class="size-9"
            aria-label={roll?.value
              ? m.a11y_initiative_die({ value: roll.value, name: playerDisplayName(player) })
              : m.a11y_initiative_die_unrolled({ name: playerDisplayName(player) })}
            role="img"
          >
            <Die value={roll?.value ?? 0} />
          </div>
        </div>

        <!-- Name + status -->
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium text-gray-900 dark:text-white">
            {player.name}{#if player.isAI}
              <span title={m.a11y_ai_player()}>🤖</span>{/if}
          </p>
          {#if roll?.locked}
            <p class="text-xs text-gray-400 dark:text-gray-500">
              {roll.round > 1
                ? m.initiative_round({ round: roll.round }) + ' · '
                : ''}{m.initiative_locked()}
            </p>
          {:else if isActive && (roll?.value ?? 0) > 0}
            <p class="text-xs text-amber-600 dark:text-amber-400">
              {m.initiative_waiting_for_rolls()}
            </p>
          {:else if isActive}
            <p class="text-xs text-amber-600 dark:text-amber-400">
              {initiative.round > 1 ? m.initiative_round({ round: initiative.round }) : ''}
            </p>
          {/if}
        </div>

        <!-- Roll button (only for the current player when it's their turn) -->
        {#if needsRoll}
          <Button
            type="button"
            disabled={rolling}
            onclick={rollDie}
            class="min-h-11 w-24 shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold"
          >
            {m.initiative_roll_die()}
          </Button>
        {:else if !isSpectator && player.isAI}
          <form method="POST" action="?/removeAi">
            <input type="hidden" name="aiPlayerId" value={player.id} />
            <Button
              type="submit"
              class="min-h-11 w-24 shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 active:scale-[0.97]"
            >
              {m.action_remove_ai()}
            </Button>
          </form>
        {:else if !isActive && !roll?.locked}
          <!-- Spinner for other players who haven't rolled yet in current round -->
          <div
            class="size-5 shrink-0 animate-spin rounded-full border-2 border-gray-200 border-t-amber-500 dark:border-gray-700 dark:border-t-amber-400"
          ></div>
        {/if}
      </div>
    {/each}
  </div>

  {#if initiative.playerOrder}
    <p class="mt-3 text-center text-sm font-medium text-green-600 dark:text-green-400">
      {m.initiative_complete()}
    </p>
  {/if}
</div>

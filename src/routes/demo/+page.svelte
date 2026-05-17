<script lang="ts">
  import { delay } from 'es-toolkit'
  import { untrack } from 'svelte'

  import type { DieModel, DieStatus } from '$lib'
  import { DiceRoller, GameBoard } from '$lib'
  import {
    playBust,
    playDiceShake,
    playDieLand,
    playDieSelect,
    playIllegalSelection,
    playLose,
    playPearlDrop,
    playRowClear,
    playVictory,
  } from '$lib/audio.js'
  import Notification from '$lib/components/Notification.svelte'
  import { notification } from '$lib/notification.svelte'
  import { REACTION_TYPES, REACTIONS, type ReactionType } from '$lib/reactions'

  import ReactionFab from '../[inviteCode]/ReactionFab.svelte'
  import type { FloatingReaction } from '../[inviteCode]/ReactionOverlay.svelte'
  import ReactionOverlay from '../[inviteCode]/ReactionOverlay.svelte'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()
  let aiCount = $state(untrack(() => data.minPlayers))

  const sounds: { label: string; fn: () => void }[] = [
    { label: 'playDiceShake', fn: playDiceShake },
    { label: 'playDieLand', fn: playDieLand },
    { label: 'playDieSelect', fn: playDieSelect },
    { label: 'playPearlDrop', fn: playPearlDrop },
    { label: 'playRowClear', fn: playRowClear },
    { label: 'playIllegalSelection', fn: playIllegalSelection },
    { label: 'playBust', fn: playBust },
    { label: 'playLose', fn: playLose },
    { label: 'playVictory', fn: playVictory },
  ]

  // ── GameBoard demo ────────────────────────────────────────────────────────
  let demoBoard = $state<number[]>(Array(12).fill(7))
  let demoStaged = $state<number[]>(Array(12).fill(0))

  const ROW_INDICES = Array.from({ length: 12 }, (_, i) => i)

  const stagePearl = (i: number) => {
    if (demoStaged[i] < demoBoard[i]) demoStaged[i]++
  }

  const commitRow = (i: number) => {
    demoBoard[i] = Math.max(0, demoBoard[i] - demoStaged[i])
    demoStaged[i] = 0
  }

  const resetBoard = () => {
    demoBoard = Array(12).fill(7)
    demoStaged = Array(12).fill(0)
  }

  // ── Reactions demo ────────────────────────────────────────────────────────
  let demoReactions = $state<FloatingReaction[]>([])

  const fireReaction = (type: ReactionType) => {
    const id = crypto.randomUUID()
    const left = 10 + Math.random() * 75
    demoReactions = [...demoReactions, { id, emoji: REACTIONS[type], left }]
    setTimeout(() => {
      demoReactions = demoReactions.filter((r) => r.id !== id)
    }, 3_500)
  }

  // ── DiceRoller demo ───────────────────────────────────────────────────────
  const makeDice = (): DieModel[] =>
    Array(6)
      .fill(null)
      .map(() => ({ value: 0, status: 'in_cup' as DieStatus }))

  let dice = $state<DieModel[]>(makeDice())
  let diceShaking = $state(false)
  let nextPairId = $state(0)

  const canShake = $derived(!diceShaking && dice.some((d) => d.status !== 'spent'))

  const handleShake = async () => {
    if (!canShake) return
    diceShaking = true

    // Return any leftover active dice to the cup before rolling
    dice = dice.map((d) => (d.status === 'active' ? { ...d, status: 'in_cup' as DieStatus } : d))

    await delay(700)

    const inCupCount = dice.filter((d) => d.status === 'in_cup').length
    // Demo is purely client-side — randomness here doesn't drive any
    // authoritative game state, so Math.random is fine.
    const newValues = Array.from({ length: inCupCount }, () => Math.ceil(Math.random() * 6))

    let idx = 0
    dice = dice.map((d) =>
      d.status === 'in_cup' ? { ...d, value: newValues[idx++], status: 'active' as DieStatus } : d,
    )
    diceShaking = false
  }

  /** Spend one active die as a singleton (target 1–6). */
  const spendSingle = (i: number) => {
    dice = dice.map((d, idx) => (idx === i ? { ...d, status: 'spent' as DieStatus } : d))
  }

  /** Spend two active dice as a pair (target 7–12). */
  const spendPair = (i: number, j: number) => {
    const pairId = nextPairId++
    dice = dice.map((d, idx) =>
      idx === i || idx === j ? { ...d, status: 'spent' as DieStatus, pairId } : d,
    )
  }

  const activeDiceIndices = $derived(
    dice.map((d, i) => (d.status === 'active' ? i : -1)).filter((i) => i >= 0),
  )

  const resetDice = () => {
    dice = makeDice()
    nextPairId = 0
  }
</script>

<main class="flex min-h-screen flex-col items-center gap-12 p-8 py-16">
  <h1 class="font-display text-3xl font-bold tracking-wide text-gray-900 dark:text-white">
    Pearls
  </h1>

  <div class="flex w-full max-w-lg flex-col items-center gap-16">
    <!-- ── AI Game Spectator ──────────────────────────────────────────────── -->
    <div class="flex w-full flex-col gap-3">
      <h2 class="text-sm font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
        Watch AI Game
      </h2>
      <p class="text-xs text-gray-400 dark:text-gray-500">
        Starts a game with AI-only players and opens it in spectator mode.
      </p>
      <form method="POST" action="?/watchAiGame" class="flex items-center gap-3">
        <label class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <span>Players</span>
          <input
            type="number"
            name="count"
            min={data.minPlayers}
            max={data.maxPlayers}
            bind:value={aiCount}
            class="w-16 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-center text-sm font-medium text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          />
        </label>
        <button
          type="submit"
          class="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-500 active:scale-[0.97]"
        >
          🤖 Watch
        </button>
      </form>
    </div>

    <!-- ── Sounds ────────────────────────────────────────────────────────────── -->
    <div class="flex w-full flex-col gap-3">
      <h2 class="text-sm font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
        Sounds
      </h2>
      <div class="flex flex-wrap gap-2">
        {#each sounds as { label, fn } (label)}
          <button
            onclick={fn}
            class="rounded-lg bg-gray-200 px-3 py-1.5 font-mono text-xs font-medium text-gray-700 transition-colors hover:bg-gray-300 active:scale-[0.97] dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          >
            {label}
          </button>
        {/each}
      </div>
    </div>
    <!-- ── Notifications ────────────────────────────────────────────────────── -->
    <div class="flex w-full flex-col gap-3">
      <h2 class="text-sm font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
        Notifications
      </h2>
      <div class="flex flex-wrap gap-2">
        <button
          onclick={() => notification.notify('Tap a die to stage it for scoring.', 'info')}
          class="rounded-lg bg-gray-200 px-3 py-1.5 font-mono text-xs font-medium text-gray-700 transition-colors hover:bg-gray-300 active:scale-[0.97] dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
        >
          info (3 s)
        </button>
        <button
          onclick={() =>
            notification.notify('This notification stays until dismissed.', 'info', null)}
          class="rounded-lg bg-gray-200 px-3 py-1.5 font-mono text-xs font-medium text-gray-700 transition-colors hover:bg-gray-300 active:scale-[0.97] dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
        >
          info (persistent)
        </button>
        <button
          onclick={() => notification.notify('That combination is not valid.', 'warning')}
          class="rounded-lg bg-gray-200 px-3 py-1.5 font-mono text-xs font-medium text-gray-700 transition-colors hover:bg-gray-300 active:scale-[0.97] dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
        >
          warning (3 s)
        </button>
        <button
          onclick={() =>
            notification.notify('Network error — could not roll dice.', 'error', 4_000)}
          class="rounded-lg bg-gray-200 px-3 py-1.5 font-mono text-xs font-medium text-gray-700 transition-colors hover:bg-gray-300 active:scale-[0.97] dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
        >
          error (4 s)
        </button>
        <button
          onclick={() => notification.notify('New notification while previous shows!', 'info')}
          class="rounded-lg bg-gray-200 px-3 py-1.5 font-mono text-xs font-medium text-gray-700 transition-colors hover:bg-gray-300 active:scale-[0.97] dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
        >
          replace existing
        </button>
        <button
          onclick={() =>
            notification.notify(
              'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
              'info',
              null,
            )}
          class="rounded-lg bg-gray-200 px-3 py-1.5 font-mono text-xs font-medium text-gray-700 transition-colors hover:bg-gray-300 active:scale-[0.97] dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
        >
          long text
        </button>
        <button
          onclick={() => notification.dismiss()}
          class="rounded-lg bg-gray-200 px-3 py-1.5 font-mono text-xs font-medium text-gray-700 transition-colors hover:bg-gray-300 active:scale-[0.97] dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
        >
          dismiss
        </button>
      </div>
    </div>

    <!-- ── Reactions ─────────────────────────────────────────────────────── -->
    <div class="flex w-full flex-col gap-3">
      <h2 class="text-sm font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400">
        Reactions
      </h2>
      <p class="text-xs text-gray-400 dark:text-gray-500">
        FAB fixed bottom-right — click it to open the emoji picker. Buttons below fire reactions
        directly without the picker.
      </p>
      <div class="flex flex-wrap gap-2">
        {#each REACTION_TYPES as type (type)}
          <button
            onclick={() => fireReaction(type)}
            class="rounded-lg bg-gray-200 px-3 py-1.5 text-xl transition-transform hover:scale-110 active:scale-95 dark:bg-gray-700"
            title={type}
          >
            {REACTIONS[type]}
          </button>
        {/each}
      </div>
    </div>

    <!-- ── GameBoard ──────────────────────────────────────────────────────── -->
    <div class="flex w-full flex-col items-center gap-4">
      <GameBoard board={demoBoard} staged={demoStaged} class="w-full" />

      <div class="grid w-full grid-cols-6 gap-2">
        {#each ROW_INDICES as i (i)}
          <div class="flex flex-col gap-1">
            <div
              class="flex flex-col items-center justify-center gap-0.5 rounded-t-lg bg-gray-200 py-1.5 text-xs font-medium text-gray-900 dark:bg-gray-700 dark:text-white"
            >
              <span class="text-xs text-gray-500 dark:text-gray-400">row {i + 1}</span>
              <span class="text-xs text-gray-500 dark:text-gray-400"
                >{demoBoard[i] - demoStaged[i]}+{demoStaged[i]}/7</span
              >
            </div>
            <button
              onclick={() => stagePearl(i)}
              disabled={demoStaged[i] >= demoBoard[i]}
              class="rounded-none bg-amber-700 py-1 text-xs font-medium text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-30"
            >
              Stage
            </button>
            <button
              onclick={() => commitRow(i)}
              disabled={demoStaged[i] === 0}
              class="rounded-b-lg bg-green-800 py-1 text-xs font-medium text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-30"
            >
              Commit
            </button>
          </div>
        {/each}
      </div>

      <button
        onclick={resetBoard}
        class="rounded-lg bg-amber-800 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-700"
      >
        Reset board
      </button>
    </div>

    <!-- ── DiceRoller ─────────────────────────────────────────────────────── -->
    <div class="flex w-full flex-col gap-4">
      <p class="text-center text-xs text-gray-500">
        Click the cup to roll · Use the controls below to spend dice
      </p>

      <DiceRoller {dice} shaking={diceShaking} {canShake} onShake={handleShake} />

      <!-- Spend controls — only shown when dice are active -->
      {#if activeDiceIndices.length > 0}
        <div class="flex flex-col gap-2">
          <!-- Spend individual dice (target 1–6) -->
          <div class="flex flex-wrap gap-2">
            {#each activeDiceIndices as i (i)}
              <button
                onclick={() => spendSingle(i)}
                class="rounded-lg bg-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              >
                Spend {dice[i].value}
              </button>
            {/each}
          </div>

          <!-- Spend pairs (target 7–12) — shown when 2+ active dice -->
          {#if activeDiceIndices.length >= 2}
            <div class="flex flex-wrap gap-2">
              {#each activeDiceIndices as i (i)}
                {#each activeDiceIndices as j (j)}
                  {#if j > i && dice[i].value + dice[j].value >= 7 && dice[i].value + dice[j].value <= 12}
                    <button
                      onclick={() => spendPair(i, j)}
                      class="rounded-lg bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-900/60"
                    >
                      Pair {dice[i].value}+{dice[j].value}={dice[i].value + dice[j].value}
                    </button>
                  {/if}
                {/each}
              {/each}
            </div>
          {/if}
        </div>
      {/if}

      <button
        onclick={resetDice}
        class="self-start rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
      >
        Reset dice
      </button>
    </div>
  </div>
</main>

<Notification />
<ReactionOverlay reactions={demoReactions} />
<ReactionFab onreact={fireReaction} />

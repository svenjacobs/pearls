<script lang="ts">
  import { GameBoard } from '$lib'
  import * as m from '$lib/paraglide/messages.js'

  type Props = {
    name: string
    isAI?: boolean
    board: number[]
    score: number
    isCurrentPlayer?: boolean
    isActiveTurn?: boolean
    lockedTarget?: number | null
    colors?: string[]
  }

  let {
    name,
    isAI = false,
    board,
    score,
    isCurrentPlayer = false,
    isActiveTurn = false,
    lockedTarget = null,
    colors,
  }: Props = $props()
</script>

<div
  class="flex w-64 flex-col items-center gap-3 rounded-2xl p-4 ring-2 transition duration-500 {isActiveTurn
    ? 'bg-amber-50 ring-amber-400 dark:bg-amber-950/30 dark:ring-amber-500'
    : 'bg-transparent ring-transparent'}"
>
  <div class="flex items-center gap-2">
    <span
      class="size-2 rounded-full bg-amber-500 transition-opacity duration-500 {isActiveTurn
        ? 'animate-pulse opacity-100'
        : 'opacity-0'}"
    ></span>
    <p
      class="text-sm font-semibold {isCurrentPlayer
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-gray-900 dark:text-white'}"
    >
      {name}{#if isAI}
        <span title={m.a11y_ai_player()}>🤖</span>{/if}
    </p>
  </div>
  <GameBoard {board} {lockedTarget} {colors} muted class="w-full" />
  <p class="text-sm text-gray-600 dark:text-gray-400">
    {score === 1 ? m.boards_point() : m.boards_points({ score })}
  </p>
</div>

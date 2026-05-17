<!--
  DiceRoller — controlled dice-rolling display combining DiceShaker and Die.
  All dice state is driven by props; the component only manages eject
  animations internally (triggered when a die transitions in_cup → active).

  Layout:
       | active / in-cup dice
   CUP |---------------------
       | spent dice (pairs stacked diagonally)

  Spent dice that share the same pairId are rendered as a diagonal stack to
  indicate they were selected together as a two-dice sum (targets 7–12).

  Active dice can be made interactive by passing `onDieClick`. When provided,
  each active die is rendered as a button; dice listed in `selectedIndices`
  are highlighted with an amber ring to indicate they are staged for the
  current selection.
-->
<script lang="ts">
  import { untrack } from 'svelte'

  import { playDieLand } from '$lib/audio.js'
  import type { DieModel } from '$lib/dice.js'
  import * as m from '$lib/paraglide/messages.js'

  import DiceShaker from './DiceShaker.svelte'
  import Die from './Die.svelte'
  import LabeledDicePair from './LabeledDicePair.svelte'
  import LabeledDie from './LabeledDie.svelte'

  type Props = {
    /** Current state of all dice. */
    dice?: DieModel[]
    shaking?: boolean
    canShake?: boolean
    onShake?: () => void
    /**
     * Indices of active dice that are currently staged (selected by the
     * player). These are highlighted with an amber ring.
     */
    selectedIndices?: readonly number[]
    /**
     * Called when an active die is clicked. If omitted, active dice are
     * non-interactive (pointer-events disabled).
     */
    onDieClick?: (index: number) => void
    /** When true, suppresses all audio (e.g. spectator watching another player). */
    muted?: boolean
    /** When true, shows a green open-lock icon on the cup (staged dice will clear the row). */
    clearRow?: boolean
    /** When true, shows a green arrow-up on the cup (player must tap a board row to pick target). */
    pickTarget?: boolean
  }

  let {
    dice = [],
    shaking = false,
    canShake = true,
    onShake,
    selectedIndices = [],
    onDieClick,
    muted = false,
    clearRow = false,
    pickTarget = false,
  }: Props = $props()

  // Per-die stagger: each transitioning die pops in STAGGER_MS after the previous one.
  // `revealed[i]` drives visibility — the die is kept as a placeholder until its
  // stagger timeout fires and the button mounts, which auto-triggers the CSS animation.
  const STAGGER_MS = 70

  let prevStatuses = untrack(() => dice.map((d) => d.status))
  // Initialise to true for dice already active (no animation on page load).
  let revealed = $state<boolean[]>(untrack(() => dice.map((d) => d.status === 'active')))

  $effect(() => {
    const current = dice.map((d) => d.status)
    if (revealed.length !== current.length) {
      revealed = current.map((s) => s === 'active')
    }
    // Use a relative offset (not absolute index) so that the stagger speed is
    // constant regardless of how many dice are rolling or which indices they occupy.
    const timers: ReturnType<typeof setTimeout>[] = []
    let staggerOffset = 0
    current.forEach((status, i) => {
      if (status === 'active' && prevStatuses[i] === 'in_cup') {
        // Stagger each die: JS timeout both hides and delays the reveal.
        const delay = staggerOffset++ * STAGGER_MS
        timers.push(
          setTimeout(() => {
            revealed[i] = true
            if (!muted) playDieLand()
          }, delay),
        )
      } else if (status !== 'active' && revealed[i]) {
        // Die went back to cup or spent — reset so it animates again next roll.
        revealed[i] = false
      }
    })
    prevStatuses = current
    return () => timers.forEach(clearTimeout)
  })

  // Non-spent dice with their original indices, for gap-free left-to-right display.
  const activeDice = $derived(
    dice.map((die, i) => ({ die, i })).filter(({ die }) => die.status !== 'spent'),
  )

  // Trailing placeholders to pad active row to dice.length slots.
  const activeTrailingPlaceholders = $derived(
    Array.from({ length: Math.max(0, dice.length - activeDice.length) }, (_, i) => i),
  )

  // Group spent dice for display: dice sharing a pairId are collected together;
  // singletons form a group of one. Order follows first encounter in dice array.
  const spentGroups = $derived.by(() => {
    const groups: DieModel[][] = []
    for (const die of dice) {
      if (die.status !== 'spent') continue
      if (die.pairId !== undefined) {
        const existing = groups.find((g) => g[0].pairId === die.pairId)
        if (existing) {
          existing.push(die)
        } else {
          groups.push([die])
        }
      } else {
        groups.push([die])
      }
    }
    return groups
  })

  // Fill remaining visual slots so the spent row is always dice.length wide.
  const placeholderIndices = $derived(
    Array.from({ length: Math.max(0, dice.length - spentGroups.length) }, (_, i) => i),
  )
</script>

<div class="flex w-full items-stretch select-none" role="group" aria-label={m.a11y_dice_roller()}>
  <!-- Cup column — vertically centred, separated from dice by a vertical line -->
  <div class="flex items-center pr-4">
    <DiceShaker {shaking} {canShake} {onShake} {clearRow} {pickTarget} />
  </div>

  <!-- Dice column -->
  <div
    class="flex flex-1 flex-col justify-center gap-3 border-l-2 border-l-[rgba(255,200,70,0.3)] pl-4"
  >
    <!-- Active section: unlocked (ejected) dice + in-cup / unrevealed placeholders.
         Spent dice are skipped so active dice fill left-to-right without gaps. -->
    <div class="flex flex-wrap gap-1.5 sm:gap-3" aria-label={m.a11y_active_dice()}>
      {#each activeDice as { die, i }, vi (i)}
        {#if die.status === 'active' && revealed[i]}
          {@const isSelected = selectedIndices.includes(i)}
          <button
            type="button"
            class="h-9 w-9 shrink-0 animate-[pop_0.35s_cubic-bezier(0.34,1.56,0.64,1)_forwards] rounded-[18%] outline-none sm:h-13 sm:w-13
                   {onDieClick ? 'cursor-pointer' : 'pointer-events-none'}
                   {isSelected ? 'scale-110 ring-3 ring-amber-400' : ''}"
            aria-label={isSelected
              ? m.a11y_die_label_staged({ index: vi + 1, value: die.value })
              : m.a11y_die_label({ index: vi + 1, value: die.value })}
            aria-pressed={isSelected}
            onclick={() => onDieClick?.(i)}
            disabled={!onDieClick}
          >
            <Die value={die.value} />
          </button>
        {:else}
          <div
            class="box-border h-9 w-9 shrink-0 rounded-[18%] border-2 border-dashed border-white/20 sm:h-13 sm:w-13"
            aria-hidden="true"
          ></div>
        {/if}
      {/each}
      {#each activeTrailingPlaceholders as pi (pi)}
        <div
          class="box-border h-9 w-9 shrink-0 rounded-[18%] border-2 border-dashed border-white/20 sm:h-13 sm:w-13"
          aria-hidden="true"
        ></div>
      {/each}
    </div>

    <!-- Spent section — always rendered; placeholders fill remaining slots up to dice.length -->
    <div
      class="flex flex-wrap gap-1.5 border-t-2 border-t-[rgba(255,200,70,0.3)] pt-3 sm:gap-3"
      aria-label={m.a11y_spent_dice()}
    >
      {#each spentGroups as group, gi (gi)}
        {#if group.length >= 2}
          <LabeledDicePair values={[group[0].value, group[1].value]} />
        {:else}
          <LabeledDie value={group[0].value} />
        {/if}
      {/each}
      {#each placeholderIndices as i (i)}
        <!-- Match LabeledDie/LabeledDicePair structure (same outer size) so
             the row height is stable before any spent die appears. -->
        <div class="flex flex-col items-center gap-1" aria-hidden="true">
          <div
            class="box-border h-9 w-9 shrink-0 rounded-[18%] border-2 border-dashed border-white/20 sm:h-13 sm:w-13"
          ></div>
          <span class="font-mono text-xs">&nbsp;</span>
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  /*
   * The -global- prefix tells Svelte not to scope this keyframe name, so the
   * generated CSS uses the plain name "pop" — matching the Tailwind arbitrary
   * class animate-[pop_...] which references it literally.
   * See https://svelte.dev/docs/svelte/global-styles#:global()
   */
  @keyframes -global-pop {
    from {
      opacity: 0;
      transform: scale(0.3);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
</style>

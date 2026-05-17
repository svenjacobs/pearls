<!--
  GameBoard — the wooden pearl board for one player.
  Displays 12 rows, each holding up to 7 pearls on a metallic rod. Active
  pearls slide left-to-right as they are removed; staged pearls (selected for
  removal in the current turn but not yet committed) separate from the free
  cluster with a gap and bob gently. Cleared rows show a lock icon.
-->
<script lang="ts">
  import { clamp } from 'es-toolkit'
  import { untrack } from 'svelte'

  import { playPearlDrop, playRowClear } from '$lib/audio.js'
  import * as m from '$lib/paraglide/messages.js'

  import Pearl from './Pearl.svelte'

  type Props = {
    /** Pearl counts per row. Index 0 = row 1, index 11 = row 12. Values 0–7. */
    board?: number[]
    /**
     * Staged pearl counts per row. A pearl is "staged" when it has been
     * selected for removal in the current turn but the turn is not yet committed
     * (the player intends to roll again). Values 0–7; clamped to the
     * corresponding board count automatically.
     */
    staged?: number[]
    /** Row numbers (1–12) the player may tap to select as the target. */
    validTargets?: number[]
    /** Called when the player taps an eligible row number. */
    onTargetSelect?: (target: number) => void
    /** Disables eligible row buttons while a request is in flight. */
    submitting?: boolean
    /** When true, suppresses all audio (e.g. spectator watching another player). */
    muted?: boolean
    /** Locked target row (1–12) to highlight green. Null = no highlight. */
    lockedTarget?: number | null
    /** Custom 12-color palette, one per row. Falls back to the default rainbow when omitted. */
    colors?: string[]
    class?: string
  }

  let {
    board = Array(12).fill(7),
    staged = Array(12).fill(0),
    validTargets = [],
    onTargetSelect,
    submitting = false,
    muted = false,
    lockedTarget = null,
    colors,
    class: className = '',
  }: Props = $props()

  const ROWS = 12
  const MAX_PEARLS = 7

  /**
   * Pearl width as a percentage of the bar track width.
   *
   * At 6 %, seven active pearls fill exactly 45 % of the track (left zone)
   * and seven used pearls fill exactly 45 % from the right (right zone),
   * leaving a permanent 10 % empty centre strip so the two clusters can
   * never visually touch, regardless of the pearl counts in adjacent rows.
   *
   *   Left zone  : 0 %  – 45 %   (active pearls, j < count)
   *   Centre gap : 45 % – 55 %   (always empty)
   *   Right zone : 55 % – 100 %  (used pearls,   j ≥ count)
   */
  const PEARL_W = 6
  const PEARL_STEP = 6.5 // pearl width + 0.5 % inter-pearl gap

  /**
   * Extra gap (in %) inserted between the free active cluster and the staged
   * pearls to the right, so the player can clearly see which pearls are staged.
   */
  const STAGED_GAP = 4

  /**
   * Percentage inset from each edge of the track so the leftmost active
   * pearl and rightmost spent pearl don't crowd the label or board border.
   */
  const TRACK_MARGIN = 2

  /** One distinct colour per row, covering the full visible spectrum. */
  const PEARL_COLORS: readonly string[] = [
    '#ff2c2c', //  1 – scarlet
    '#ff8c00', //  2 – tangerine
    '#ffd600', //  3 – gold
    '#b5e800', //  4 – chartreuse
    '#00c957', //  5 – emerald
    '#00ddb0', //  6 – aquamarine
    '#1ab8ff', //  7 – sky
    '#2866ff', //  8 – royal blue
    '#8844ff', //  9 – violet
    '#e800ff', // 10 – magenta
    '#ff1a8c', // 11 – hot pink
    '#ff6040', // 12 – coral
  ]

  /**
   * Returns the `left` percentage (relative to track width) for pearl j.
   *
   * Free active pearls (j < freeCount) pack from the left as usual.
   * Staged pearls (freeCount ≤ j < count) are shifted right by STAGED_GAP,
   * visually separating them from the free cluster.
   * Spent pearls (j ≥ count) pack from the right edge as before.
   * When stagedCount is 0 the behaviour is identical to the original.
   */
  const pearlLeft = (j: number, count: number, stagedCount: number): number => {
    if (j >= count) {
      return 100 - PEARL_W - TRACK_MARGIN - (MAX_PEARLS - 1 - j) * PEARL_STEP
    }
    const freeCount = count - stagedCount
    const gap = stagedCount > 0 && j >= freeCount ? STAGED_GAP : 0
    return TRACK_MARGIN + j * PEARL_STEP + gap
  }

  const clampCount = (i: number): number => clamp(Math.round(board[i] ?? 0), 0, MAX_PEARLS)
  const clampStaged = (i: number, count: number): number =>
    clamp(Math.round(staged[i] ?? 0), 0, count)

  // Pre-computed index arrays — avoids throwaway `_` variables in each blocks
  // and gives each block a stable, meaningful key.
  const ROW_INDICES = Array.from({ length: ROWS }, (_, i) => i)
  const PEARL_INDICES = Array.from({ length: MAX_PEARLS }, (_, j) => j)

  // Pre-compute per-row counts so clampCount / clampStaged are each called
  // exactly once per row, regardless of how many template loops reference them.
  const counts = $derived(ROW_INDICES.map((i) => clampCount(i)))
  const stagedCounts = $derived(ROW_INDICES.map((i) => clampStaged(i, counts[i])))

  // Reactive set for O(1) eligibility lookups — guaranteed to update when
  // validTargets prop changes, avoiding potential {#each} / {@const} staleness.
  const eligibleRowSet = $derived(new Set(validTargets))

  // ── Row-clear celebration ────────────────────────────────────────────────
  let rowEls = $state<(Element | null)[]>(Array(ROWS).fill(null))
  let clearedRows = $state<boolean[]>(Array(ROWS).fill(false))
  // Plain variable so writes inside $effect don't recurse; untrack prevents
  // false triggers for rows already cleared when the component mounts.
  let prevCounts = untrack(() => counts.slice())

  const triggerClear = async (i: number) => {
    if (!muted) playRowClear()
    clearedRows[i] = true
    setTimeout(() => (clearedRows[i] = false), 900)
    const { default: confetti } = await import('canvas-confetti')
    const el = rowEls[i]
    if (!el) return
    const rect = el.getBoundingClientRect()
    confetti({
      origin: {
        x: (rect.left + rect.width / 2) / window.innerWidth,
        y: (rect.top + rect.height / 2) / window.innerHeight,
      },
      particleCount: 38,
      spread: 60,
      startVelocity: 12,
      scalar: 0.75,
      gravity: 0.7,
      ticks: 300,
      colors: [(colors ?? PEARL_COLORS)[i], '#ffd600', '#ffffff', '#ffaa00'],
      disableForReducedMotion: true,
    })
  }

  $effect(() => {
    const current = counts
    const isReset = current.some((c, i) => c > prevCounts[i])
    if (!isReset) {
      const newlyCleared = ROW_INDICES.filter((i) => current[i] === 0 && prevCounts[i] > 0)
      // Per-turn rules only one target row can clear per SSE update.
      // More than one clearing simultaneously means the viewed board switched
      // (e.g. loser now sees winner's cleared board) — skip confetti in that case.
      if (newlyCleared.length === 1) triggerClear(newlyCleared[0])
    }
    prevCounts = current.slice()
  })

  // ── Pearl staging sounds ─────────────────────────────────────────────────
  let prevStagedCounts = untrack(() => stagedCounts.slice())

  $effect(() => {
    const current = stagedCounts
    let added = 0
    for (let i = 0; i < ROWS; i++) added += Math.max(0, current[i] - (prevStagedCounts[i] ?? 0))
    if (added > 0 && !muted) playPearlDrop()
    prevStagedCounts = current.slice()
  })

  // Per-pearl bob parameters indexed by absolute pearl position j (0–6).
  // Using absolute j (not relative staged position) means these values never
  // change when new pearls are staged, preventing animation restarts.
  // Negative delays start the animation mid-cycle so pearls appear to already
  // be moving the moment they become staged. Varying durations cause the
  // pearls to drift in and out of phase naturally over time.
  const BOB_PARAMS: readonly { dur: number; delay: number }[] = [
    { dur: 2.5, delay: 0.0 },
    { dur: 2.3, delay: 0.41 },
    { dur: 2.7, delay: 0.82 },
    { dur: 2.4, delay: 1.23 },
    { dur: 2.6, delay: 1.64 },
    { dur: 2.2, delay: 2.05 },
    { dur: 2.8, delay: 2.46 },
  ]
</script>

<!--
  Outer div establishes the 5∶6 aspect ratio and acts as the CSS container
  so child elements can use `cqi` units for fluid font sizing.
-->
<div class="board aspect-5/6 w-full rounded-xl p-[2%] select-none {className}">
  <div
    class="board__inner flex h-full w-full flex-col overflow-hidden rounded-[0.3rem] bg-[rgba(10,4,0,0.52)]"
  >
    {#snippet rowInner(i: number, eligible: boolean)}
      <div
        class="board__label relative flex w-[14%] shrink-0 items-center justify-center font-bold {eligible
          ? 'board__label--eligible'
          : 'text-[#f0c870] opacity-90'}"
        class:board__label--locked={lockedTarget !== null && i + 1 === lockedTarget}
        aria-hidden={eligible ? undefined : 'true'}
      >
        {i + 1}
        {#if counts[i] === 0}
          <span
            class="iconify heroicons--lock-closed-20-solid absolute right-0.5 bottom-0.5 text-green-400 opacity-100 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] transition-opacity duration-500 starting:opacity-0"
            aria-label={m.a11y_board_row_cleared({ row: i + 1 })}
          ></span>
        {/if}
      </div>

      <div
        class="board__track relative flex-1 border-l border-l-black/45"
        role="img"
        aria-label={m.a11y_board_row_pearls({ row: i + 1, count: counts[i], max: MAX_PEARLS })}
      >
        <div
          class="board__rod absolute inset-x-0 top-1/2 h-[13%] -translate-y-1/2 rounded-full"
        ></div>

        {#each PEARL_INDICES as j (j)}
          {@const freeCount = counts[i] - stagedCounts[i]}
          {@const isStaged = j >= freeCount && j < counts[i]}
          <div
            class="absolute top-1/2 aspect-square w-[6%] -translate-y-1/2 transition-[left] duration-400"
            style="left: {pearlLeft(j, counts[i], stagedCounts[i])}%;"
          >
            <div
              class="h-full w-full"
              class:pearl--staged={isStaged}
              style={isStaged
                ? `--bob-dur: ${BOB_PARAMS[j].dur}s; --bob-delay: -${BOB_PARAMS[j].delay}s`
                : ''}
            >
              <Pearl color={(colors ?? PEARL_COLORS)[i]} spent={j >= counts[i]} />
            </div>
          </div>
        {/each}
      </div>
    {/snippet}

    {#each ROW_INDICES as i (i)}
      {#if eligibleRowSet.has(i + 1)}
        <button
          type="button"
          onclick={() => onTargetSelect?.(i + 1)}
          disabled={submitting}
          aria-label={m.a11y_board_select_row({ row: i + 1 })}
          class="board__row board__row--eligible relative flex flex-1"
          class:board__row--just-cleared={clearedRows[i]}
          bind:this={rowEls[i]}
        >
          {@render rowInner(i, true)}
        </button>
      {:else}
        <div
          class="board__row relative flex flex-1"
          class:board__row--just-cleared={clearedRows[i]}
          bind:this={rowEls[i]}
        >
          {@render rowInner(i, false)}
        </div>
      {/if}
    {/each}
  </div>
</div>

<style>
  /* ── Outer wooden frame ─────────────────────────────────────────────────── */
  .board {
    container-type: inline-size;
    background: linear-gradient(
      to right,
      #2e1005 0%,
      #7a4019 8%,
      #b5632a 22%,
      #c87f3d 42%,
      #a85a22 50%,
      #c87f3d 58%,
      #b5632a 78%,
      #7a4019 92%,
      #2e1005 100%
    );
    box-shadow:
      0 6px 28px rgba(0, 0, 0, 0.55),
      inset 0 1px 0 rgba(255, 200, 80, 0.25),
      inset 0 -2px 0 rgba(0, 0, 0, 0.35);
  }

  /* ── Playing field (dark sunken area inside the frame) ──────────────────── */
  .board__inner {
    box-shadow:
      inset 0 0 16px rgba(0, 0, 0, 0.7),
      inset 0 2px 4px rgba(0, 0, 0, 0.6);
  }

  /* ── Row-number labels column ───────────────────────────────────────────── */
  .board__label {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: clamp(7px, 4.2cqi, 22px);
  }

  /* Eligible row label (plain div inside the row button) */
  .board__label--eligible {
    font-family: Georgia, 'Times New Roman', serif;
    border: none;
    padding: 0;
    color: #fbbf24;
    background: transparent;
    transition:
      background 0.15s,
      color 0.15s;
  }

  /* ── Row containers ─────────────────────────────────────────────────────── */
  .board__row:nth-child(even) .board__label,
  .board__row:nth-child(even) .board__track {
    background: rgba(255, 255, 255, 0.03);
  }

  .board__row + .board__row {
    border-top: 1px solid rgba(255, 255, 255, 0.04);
  }

  .board__row--eligible {
    box-shadow: inset 0 0 0 3px rgba(251, 191, 36, 0.85);
    border-radius: 4px;
    z-index: 1;
    border: none;
    padding: 0;
    background: transparent;
    cursor: pointer;
    transition: box-shadow 0.15s;
  }

  .board__row--eligible:hover:not(:disabled) {
    box-shadow: inset 0 0 0 3px rgba(251, 191, 36, 1);
  }

  .board__row--eligible:active:not(:disabled) {
    box-shadow:
      inset 0 0 0 3px rgba(251, 191, 36, 1),
      inset 0 0 8px rgba(251, 191, 36, 0.3);
  }

  .board__row--eligible:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .board__row--eligible .board__track {
    border-left-color: transparent;
  }

  /* ── Locked-target row highlight ────────────────────────────────────────── */
  .board__label.board__label--locked {
    color: #4ade80;
    opacity: 1;
    transition: color 0.3s;
  }

  /* ── Row-clear celebration glow ─────────────────────────────────────────── */
  .board__row--just-cleared {
    animation: row-clear-glow 0.85s ease-out forwards;
  }

  @keyframes row-clear-glow {
    0% {
      box-shadow:
        inset 0 0 0 2px rgba(255, 214, 0, 0.9),
        inset 0 0 18px rgba(255, 214, 0, 0.55);
    }
    35% {
      box-shadow:
        inset 0 0 0 2px rgba(255, 214, 0, 1),
        inset 0 0 28px rgba(255, 214, 0, 0.7);
    }
    100% {
      box-shadow:
        inset 0 0 0 0 rgba(255, 214, 0, 0),
        inset 0 0 0 rgba(255, 214, 0, 0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .board__row--just-cleared {
      animation: none;
    }
  }

  /* ── Metallic rod ───────────────────────────────────────────────────────── */
  .board__rod {
    background: linear-gradient(to bottom, #f6f6f6 0%, #d2d2d2 28%, #878787 62%, #c0c0c0 100%);
    box-shadow:
      0 1px 4px rgba(0, 0, 0, 0.5),
      inset 0 1px 0 rgba(255, 255, 255, 0.55);
  }

  /* ── Staged pearl bob ────────────────────────────────────────────────────
     Applied to the inner wrapper of each staged pearl. The outer positioning
     div handles centering on the rod; this only adds a gentle vertical float.
     The --pearl-bob-delay custom property (set inline per pearl) staggers
     the animation so no two pearls in the cluster bob in sync.
     Using a CSS class (not an inline animation:) ensures the keyframe name
     is transformed alongside the class reference by Svelte's scope compiler.
  ─────────────────────────────────────────────────────────────────────────── */
  .pearl--staged {
    animation: bob var(--bob-dur, 2.5s) ease-in-out var(--bob-delay, 0s) infinite;
  }

  @keyframes bob {
    0%,
    100% {
      transform: translateY(8%);
    }
    50% {
      transform: translateY(-8%);
    }
  }
</style>

<script lang="ts">
  import { untrack } from 'svelte'

  import { invalidateAll } from '$app/navigation'
  import { resolve } from '$app/paths'
  import type { DieModel } from '$lib'
  import { DiceRoller, GameBoard } from '$lib'
  import {
    isMuted,
    playBust,
    playDiceShake,
    playDieSelect,
    playIllegalSelection,
    playLose,
    playVictory,
    toggleMute,
  } from '$lib/audio.js'
  import { copyToClipboard } from '$lib/clipboard'
  import Button from '$lib/components/Button.svelte'
  import LeaveGameButton from '$lib/components/LeaveGameButton.svelte'
  import InitiativeBoard from '$lib/components/lobby/InitiativeBoard.svelte'
  import Notification from '$lib/components/Notification.svelte'
  import ThemeSwitch from '$lib/components/ThemeSwitch.svelte'
  import { notification } from '$lib/notification.svelte'
  import * as m from '$lib/paraglide/messages.js'
  import { getThemeColors } from '$lib/pearlThemes'
  import { playerDisplayName } from '$lib/playerName'
  import { connectSse } from '$lib/sse'
  import { getReactionsEnabled, setReactionsEnabled } from '$lib/storage'

  import type { PageData } from './$types'
  import OverlayBackdrop from './OverlayBackdrop.svelte'
  import PushNotificationToggle from './PushNotificationToggle.svelte'
  import ReactionController from './ReactionController.svelte'
  import SpectatorFrame from './SpectatorFrame.svelte'

  let { data }: { data: PageData } = $props()

  const fetchErrorMessage = async (res: Response, fallback: string): Promise<string> => {
    try {
      const body = (await res.json()) as { message?: string }
      return body.message ? `Error: ${body.message}` : fallback
    } catch {
      return fallback
    }
  }

  const viewedColors = $derived(getThemeColors(data.viewedPlayer.pearlTheme))

  let boardEl = $state<Element | null>(null)
  let menuOpen = $state(false)
  let menuEl = $state<HTMLElement | null>(null)
  let confirmLeave = $state(false)
  let codeCopied = $state(false)
  let debugOpen = $state(false)
  let debugDice = $state<number[]>([1, 1, 1, 1, 1, 1])
  let debugApplying = $state(false)
  let muted = $state(isMuted())
  let reactionsEnabled = $state(getReactionsEnabled())

  // Reset sub-panels when menu closes.
  $effect(() => {
    if (!menuOpen) {
      confirmLeave = false
      debugOpen = false
    }
  })

  const debugForceWin = async (target: 'me' | 'opponent') => {
    await fetch('/api/game/debug/force-win', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target }),
    })
    menuOpen = false
  }

  const applyDebugDice = async () => {
    debugApplying = true
    try {
      await fetch('/api/game/debug/set-dice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: debugDice }),
      })
      menuOpen = false
    } finally {
      debugApplying = false
    }
  }

  const copyInviteUrl = async () => {
    await copyToClipboard(data.inviteUrl)
    codeCopied = true
    setTimeout(() => (codeCopied = false), 2_000)
  }

  // Close the context menu when the user clicks outside it.
  $effect(() => {
    if (!menuOpen) return
    const close = (e: MouseEvent) => {
      if (!menuEl?.contains(e.target as Node)) menuOpen = false
    }
    window.addEventListener('click', close, true)
    return () => window.removeEventListener('click', close, true)
  })

  // ── Reaction overlay ──────────────────────────────────────────────────────

  let reactionController = $state<ReactionController | null>(null)

  // Subscribe to the game's SSE channel. Every backend mutation triggers a
  // `refresh` event; we respond by re-running the page's load function.
  // `reaction` events are forwarded to ReactionController for overlay rendering.
  // The session cookie is sent automatically, so no game ID is needed in the URL.
  //
  // connectSse handles reconnection and the visibilitychange / background-tab fix.

  $effect(() =>
    connectSse('/api/game/events', () => void invalidateAll(), {
      reaction: (e) => reactionController?.onSseReaction(e),
    }),
  )

  // ── Win confetti ─────────────────────────────────────────────────────────
  let prevGameStatus = untrack(() => data.status)

  const triggerWinConfetti = async () => {
    const { default: confetti } = await import('canvas-confetti')
    const burst = (angle: number, x: number) =>
      confetti({
        angle,
        spread: 55,
        particleCount: 80,
        origin: { x, y: 0.7 },
        startVelocity: 28,
        scalar: 0.9,
        gravity: 0.7,
        ticks: 350,
        disableForReducedMotion: true,
      })
    burst(60, 0)
    burst(120, 1)
    setTimeout(() => {
      burst(60, 0)
      burst(120, 1)
    }, 400)
  }

  $effect(() => {
    const status = data.status
    if (status === 'finished' && prevGameStatus !== 'finished') {
      if (data.winner?.id === data.player.id) {
        void triggerWinConfetti()
        playVictory()
      } else if (data.winner) {
        playLose()
      }
    }
    // On restart, the game transitions from 'finished' back to 'waiting' for the
    // initiative dice-off. invalidateAll() alone is not enough: the connectSse
    // $effect has no reactive dependency on game ID, so it keeps the old SSE
    // connection subscribed to the previous game's channel. A full reload
    // unmounts the component, forcing connectSse to re-run against the new
    // session (which already points to the new game ID after the restart action).
    if (prevGameStatus === 'finished' && status === 'waiting') {
      window.location.reload()
    }
    prevGameStatus = status
  })

  // Show a persistent notification when the current player has voted to restart
  // but at least one other player hasn't confirmed yet.
  $effect(() => {
    if (
      data.status === 'finished' &&
      data.playerHasVotedRestart &&
      data.restartVoteCount < Object.keys(data.scores).length
    ) {
      notification.notify(m.game_waiting_restart_confirm(), 'info')
    }
  })

  // ── Bust sound ───────────────────────────────────────────────────────────
  let prevTurnStatus = untrack(() => data.currentTurn?.status ?? null)

  $effect(() => {
    const status = data.currentTurn?.status ?? null
    if (isMyTurn && status === 'pending-end' && prevTurnStatus !== 'pending-end') {
      playBust()
    }
    prevTurnStatus = status
  })

  // ── Hint notifications ────────────────────────────────────────────────────
  // Shows contextual dice-selection guidance to the active player during the
  // 'choosing' phase (e.g. "tap a die to select", "1 die selected for slot 7").
  // Notifications auto-dismiss after 3 s; errors persist until replaced by the
  // next notification.

  // Suppress the "tap to select" hint after the first unstage so it only shows
  // once per roll, not every time the player empties their staged selection.
  let hasInteractedThisRoll = $state(false)
  $effect(() => {
    if (!isMyTurn || turnStatus !== 'choosing') hasInteractedThisRoll = false
  })
  $effect(() => {
    if (isMyTurn && hasStagedDice) hasInteractedThisRoll = true
  })

  $effect(() => {
    if (!isMyTurn || turnStatus !== 'choosing') return

    let text: string
    if (!hasStagedDice) {
      if (hasInteractedThisRoll) return
      text =
        lockedTarget !== null
          ? m.dice_locked_tap_to_select({ target: lockedTarget })
          : m.dice_tap_to_select()
    } else if (isStagingIllegal) {
      return
    } else if (lockedTarget !== null) {
      text =
        stagedDiceIndices.length === 1
          ? m.dice_one_die_selected({ target: lockedTarget })
          : m.dice_n_dice_selected({ count: stagedDiceIndices.length, target: lockedTarget })
    } else if (validTargetsFromStaged.length === 1) {
      // Unambiguous target: same "tap the cup" prompt even though target isn't locked yet.
      const autoTarget = validTargetsFromStaged[0]
      text =
        stagedDiceIndices.length === 1
          ? m.dice_one_die_selected({ target: autoTarget })
          : m.dice_n_dice_selected({ count: stagedDiceIndices.length, target: autoTarget })
    } else {
      text = m.dice_pick_target_row()
    }

    notification.notify(text, 'info')
  })

  // Show a persistent info notification when the end-round overlay is visible.
  // Dismissed on button click (handleEndTurn) or when the overlay leaves.
  $effect(() => {
    if (isMyTurn && turnStatus === 'pending-end') {
      notification.notify(m.dice_no_more_moves(), 'info')
    }
  })

  // ── Derived turn-state ────────────────────────────────────────────────────

  const placeholderDice: DieModel[] = Array.from(
    { length: 6 },
    () => ({ value: 0, status: 'in_cup' }) satisfies DieModel,
  )

  // ── QR code for the waiting dialog ───────────────────────────────────────

  let qrDataUrl = $state('')

  $effect(() => {
    if (data.status !== 'waiting') return
    void (async () => {
      const { renderSVG } = await import('uqr')
      qrDataUrl = 'data:image/svg+xml,' + encodeURIComponent(renderSVG(data.inviteUrl))
    })()
  })

  // ── Local UI state (only meaningful for the active player) ───────────────

  let rolling = $state(false)
  /** Indices of active dice the player has tapped into the staging area. */
  let stagedDiceIndices = $state<number[]>([])
  let submitting = $state(false)
  let endTurnCountdown = $state<number | null>(null)
  let barScale = $state(1)

  // Auto-countdown when the turn reaches pending-end. Fires handleEndTurn at 0.
  $effect(() => {
    if (!isMyTurn || turnStatus !== 'pending-end' || submitting) {
      endTurnCountdown = null
      return
    }
    let remaining = 5
    endTurnCountdown = remaining
    const id = setInterval(() => {
      remaining--
      endTurnCountdown = remaining
      if (remaining <= 0) {
        clearInterval(id)
        void handleEndTurn()
      }
    }, 1_000)
    return () => clearInterval(id)
  })

  // Drive the progress bar with a smooth CSS transition rather than per-second
  // jumps. Two rAF calls ensure the browser paints scaleX(1) before we start
  // the transition, so it always runs for the full 5 s.
  $effect(() => {
    if (!isMyTurn || turnStatus !== 'pending-end' || submitting) {
      barScale = 1
      return
    }
    barScale = 1
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        barScale = 0
      })
    })
    return () => cancelAnimationFrame(raf)
  })

  const dice = $derived<DieModel[]>(
    data.currentTurn ? (data.currentTurn.dice as DieModel[]) : placeholderDice,
  )

  const turnStatus = $derived(data.currentTurn?.status ?? null)
  const currentTurnId = $derived(data.currentTurn?.id ?? null)
  const lockedTarget = $derived(data.currentTurn?.target ?? null)
  const isMyTurn = $derived(!data.isSpectator && data.status === 'playing')

  const playingAsParts = $derived(
    m.game_playing_as({ name: '|||' }).split('|||') as [string, string],
  )
  const vsParts = $derived(m.game_vs({ name: '|||' }).split('|||') as [string, string])

  // ── Staged-dice selection helpers ─────────────────────────────────────────

  /**
   * Returns true if `values` can be perfectly partitioned into pairs each
   * summing to `target` (7–12). Every value must be used, no leftovers.
   */
  const canFormPairs = (values: number[], target: number): boolean => {
    if (values.length === 0 || values.length % 2 !== 0) return false
    const count: number[] = Array(7).fill(0)
    for (const v of values) {
      const comp = target - v
      if (v < 1 || v > 6 || comp < 1 || comp > 6) return false
      count[v]++
    }
    // Check every (v, c) pair once (v < c) and the self-pair (v === c).
    // Do NOT skip when count[v] === 0 — that would miss mismatches like
    // count[2]=0 vs count[5]=2 for target 7.
    for (let v = 1; v <= 6; v++) {
      const c = target - v
      if (c < 1 || c > 6) continue
      if (c === v) {
        if (count[v] % 2 !== 0) return false
      } else if (v < c) {
        if (count[v] !== count[c]) return false
      }
    }
    return true
  }

  /**
   * Computes the set of valid target numbers reachable from `values` given
   * `effectiveBoard`. If `lockedTarget` is set, only returns that target (or
   * an empty array if the staged dice can't form it).
   */
  const computeValidTargets = (
    values: number[],
    locked: number | null,
    effectiveBoard: number[],
  ): number[] => {
    if (values.length === 0) return []
    const valid: number[] = []

    // Singleton target (1–6): all staged dice must show the same face value.
    if (values.every((v) => v === values[0])) {
      const v = values[0]
      if (v >= 1 && v <= 6 && (effectiveBoard[v - 1] ?? 0) > 0) valid.push(v)
    }

    // Pair target (7–12): must pair every staged die with no remainder.
    if (values.length >= 2 && values.length % 2 === 0) {
      for (let s = 7; s <= 12; s++) {
        if ((effectiveBoard[s - 1] ?? 0) <= 0) continue
        if (canFormPairs(values, s)) valid.push(s)
      }
    }

    if (locked !== null) return valid.includes(locked) ? [locked] : []
    return valid.sort((a, b) => a - b)
  }

  const effectiveBoard = $derived(
    data.board?.map((count, i) => Math.max(0, count - (data.staged?.[i] ?? 0))) ?? [],
  )

  const stagedValues = $derived(
    stagedDiceIndices
      .map((i) => dice[i]?.value)
      .filter((v): v is number => v !== undefined && v > 0),
  )

  /** Valid target numbers the player can confirm, given the current staged set. */
  const validTargetsFromStaged = $derived.by((): number[] => {
    if (!isMyTurn || turnStatus !== 'choosing') return []
    return computeValidTargets(stagedValues, lockedTarget, effectiveBoard)
  })

  const hasStagedDice = $derived(stagedDiceIndices.length > 0)
  const isStagingIllegal = $derived(hasStagedDice && validTargetsFromStaged.length === 0)

  /**
   * True when the staged dice validly form the locked target — meaning the
   * player can tap the cup to commit + re-roll.
   */
  const isValidStagingForLocked = $derived(
    lockedTarget !== null && hasStagedDice && validTargetsFromStaged.length > 0,
  )

  const wouldClearRow = $derived.by(() => {
    if (!isMyTurn || turnStatus !== 'choosing') return false
    if (stagedDiceIndices.length === 0 || isStagingIllegal) return false
    // Works for both locked target and unambiguous first-roll selection.
    const target =
      lockedTarget ?? (validTargetsFromStaged.length === 1 ? validTargetsFromStaged[0] : null)
    if (target === null) return false
    const boardCount = data.board?.[target - 1] ?? 0
    const stagedCount = data.staged?.[target - 1] ?? 0
    const remaining = Math.max(0, boardCount - stagedCount)
    if (remaining <= 0) return false
    const pearlsToRemove =
      target <= 6 ? stagedDiceIndices.length : Math.floor(stagedDiceIndices.length / 2)
    return pearlsToRemove >= remaining
  })

  /** True when the player has a valid first-roll selection and needs to tap a board row to lock a target. */
  const pickTarget = $derived(
    isMyTurn &&
      turnStatus === 'choosing' &&
      lockedTarget === null &&
      hasStagedDice &&
      !isStagingIllegal &&
      !wouldClearRow,
  )

  const canShake = $derived.by(() => {
    if (!isMyTurn || rolling) return false
    if (turnStatus === 'rolling' || turnStatus === 'locked') return true
    if (turnStatus === 'choosing' && lockedTarget !== null) return isValidStagingForLocked
    // Unambiguous first-roll: staged dice uniquely identify one target row, so
    // the cup can auto-select it instead of forcing the player to tap the board.
    if (turnStatus === 'choosing' && lockedTarget === null)
      return validTargetsFromStaged.length === 1
    return false
  })

  // Reset local staging and in-flight submission flag whenever the server-side
  // turn changes. Without the submitting reset, a successful handleEndTurn
  // (which keeps submitting=true until the overlay hides) would leave submitting
  // stuck as true on subsequent turns, silently blocking toggleDieStage.
  $effect(() => {
    void currentTurnId
    void turnStatus
    stagedDiceIndices = []
    submitting = false
  })

  // ── Actions ───────────────────────────────────────────────────────────────

  /** Toggle a die in/out of the local staging area. */
  const toggleDieStage = (index: number) => {
    if (!isMyTurn || turnStatus !== 'choosing' || submitting) return
    const pos = stagedDiceIndices.indexOf(index)
    const newIndices =
      pos >= 0 ? stagedDiceIndices.filter((_, j) => j !== pos) : [...stagedDiceIndices, index]
    const newValues = newIndices
      .map((i) => dice[i]?.value)
      .filter((v): v is number => v !== undefined && v > 0)
    const willBeIllegal =
      newIndices.length > 0 &&
      computeValidTargets(newValues, lockedTarget, effectiveBoard).length === 0
    stagedDiceIndices = newIndices
    if (pos < 0) {
      if (willBeIllegal) {
        playIllegalSelection()
      } else {
        playDieSelect()
      }
    }
  }

  const handleShake = async () => {
    if (!canShake || rolling) return

    // Determine the effective target: either already locked, or auto-detected
    // when the staged dice unambiguously point to exactly one row.
    const effectiveTarget =
      lockedTarget ?? (validTargetsFromStaged.length === 1 ? validTargetsFromStaged[0] : null)

    // First-roll selection only — no shake animation or sound.
    // Behaves identically to tapping the board row.
    if (turnStatus === 'choosing' && effectiveTarget !== null) {
      const selectRes = await fetch('/api/game/turn/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: effectiveTarget, dieIndices: stagedDiceIndices }),
      })
      if (!selectRes.ok) {
        notification.notify(
          await fetchErrorMessage(selectRes, m.error_selection_rejected()),
          'error',
          null,
        )
      }
      return
    }

    // From here: actual roll — play sound and trigger animation.
    playDiceShake()
    rolling = true
    try {
      const res = await fetch('/api/game/turn/roll', { method: 'POST' })
      if (!res.ok)
        notification.notify(await fetchErrorMessage(res, m.error_failed_to_roll()), 'error', null)
    } catch {
      notification.notify(m.error_network_rolling(), 'error', null)
    } finally {
      setTimeout(() => (rolling = false), 700)
    }
  }

  /** Confirm the staged dice for a specific target (first-roll selection). */
  const submitSelection = async (target: number) => {
    if (submitting) return
    submitting = true
    try {
      const res = await fetch('/api/game/turn/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, dieIndices: stagedDiceIndices }),
      })
      if (!res.ok)
        notification.notify(
          await fetchErrorMessage(res, m.error_selection_rejected()),
          'error',
          4_000,
        )
    } catch {
      notification.notify(m.error_network_selection(), 'error', null)
    } finally {
      submitting = false
    }
  }

  const handleEndTurn = async () => {
    if (submitting) return
    notification.dismiss()
    submitting = true
    try {
      const res = await fetch('/api/game/turn/end', { method: 'POST' })
      if (!res.ok) {
        notification.notify(await fetchErrorMessage(res, m.error_failed_end_turn()), 'error', null)
        submitting = false
      }
      // On success keep submitting=true: the button stays disabled until the
      // SSE-driven invalidateAll() refreshes turnStatus and hides the overlay.
    } catch {
      notification.notify(m.error_network_end_turn(), 'error', null)
      submitting = false
    }
  }

  // ── Scoreboard helpers ────────────────────────────────────────────────────

  const sortedPlayers = $derived.by(() => {
    const players = [data.player, ...data.opponents]
    return players.sort((a, b) => (data.scores[b.id] ?? 0) - (data.scores[a.id] ?? 0))
  })
</script>

<svelte:head>
  <title>Pearls ({data.inviteCode})</title>
</svelte:head>

<ReactionController bind:this={reactionController} {reactionsEnabled} />

<SpectatorFrame
  active={data.isSpectator}
  playerName={data.isSpectator ? playerDisplayName(data.viewedPlayer) : undefined}
  {boardEl}
  onreact={reactionsEnabled ? (type) => reactionController?.handleReact(type) : undefined}
>
  {#snippet body()}
    <main class="flex h-svh flex-col overflow-hidden">
      <div class="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col px-4">
        <!-- Header -->
        <header class="relative flex flex-none items-center justify-between py-3 md:py-4">
          <div class="text-sm text-gray-600 dark:text-gray-400">
            <p>
              {playingAsParts[0]}<span class="font-medium text-amber-600 dark:text-amber-400"
                >{data.player.name}{#if data.player.isAI}
                  <span title={m.a11y_ai_player()}>🤖</span>{/if}</span
              >{playingAsParts[1]}
              {#if data.opponents.length > 0}
                <span class="mx-1.5 text-gray-400 dark:text-gray-500">·</span>
                {vsParts[0]}<span class="font-medium text-gray-800 dark:text-gray-200"
                  >{#each data.opponents as o, i (o.id)}{i > 0 ? ', ' : ''}{o.name}{#if o.isAI}
                      <span title={m.a11y_ai_player()}>🤖</span>{/if}{/each}</span
                >{vsParts[1]}
              {/if}
            </p>
          </div>

          <!-- Gear button + context menu -->
          <div class="relative" bind:this={menuEl}>
            <button
              onclick={() => (menuOpen = !menuOpen)}
              aria-label={m.menu_game_settings()}
              aria-expanded={menuOpen}
              title={m.menu_game_settings()}
              class="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 active:scale-[0.93] dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
            >
              <span class="iconify heroicons--cog-6-tooth-20-solid size-5"></span>
            </button>

            {#if menuOpen}
              <div
                class="absolute top-full right-0 z-60 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
                role="menu"
              >
                <!-- Game code -->
                <div class="border-b border-gray-100 px-2 py-1 dark:border-gray-800">
                  <button
                    type="button"
                    onclick={copyInviteUrl}
                    title={m.action_copy_link()}
                    class="group flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors hover:bg-gray-50 active:bg-gray-100 dark:hover:bg-gray-800/60 dark:active:bg-gray-800"
                  >
                    <div>
                      <p class="text-xs text-gray-500 dark:text-gray-400">{m.menu_game_code()}</p>
                      <p
                        class="mt-0.5 font-mono text-sm font-bold tracking-widest text-gray-900 dark:text-white"
                      >
                        {data.inviteCode}
                      </p>
                    </div>
                    <span
                      class="ml-2 shrink-0 text-xs text-gray-400 transition-colors group-hover:text-gray-600 dark:text-gray-500 dark:group-hover:text-gray-300"
                    >
                      {#if codeCopied}
                        <span class="text-green-600 dark:text-green-400">{m.menu_copied()}</span>
                      {:else}
                        {m.menu_copy_link()}
                      {/if}
                    </span>
                  </button>
                </div>

                <!-- Rules link -->
                <div class="border-b border-gray-100 px-2 py-1 dark:border-gray-800">
                  <a
                    href={resolve('/rules')}
                    role="menuitem"
                    onclick={() => (menuOpen = false)}
                    title="{m.menu_rules()}}"
                    class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800/60"
                  >
                    <span class="iconify heroicons--book-open-20-solid size-4"></span>
                    {m.menu_rules()}
                  </a>
                </div>

                <!-- View all boards -->
                <div class="border-b border-gray-100 px-2 py-1 dark:border-gray-800">
                  <a
                    href={resolve('/[inviteCode]/boards', { inviteCode: data.inviteCode })}
                    role="menuitem"
                    onclick={() => (menuOpen = false)}
                    title="{m.menu_boards()}}"
                    class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800/60"
                  >
                    <span class="iconify heroicons--squares-2x2-20-solid size-4"></span>
                    {m.menu_boards()}
                  </a>
                </div>

                <!-- Active games overview -->
                <div class="px-2 py-1">
                  <a
                    href={resolve('/games')}
                    role="menuitem"
                    onclick={() => (menuOpen = false)}
                    title={m.menu_active_games()}
                    class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800/60"
                  >
                    <span class="iconify heroicons--rectangle-stack-20-solid size-4"></span>
                    {m.menu_active_games()}
                  </a>
                </div>

                <div class="mx-3 mt-2 mb-1 border-t border-gray-200 dark:border-gray-700"></div>

                <!-- Sound toggle -->
                <div class="border-b border-gray-100 px-2 py-1 dark:border-gray-800">
                  <button
                    type="button"
                    role="menuitem"
                    onclick={() => {
                      muted = toggleMute()
                    }}
                    title={muted ? m.menu_sounds_on() : m.menu_sounds_off()}
                    class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800/60"
                  >
                    <span
                      class="iconify size-4 {muted
                        ? 'heroicons--speaker-x-mark-20-solid'
                        : 'heroicons--speaker-wave-20-solid'}"
                    ></span>
                    {muted ? m.menu_sounds_off() : m.menu_sounds_on()}
                  </button>
                </div>

                <!-- Push notifications toggle -->
                <PushNotificationToggle
                  class="border-b border-gray-100 px-2 py-1 dark:border-gray-800"
                />

                <!-- Reactions toggle -->
                <div class="border-b border-gray-100 px-2 py-1 dark:border-gray-800">
                  <button
                    type="button"
                    role="menuitem"
                    onclick={() => {
                      reactionsEnabled = !reactionsEnabled
                      setReactionsEnabled(reactionsEnabled)
                    }}
                    title={reactionsEnabled ? m.menu_reactions_off() : m.menu_reactions_on()}
                    class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800/60"
                  >
                    <span
                      class="iconify size-4 {reactionsEnabled
                        ? 'heroicons--face-smile-20-solid'
                        : 'heroicons--face-frown-20-solid'}"
                    ></span>
                    {reactionsEnabled ? m.menu_reactions_on() : m.menu_reactions_off()}
                  </button>
                </div>

                <!-- Theme switch -->
                <div class="px-2 py-1">
                  <ThemeSwitch
                    class="w-full text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800/60"
                  />
                </div>

                <div class="mx-3 mt-1 mb-2 border-t border-gray-200 dark:border-gray-700"></div>

                <!-- Debug (dev only) -->
                {#if data.dev && isMyTurn && turnStatus != null && turnStatus !== 'completed' && turnStatus !== 'forfeited' && turnStatus !== 'bust'}
                  {#if debugOpen}
                    <div class="border-b border-gray-100 px-3 py-3 dark:border-gray-800">
                      <p
                        class="mb-2 text-xs font-semibold tracking-wide text-amber-600 dark:text-amber-400"
                      >
                        {m.menu_debug()}
                      </p>
                      <div class="mb-3 grid grid-cols-6 gap-1">
                        {#each debugDice as dieVal, i (i)}
                          <div class="flex flex-col items-center gap-0.5">
                            <label
                              for="debug-die-{i}"
                              class="text-xs text-gray-400 dark:text-gray-500">{i + 1}</label
                            >
                            <input
                              id="debug-die-{i}"
                              type="text"
                              inputmode="numeric"
                              maxlength="1"
                              value={dieVal}
                              onfocus={(e) => (e.target as HTMLInputElement).select()}
                              onkeydown={(e) => {
                                const key = e.key
                                if (/^[1-6]$/.test(key)) {
                                  e.preventDefault()
                                  debugDice[i] = parseInt(key, 10)
                                  const next = document.getElementById(`debug-die-${i + 1}`)
                                  if (next) (next as HTMLInputElement).focus()
                                } else if (
                                  key !== 'Tab' &&
                                  key !== 'Backspace' &&
                                  key !== 'ArrowLeft' &&
                                  key !== 'ArrowRight'
                                ) {
                                  e.preventDefault()
                                }
                              }}
                              class="w-full rounded border border-gray-200 bg-white py-1 text-center text-sm font-bold text-gray-900 focus:border-amber-400 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                            />
                          </div>
                        {/each}
                      </div>
                      <div class="flex gap-2">
                        <button
                          type="button"
                          onclick={applyDebugDice}
                          disabled={debugApplying}
                          class="flex-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-400 active:scale-[0.97] disabled:opacity-50"
                        >
                          {m.debug_set_dice()}
                        </button>
                        <button
                          type="button"
                          onclick={() => (debugOpen = false)}
                          class="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 active:scale-[0.97] dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                        >
                          {m.action_cancel()}
                        </button>
                      </div>
                      <div class="mt-2 flex gap-2">
                        <button
                          type="button"
                          onclick={() => debugForceWin('me')}
                          class="flex-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-green-500 active:scale-[0.97]"
                        >
                          {m.debug_win()}
                        </button>
                        <button
                          type="button"
                          onclick={() => debugForceWin('opponent')}
                          class="flex-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-500 active:scale-[0.97]"
                        >
                          {m.debug_lose()}
                        </button>
                      </div>
                    </div>
                  {:else}
                    <div class="border-b border-gray-100 px-2 py-1 dark:border-gray-800">
                      <button
                        type="button"
                        role="menuitem"
                        onclick={() => (debugOpen = true)}
                        title={m.menu_debug()}
                        class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-amber-600 transition-colors hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/40"
                      >
                        <span class="iconify heroicons--wrench-20-solid size-4"></span>
                        {m.menu_debug()}
                      </button>
                    </div>
                  {/if}
                {/if}

                <!-- Leave game -->
                {#if confirmLeave}
                  <div class="px-4 py-3">
                    <p class="mb-2 text-xs font-medium text-gray-700 dark:text-gray-300">
                      {m.menu_leave_confirm()}
                    </p>
                    <div class="flex gap-2">
                      <form method="POST" action="?/leave" class="flex-1">
                        <Button
                          type="submit"
                          variant="danger"
                          class="w-full rounded-lg px-3 py-1.5 text-xs font-medium"
                        >
                          {m.action_leave()}
                        </Button>
                      </form>
                      <Button
                        type="button"
                        variant="ghost"
                        onclick={() => (confirmLeave = false)}
                        class="flex-1 rounded-lg border-gray-200 px-3 py-1.5 text-xs font-medium dark:border-gray-700"
                      >
                        {m.action_cancel()}
                      </Button>
                    </div>
                  </div>
                {:else}
                  <div class="px-2 py-1">
                    <button
                      type="button"
                      role="menuitem"
                      onclick={() => (confirmLeave = true)}
                      title={m.action_leave_game()}
                      class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                    >
                      <span class="iconify heroicons--arrow-right-on-rectangle-20-solid size-4"
                      ></span>
                      {m.action_leave_game()}
                    </button>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        </header>

        <!-- Spacer: collapses first as screen height shrinks, pushing board toward center on large screens -->
        <div class="min-h-0 flex-1" aria-hidden="true"></div>

        <!-- Board: shrinks via aspect-ratio when height is the constraint (no overflow-hidden so shadow is visible) -->
        <div
          class="flex min-h-0 shrink grow-0 items-center justify-center py-2"
          bind:this={boardEl}
        >
          <GameBoard
            board={data.board}
            staged={data.staged}
            {lockedTarget}
            colors={[...viewedColors]}
            validTargets={isMyTurn && turnStatus === 'choosing' && lockedTarget === null
              ? validTargetsFromStaged
              : []}
            onTargetSelect={isMyTurn && turnStatus === 'choosing' && lockedTarget === null
              ? submitSelection
              : undefined}
            {submitting}
            muted={data.isSpectator}
            class="max-h-full w-full"
          />
        </div>

        <!-- Spacer: grows to center board vertically in remaining space -->
        <div class="min-h-0 flex-1" aria-hidden="true"></div>
      </div>

      <!-- Wooden table — full viewport width, DiceRoller rests on top -->
      <div class="dice-table w-full flex-none">
        <div class="mx-auto w-full max-w-xl px-4 py-4 md:py-5">
          <DiceRoller
            {dice}
            {canShake}
            shaking={rolling}
            onShake={handleShake}
            selectedIndices={isMyTurn && turnStatus === 'choosing' ? stagedDiceIndices : []}
            onDieClick={isMyTurn && turnStatus === 'choosing' ? toggleDieStage : undefined}
            muted={data.isSpectator}
            clearRow={wouldClearRow}
            {pickTarget}
          />
        </div>
      </div>
    </main>
  {/snippet}
</SpectatorFrame>

<Notification />

{#if isMyTurn && turnStatus === 'pending-end'}
  <div
    class="fixed inset-0 z-50 flex cursor-pointer items-center justify-center bg-black/55"
    onclick={handleEndTurn}
    role="presentation"
  >
    <button
      type="button"
      disabled={submitting}
      class="relative min-h-14 min-w-44 overflow-hidden rounded-xl bg-amber-600 px-8 py-4 text-base font-semibold text-white shadow-xl transition-colors hover:bg-amber-500 active:scale-[0.97] disabled:bg-gray-500 disabled:hover:bg-gray-500"
    >
      {#if endTurnCountdown !== null}
        <span
          class="pointer-events-none absolute inset-0 origin-left bg-amber-800/40"
          style="transform: scaleX({barScale}); transition: transform 5s linear"
        ></span>
      {/if}
      <span class="relative">
        {endTurnCountdown !== null
          ? m.action_end_turn_countdown({ countdown: endTurnCountdown })
          : m.action_end_turn()}
      </span>
    </button>
  </div>
{/if}

{#if data.status === 'waiting'}
  <OverlayBackdrop>
    {#snippet body()}
      <div
        class="mx-4 w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-8 shadow-xl dark:bg-gray-900"
        style="max-height: calc(100dvh - 2rem)"
      >
        <div class="mb-5 flex justify-center">
          <div
            class="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-amber-500 dark:border-gray-700 dark:border-t-amber-400"
          ></div>
        </div>

        <h2 class="text-center text-base font-semibold text-gray-900 dark:text-white">
          {m.game_waiting()}
        </h2>
        <p class="mt-1 text-center text-sm text-gray-500 dark:text-gray-400">
          {m.game_waiting_player_count({ count: data.playerCount, max: data.maxPlayers })}
        </p>

        <div class="mt-4 flex justify-center">
          {#if qrDataUrl}
            <div class="rounded-xl bg-white p-2 shadow-sm">
              <img src={qrDataUrl} alt={m.a11y_qr_code_invite()} width="156" height="156" />
            </div>
          {:else}
            <div class="h-43 w-43 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800"></div>
          {/if}
        </div>

        <div class="mt-4">
          <button
            type="button"
            onclick={copyInviteUrl}
            class="group flex w-full items-center justify-between rounded-xl border border-gray-200 px-4 py-3 transition-colors hover:bg-gray-50 active:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800/60 dark:active:bg-gray-800"
          >
            <p class="font-mono text-xl font-bold tracking-widest text-gray-900 dark:text-white">
              {data.inviteCode}
            </p>
            <span
              class="ml-2 shrink-0 text-xs text-gray-400 transition-colors group-hover:text-gray-600 dark:text-gray-500 dark:group-hover:text-gray-300"
            >
              {#if codeCopied}
                <span class="text-green-600 dark:text-green-400">{m.menu_copied()}</span>
              {:else}
                {m.menu_copy_link()}
              {/if}
            </span>
          </button>
        </div>

        {#if !data.isSpectator}
          <div class="mt-4">
            <form method="POST" action="?/addAi">
              <Button
                type="submit"
                disabled={data.playerCount >= data.maxPlayers}
                variant="ghost"
                class="w-full rounded-xl border border-dashed border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-600 hover:border-gray-400 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-400 dark:hover:border-gray-500 dark:hover:text-gray-300"
              >
                🤖 {m.action_add_ai()}
              </Button>
            </form>
          </div>
        {/if}

        {#if data.initiative && data.playerCount >= data.minPlayers}
          <InitiativeBoard
            initiative={data.initiative}
            players={[data.player, ...data.opponents]}
            currentPlayerId={data.player.id}
            isSpectator={data.isSpectator}
          />
        {/if}

        {#if !data.isSpectator}
          <div class="mt-4">
            <form method="POST" action="?/startGame">
              <Button
                type="submit"
                disabled={!data.initiative?.playerOrder}
                class="w-full rounded-xl px-4 py-3 text-sm font-semibold"
              >
                {m.action_start_game()}
              </Button>
            </form>
          </div>
        {/if}

        <LeaveGameButton action="?/abort" buttonTitle={m.action_abort_game()} class="mt-4" />
      </div>
    {/snippet}
  </OverlayBackdrop>
{/if}

{#if data.status === 'finished' && data.winner}
  {@const winner = data.winner}
  <OverlayBackdrop>
    {#snippet body()}
      <div
        class="mx-4 w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-xl dark:bg-gray-900"
      >
        <div class="mb-4 flex justify-center drop-shadow-sm">
          {#if winner.id === data.player.id}
            <span
              class="iconify heroicons--trophy-20-solid size-14"
              style="background: radial-gradient(ellipse at 38% 28%, #fff9c3 0%, #fde68a 18%, #f59e0b 42%, #d97706 68%, #92400e 100%)"
            ></span>
          {:else}
            <span
              class="iconify heroicons--face-frown-20-solid size-14"
              style="background: linear-gradient(160deg, #fb923c 0%, #ef4444 100%)"
            ></span>
          {/if}
        </div>

        <h2 class="text-3xl font-bold text-gray-900 dark:text-white">
          {winner.id === data.player.id
            ? m.game_you_won()
            : m.game_opponent_won({ name: playerDisplayName(winner) })}
        </h2>

        <div class="mt-6">
          <p
            class="mb-3 text-xs font-semibold tracking-widest text-gray-400 uppercase dark:text-gray-500"
          >
            {m.game_final_scores()}
          </p>
          <div class="space-y-2">
            {#each sortedPlayers as p (p.id)}
              <div
                class="flex items-center justify-between rounded-xl px-4 py-2.5 {p.id === winner.id
                  ? 'bg-amber-50 dark:bg-amber-950/40'
                  : 'bg-gray-50 dark:bg-gray-800/50'}"
              >
                <span
                  class="font-medium {p.id === winner.id
                    ? 'text-amber-700 dark:text-amber-400'
                    : 'text-gray-700 dark:text-gray-300'}"
                >
                  {p.name}{#if p.isAI}
                    <span title={m.a11y_ai_player()}>🤖</span>{/if}
                </span>
                <span class="font-mono text-sm text-gray-600 dark:text-gray-400">
                  {data.scores[p.id] ?? 0}
                </span>
              </div>
            {/each}
          </div>
        </div>

        <!-- {#if true} creates a block scope so {@const} is valid — HTML elements
             like <form> are not accepted as {@const} parents by the Svelte compiler. -->
        {#if true}
          {@const totalPlayers = Object.keys(data.scores).length}
          {@const allVoted = data.restartVoteCount >= totalPlayers}
          {#if totalPlayers > 1}
            <form method="POST" action="?/restart" class="mt-6">
              <Button
                type="submit"
                disabled={data.playerHasVotedRestart}
                class="flex w-full gap-2 rounded-xl px-4 py-3 text-sm font-semibold disabled:cursor-default disabled:bg-amber-600 disabled:opacity-70 disabled:shadow-none"
              >
                <span>{m.action_play_again()}</span>
                {#if !allVoted}
                  <span
                    class="rounded-full bg-amber-500/60 px-2 py-0.5 text-xs font-bold tabular-nums"
                  >
                    {data.restartVoteCount}/{totalPlayers}
                  </span>
                {/if}
              </Button>
            </form>
          {/if}
        {/if}

        <form method="POST" action="?/leave" class="mt-2">
          <Button
            type="submit"
            variant="secondary"
            class="w-full rounded-xl px-4 py-3 text-sm font-semibold"
          >
            {m.nav_back_to_home()}
          </Button>
        </form>
      </div>
    {/snippet}
  </OverlayBackdrop>
{/if}

<style>
  .dice-table {
    background:
      /* top-edge shadow — creates illusion of table depth */
      linear-gradient(to bottom, rgba(0, 0, 0, 0.28) 0%, rgba(0, 0, 0, 0) 18%),
      /* subtle centre highlight — light catching flat surface */
      radial-gradient(
          ellipse 80% 60% at 50% 40%,
          rgba(255, 210, 140, 0.18) 0%,
          rgba(0, 0, 0, 0) 100%
        ),
      /* base wood grain — subtle horizontal bands */
      repeating-linear-gradient(
          180deg,
          transparent 0px,
          transparent 18px,
          rgba(0, 0, 0, 0.03) 18px,
          rgba(0, 0, 0, 0.03) 20px
        ),
      /* wood colour — warm brown, darker at side edges */
      linear-gradient(
          to right,
          #2e1505 0%,
          #4a2210 7%,
          #6b3a18 18%,
          #7d4820 35%,
          #8a5228 50%,
          #7d4820 65%,
          #6b3a18 82%,
          #4a2210 93%,
          #2e1505 100%
        );
    box-shadow: inset 0 4px 0 rgba(255, 200, 100, 0.15);
  }
</style>

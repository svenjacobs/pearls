<!--
  SpectatorFrame — overlay shown when the user is spectating another player's
  turn. Renders the supplied `body` content as-is and, when `active` is true,
  overlays a red dashed recording border plus a player-name banner centred on
  the board's top edge.

  The overlay is always present in the DOM (toggled by the `hidden` Tailwind
  utility) so the wrapped body never re-mounts when spectator mode flips.
-->
<script lang="ts">
  import type { Snippet } from 'svelte'

  import * as m from '$lib/paraglide/messages.js'
  import type { ReactionType } from '$lib/reactions'

  import ReactionFab from './ReactionFab.svelte'

  type Props = {
    /** Whether the recording border and banner are visible. */
    active?: boolean
    /** Content rendered beneath the overlay. */
    body: Snippet
    /** Player name shown in the banner. Only rendered when active. */
    playerName?: string
    /** Board wrapper element used to position the banner on its top edge. */
    boardEl?: Element | null
    /** Called when the spectator selects an emoji reaction. Only shown when active. */
    onreact?: (type: ReactionType) => void
  }

  let { active = false, body, playerName, boardEl, onreact }: Props = $props()

  let bannerTop = $state<number | null>(null)

  $effect(() => {
    if (!active || !boardEl) {
      bannerTop = null
      return
    }
    const measure = () => {
      bannerTop = (boardEl as Element).getBoundingClientRect().top
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(boardEl as Element)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  })
</script>

{@render body()}

<div
  class="camera-overlay pointer-events-none fixed inset-0 z-50"
  class:hidden={!active}
  aria-hidden="true"
></div>

{#if active && playerName && bannerTop !== null}
  <div
    class="pointer-events-none fixed left-1/2 z-50 -translate-x-1/2 -translate-y-1/2"
    style="top: {bannerTop + 8}px"
    aria-hidden="true"
  >
    <div
      class="flex max-w-xs min-w-40 items-center gap-2 rounded-md bg-black/65 px-4 py-2 font-mono text-sm tracking-wider text-white backdrop-blur-sm md:text-base"
    >
      <span
        class="block size-2 shrink-0 animate-pulse rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.9)]"
      ></span>
      <span class="min-w-0 truncate uppercase">{m.spectator_watching({ name: playerName })}</span>
    </div>
  </div>
{/if}

{#if active && onreact}
  <ReactionFab {onreact} />
{/if}

<style>
  /*
    Dashed border for the recording frame.
    Composed from four separate repeating-linear-gradients, one per edge.
    Cycle (24px): 16px dash · 8px gap.
    CSS's native `border-style: dashed` cannot be applied to an overlay div
    without affecting layout, so the gradient approach is used here.
  */
  .camera-overlay {
    --dash: #dc2626;
    background:
      repeating-linear-gradient(90deg, var(--dash) 0 16px, transparent 16px 24px) top / 100% 4px
        no-repeat,
      repeating-linear-gradient(90deg, var(--dash) 0 16px, transparent 16px 24px) bottom / 100% 4px
        no-repeat,
      repeating-linear-gradient(0deg, var(--dash) 0 16px, transparent 16px 24px) left / 4px 100%
        no-repeat,
      repeating-linear-gradient(0deg, var(--dash) 0 16px, transparent 16px 24px) right / 4px 100%
        no-repeat;
  }
</style>

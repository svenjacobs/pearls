<!--
  ReactionFab — floating action button (FAB) for spectators to send emoji
  reactions. Positioned fixed at the bottom-right of the screen.

  Tapping the main button opens a compact emoji picker panel. Selecting an
  emoji calls `onreact(type)`; the picker stays open until the user taps the
  X button or clicks outside the FAB area.
-->
<script lang="ts">
  import * as m from '$lib/paraglide/messages.js'
  import { REACTION_TYPES, REACTIONS, type ReactionType } from '$lib/reactions'

  type Props = {
    onreact: (type: ReactionType) => void
  }

  let { onreact }: Props = $props()

  let pickerOpen = $state(false)
  let fabEl = $state<HTMLElement | null>(null)

  const togglePicker = () => {
    pickerOpen = !pickerOpen
  }

  const sendReaction = (type: ReactionType) => {
    onreact(type)
    // Keep picker open — closes only on outside click or X button
  }

  // Close picker when clicking outside the FAB + picker area.
  $effect(() => {
    if (!pickerOpen) return
    const close = (e: MouseEvent) => {
      if (!fabEl?.contains(e.target as Node)) pickerOpen = false
    }
    window.addEventListener('click', close, true)
    return () => window.removeEventListener('click', close, true)
  })
</script>

<div class="fixed right-5 bottom-5 z-50 flex flex-col items-end gap-2" bind:this={fabEl}>
  <!-- Emoji picker panel (floats above the FAB) -->
  {#if pickerOpen}
    <div
      class="flex items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-2 shadow-lg dark:border-gray-700 dark:bg-gray-900"
      role="menu"
      aria-label={m.spectator_react()}
    >
      {#each REACTION_TYPES as type (type)}
        {@const emoji = REACTIONS[type]}
        <button
          type="button"
          class="flex min-h-11 min-w-11 items-center justify-center rounded-full text-2xl transition-transform hover:scale-125 active:scale-110 active:bg-black/10 dark:active:bg-white/10"
          aria-label={m.a11y_send_reaction({ emoji })}
          role="menuitem"
          onclick={() => sendReaction(type)}
        >
          {emoji}
        </button>
      {/each}
    </div>
  {/if}

  <!-- Main FAB button -->
  <button
    type="button"
    class="flex min-h-16 min-w-16 items-center justify-center rounded-full bg-white text-3xl shadow-lg transition-transform hover:scale-105 active:scale-95 dark:bg-gray-800"
    aria-label={pickerOpen ? m.a11y_reaction_picker_close() : m.a11y_reaction_picker_open()}
    aria-expanded={pickerOpen}
    onclick={togglePicker}
  >
    {#if pickerOpen}
      <span class="iconify heroicons--x-mark-20-solid size-6 text-gray-600 dark:text-gray-300"
      ></span>
    {:else}
      🙂
    {/if}
  </button>
</div>

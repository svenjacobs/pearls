<script lang="ts">
  import * as m from '$lib/paraglide/messages.js'

  // Unobtrusive banner shown while the SSE stream is disconnected and the client
  // is attempting to reconnect. Pinned to the top, works in light and dark mode.
  let { show }: { show: boolean } = $props()
</script>

{#if show}
  <div
    role="status"
    aria-live="polite"
    class="fixed inset-x-0 top-0 z-9999 flex items-center justify-center gap-2 bg-amber-500/95 px-4 py-2 text-sm font-medium text-white shadow-md dark:bg-amber-600/95"
  >
    <span class="iconify heroicons--arrow-path-20-solid size-4 animate-spin"></span>
    {m.game_reconnecting()}
  </div>
{/if}

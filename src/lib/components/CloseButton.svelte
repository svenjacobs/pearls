<script lang="ts">
  import { goto } from '$app/navigation'
  import { resolve } from '$app/paths'
  import * as m from '$lib/paraglide/messages.js'

  let fired = false

  const handleClose = () => {
    if (fired) return
    fired = true
    if (history.length > 1) {
      history.back()
    } else {
      goto(resolve('/'))
    }
  }

  // Pressing Escape triggers the same back-navigation as clicking the button.
  $effect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  })
</script>

<button
  type="button"
  onclick={handleClose}
  aria-label={m.nav_close()}
  class="flex size-10 items-center justify-center rounded-full bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-900 active:scale-95 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
>
  <span class="iconify heroicons--x-mark-20-solid size-5"></span>
</button>

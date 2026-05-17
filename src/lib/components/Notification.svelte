<script lang="ts">
  import { cubicOut } from 'svelte/easing'
  import { fade, fly } from 'svelte/transition'

  import { notification } from '$lib/notification.svelte'

  const config = {
    info: {
      icon: 'heroicons--information-circle-20-solid',
      bubble: 'bg-gray-900 dark:bg-gray-100',
      text: 'text-white dark:text-gray-900',
      ic: 'text-sky-300 dark:text-sky-600',
    },
    warning: {
      icon: 'heroicons--exclamation-triangle-20-solid',
      bubble: 'bg-amber-900 dark:bg-amber-100',
      text: 'text-white dark:text-amber-900',
      ic: 'text-amber-300 dark:text-amber-600',
    },
    error: {
      icon: 'heroicons--x-circle-20-solid',
      bubble: 'bg-red-900 dark:bg-red-100',
      text: 'text-white dark:text-red-900',
      ic: 'text-red-300 dark:text-red-400',
    },
  } as const

  let barScale = $state(1)
  let barTransition = $state(false)

  $effect(() => {
    const item = notification.current
    barScale = 1
    barTransition = false
    if (!item?.duration) return
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => {
        barTransition = true
        barScale = 0
      })
    })
    return () => cancelAnimationFrame(raf)
  })
</script>

{#if notification.current}
  {@const item = notification.current}
  {@const c = config[item.type]}
  <div
    class="fixed top-4 left-1/2 z-9999 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2"
    in:fly={{ y: -64, duration: 280, easing: cubicOut }}
    out:fly={{ y: -64, duration: 220, easing: cubicOut }}
  >
    <button
      type="button"
      class="relative flex min-w-[min(24rem,calc(100vw-2rem))] cursor-pointer items-center gap-3 overflow-hidden rounded-3xl px-5 py-3 shadow-sm transition-colors duration-300 {c.bubble}"
      onclick={() => notification.dismiss()}
    >
      {#if item.duration !== null}
        <span
          class="pointer-events-none absolute inset-0 origin-left bg-white/5 dark:bg-black/5"
          style="transform: scaleX({barScale}); {barTransition
            ? `transition: transform ${item.duration}ms linear`
            : ''}"
        ></span>
      {/if}
      <span class="iconify {c.icon} {c.ic} size-5 shrink-0 transition-colors duration-300"></span>
      <div class="grid flex-1">
        {#key item.id}
          <p
            class="text-center text-sm leading-snug font-medium transition-colors duration-300 [grid-area:1/1] {c.text}"
            in:fade={{ duration: 200 }}
            out:fade={{ duration: 150 }}
          >
            {item.text}
          </p>
        {/key}
      </div>
    </button>
  </div>
{/if}

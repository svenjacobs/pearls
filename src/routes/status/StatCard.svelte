<script lang="ts">
  import { cubicOut } from 'svelte/easing'
  import { fly } from 'svelte/transition'

  let { value, label }: { value: number; label: string } = $props()

  let direction = $state(1)
  let lastValue = $state<number | undefined>(undefined)

  $effect.pre(() => {
    if (lastValue !== undefined) direction = value >= lastValue ? 1 : -1
    lastValue = value
  })
</script>

<div
  class="flex min-w-52 flex-col items-center gap-2 rounded-xl border border-gray-200 p-10 dark:border-gray-700"
>
  <span class="text-center text-sm text-gray-500 dark:text-gray-400">{label}</span>
  <div class="relative overflow-hidden">
    <span class="invisible text-5xl font-bold tabular-nums sm:text-7xl" aria-hidden="true"
      >{value}</span
    >
    {#key value}
      <span
        class="absolute inset-0 flex items-center justify-center text-5xl font-bold text-gray-900 tabular-nums sm:text-7xl dark:text-white"
        in:fly={{ y: direction * 40, duration: 300, easing: cubicOut }}
        out:fly={{ y: direction * -40, duration: 300, easing: cubicOut }}>{value}</span
      >
    {/key}
  </div>
</div>

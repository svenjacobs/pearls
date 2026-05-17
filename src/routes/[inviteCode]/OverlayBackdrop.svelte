<script lang="ts">
  import type { Snippet } from 'svelte'

  type Props = {
    body: Snippet
  }

  let { body }: Props = $props()
</script>

<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-white/60 backdrop-blur-sm dark:bg-gray-950/70"
>
  {@render body()}
</div>

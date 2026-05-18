<script lang="ts">
  import { resolve } from '$app/paths'
</script>

<footer class="py-4 text-center text-xs text-gray-400 select-none dark:text-gray-600">
  Powered by <a
    href="https://github.com/svenjacobs/pearls"
    target="_blank"
    rel="noopener noreferrer"
    class="text-amber-600 transition-colors hover:underline active:underline dark:text-amber-500"
    >Pearls</a
  >
  &bull; {__APP_VERSION__}
  &bull;
  <a
    href={resolve('/status')}
    class="text-amber-600 transition-colors hover:underline active:underline dark:text-amber-500"
    >Status</a
  >
</footer>

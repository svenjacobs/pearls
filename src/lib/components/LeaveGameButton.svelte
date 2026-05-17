<!--
  LeaveGameButton — two-step danger confirmation for leaving or aborting a game.
  First click reveals a confirm / discard row; confirming POSTs to the given action.
  Used on the /games overview (leave, with sessionId) and in the waiting lobby (abort).
-->
<script lang="ts">
  import Button from '$lib/components/Button.svelte'
  import * as m from '$lib/paraglide/messages.js'

  type Props = {
    action: string
    buttonTitle: string
    sessionId?: string
    class?: string
  }

  let { action, buttonTitle, sessionId, class: className = '' }: Props = $props()

  let confirming = $state(false)
</script>

<div class={className}>
  {#if confirming}
    <div class="grid grid-cols-2 gap-2">
      <form method="POST" {action}>
        {#if sessionId}
          <input type="hidden" name="sessionId" value={sessionId} />
        {/if}
        <Button
          type="submit"
          variant="danger"
          class="w-full rounded-xl px-4 py-2.5 text-sm font-semibold"
        >
          {m.action_confirm()}
        </Button>
      </form>
      <Button
        type="button"
        variant="ghost"
        onclick={() => (confirming = false)}
        class="rounded-xl border-gray-200 px-4 py-2.5 text-sm font-medium dark:border-gray-700"
      >
        {m.action_discard()}
      </Button>
    </div>
  {:else}
    <Button
      type="button"
      variant="danger-ghost"
      onclick={() => (confirming = true)}
      class="w-full rounded-xl border-red-200 px-4 py-2.5 text-sm font-medium hover:border-red-200 dark:border-red-900/50 dark:hover:border-red-900/50 dark:hover:bg-red-950/40"
    >
      {buttonTitle}
    </Button>
  {/if}
</div>

<script lang="ts">
  import { resolve } from '$app/paths'
  import Button from '$lib/components/Button.svelte'
  import Footer from '$lib/components/Footer.svelte'
  import GameEntryForm from '$lib/components/GameEntryForm.svelte'
  import * as m from '$lib/paraglide/messages.js'
  import { MAX_NAME_LENGTH } from '$lib/playerName'

  import type { ActionData, PageData } from './$types'

  let { data, form }: { data: PageData; form: ActionData } = $props()

  const nameTakenData = $derived(
    form?.error === 'name_taken'
      ? (form as { error: 'name_taken'; enteredName: string; suggestion: string })
      : null,
  )
  const formError = $derived(
    nameTakenData
      ? m.error_name_taken()
      : form?.error === 'name_too_long'
        ? m.error_name_too_long()
        : undefined,
  )
  const formSuggestion = $derived(nameTakenData?.suggestion)
  const formInitialName = $derived(nameTakenData?.enteredName)
</script>

<svelte:head>
  <title>Pearls ({data.inviteCode})</title>
</svelte:head>

<div class="flex min-h-svh flex-col">
  {#if data.mode === 'full'}
    <main class="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div class="flex w-full max-w-sm flex-col items-center gap-8 text-center">
        <span class="iconify heroicons--lock-closed-solid size-12 text-gray-400 dark:text-gray-500"
        ></span>

        <div class="flex flex-col gap-2">
          <h1 class="font-display text-2xl font-bold text-gray-900 dark:text-white">
            {m.join_full_heading()}
          </h1>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            {m.join_full_detail()}
          </p>
        </div>

        <Button href={resolve('/')} class="min-h-11 w-full rounded-xl px-6 py-3 text-sm font-bold">
          {m.action_new_game()}
        </Button>
      </div>
    </main>
  {:else}
    <GameEntryForm
      title={m.form_join_game_title()}
      inviteCode={data.inviteCode}
      inviteUrl={data.inviteUrl}
      buttonText={m.action_join_game()}
      action="?/join"
      error={formError}
      suggestion={formSuggestion}
      initialName={formInitialName}
      maxNameLength={MAX_NAME_LENGTH}
    />
  {/if}
  <Footer />
</div>

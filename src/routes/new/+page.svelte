<script lang="ts">
  import Footer from '$lib/components/Footer.svelte'
  import GameEntryForm from '$lib/components/GameEntryForm.svelte'
  import * as m from '$lib/paraglide/messages.js'
  import { MAX_NAME_LENGTH } from '$lib/player-name'

  import type { ActionData, PageData } from './$types'

  let { data, form }: { data: PageData; form: ActionData } = $props()

  const formError = $derived(form?.error === 'name_too_long' ? m.error_name_too_long() : undefined)
</script>

<div class="flex min-h-svh flex-col">
  <GameEntryForm
    title={m.form_new_game_title()}
    inviteCode={data.inviteCode}
    inviteUrl={data.inviteUrl}
    buttonText={m.action_start_game()}
    error={formError}
    maxNameLength={MAX_NAME_LENGTH}
  />
  <Footer />
</div>

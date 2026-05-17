<script lang="ts">
  import Footer from '$lib/components/Footer.svelte'
  import GameEntryForm from '$lib/components/GameEntryForm.svelte'
  import * as m from '$lib/paraglide/messages.js'

  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()
</script>

<div class="flex min-h-svh flex-col">
  <GameEntryForm
    title={m.form_new_game_title()}
    inviteCode={data.inviteCode}
    inviteUrl={data.inviteUrl}
    buttonText={m.action_start_game()}
  />
  <Footer />
</div>

<!--
  GameEntryForm — full-page entry screen for joining or creating a game.
  Displays the invite code, a copyable invite URL, and a name-input form that
  submits via a SvelteKit POST action. Used by both the new-game and join-game
  routes; the title and button label are supplied as props.
-->
<script lang="ts">
  import { copyToClipboard } from '$lib/clipboard'
  import Button from '$lib/components/Button.svelte'
  import CloseButton from '$lib/components/CloseButton.svelte'
  import PearlThemePicker from '$lib/components/PearlThemePicker.svelte'
  import * as m from '$lib/paraglide/messages.js'
  import { getPlayerName, setPlayerName } from '$lib/storage'

  interface Props {
    title: string
    inviteCode: string
    inviteUrl: string
    buttonText: string
    /** Form action to use. Omit to use the default action. */
    action?: string
    /** Validation error to display below the name input. */
    error?: string
    /** Suggested alternative name shown as a clickable link in the error. */
    suggestion?: string
    /** Pre-fills the name input (used to restore the value after a failed submission). */
    initialName?: string
  }

  let { title, inviteCode, inviteUrl, buttonText, action, error, suggestion, initialName }: Props =
    $props()

  // svelte-ignore state_referenced_locally
  let nameValue = $state(initialName ?? '')
  let copied = $state(false)

  // On mount, prefill from localStorage when no server-provided initial name is present
  // (i.e. fresh visit, not a failed-submission restore).
  // $effect runs only in the browser, so localStorage access is safe here.
  $effect(() => {
    if (initialName) return
    const saved = getPlayerName()
    if (saved) nameValue = saved
  })

  // Persist the name the user types so it can be prefilled next time.
  // Using oninput (rather than $effect) ensures we only save real user input:
  // programmatic assignments (e.g. clicking the suggestion) do not fire oninput.
  const handleNameInput = () => {
    const trimmed = nameValue.trim()
    setPlayerName(trimmed)
  }

  const urlSplit = $derived(
    (() => {
      const i = inviteUrl.lastIndexOf('/')
      return i === -1
        ? { head: inviteUrl, tail: '' }
        : { head: inviteUrl.slice(0, i + 1), tail: inviteUrl.slice(i + 1) }
    })(),
  )

  const handleCopy = async () => {
    await copyToClipboard(inviteUrl)
    copied = true
    setTimeout(() => (copied = false), 2_000)
  }
</script>

<main class="flex flex-1 flex-col items-center justify-center p-6">
  <div class="flex w-full max-w-sm flex-col gap-4">
    <div class="flex justify-end">
      <CloseButton />
    </div>
    <form method="POST" {action} class="flex w-full flex-col items-center gap-10">
      <h1 class="font-display text-4xl font-bold tracking-wide text-gray-900 dark:text-white">
        {title}
      </h1>

      <div class="flex w-full flex-col gap-3">
        <label
          for="name"
          class="text-xs font-semibold tracking-widest text-gray-500 uppercase dark:text-gray-400"
        >
          {m.form_your_name_label()}
        </label>
        <input
          id="name"
          name="name"
          type="text"
          placeholder={m.form_your_name_placeholder()}
          required
          bind:value={nameValue}
          oninput={handleNameInput}
          class="w-full rounded-xl bg-gray-100 px-5 py-4 text-xl text-gray-900 placeholder-gray-400 transition-colors outline-none hover:bg-gray-200 focus:ring-2 focus:ring-amber-500 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500 dark:hover:bg-gray-700
               {error ? 'ring-2 ring-red-500' : ''}"
        />
        {#if error}
          <p class="text-sm text-red-600 dark:text-red-400">{error}</p>
          {#if suggestion}
            <p class="text-sm text-gray-500 dark:text-gray-400">
              {m.error_name_taken_suggestion()}
              <button
                type="button"
                class="font-medium text-amber-600 underline hover:no-underline dark:text-amber-400"
                onclick={() => (nameValue = suggestion)}>{suggestion}</button
              >
            </p>
          {/if}
        {/if}
      </div>

      <PearlThemePicker />

      <div class="flex w-full flex-col items-center gap-2">
        <p class="text-xs font-semibold tracking-widest text-gray-500 uppercase dark:text-gray-400">
          {m.form_invite_code_label()}
        </p>
        <p class="font-mono text-5xl font-bold tracking-widest text-amber-500 dark:text-amber-400">
          {inviteCode}
        </p>
        <div
          class="mt-1 flex w-full flex-col gap-3 rounded-xl border border-dashed border-gray-300 px-4 py-3 dark:border-gray-600"
        >
          <p class="text-xs text-gray-500 dark:text-gray-400">
            {m.form_share_link_hint()}
          </p>
          <div class="flex min-w-0 font-mono text-sm text-gray-600 dark:text-gray-300">
            <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"
              >{urlSplit.head}</span
            >
            <span class="shrink-0">{urlSplit.tail}</span>
          </div>
          <Button
            variant="secondary"
            type="button"
            onclick={handleCopy}
            class="min-h-11 w-full gap-1.5 rounded-lg bg-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-300 hover:text-gray-900 dark:bg-gray-700 dark:hover:bg-gray-600 dark:hover:text-white"
          >
            {#if copied}
              <span class="iconify heroicons--check-20-solid size-4 text-green-500"></span>
              {m.action_copied()}
            {:else}
              <span class="iconify heroicons--clipboard-20-solid size-4"></span>
              {m.action_copy_link()}
            {/if}
          </Button>
        </div>
      </div>

      <input type="hidden" name="inviteCode" value={inviteCode} />

      <Button type="submit" class="min-h-11 w-full rounded-xl px-8 py-4 text-xl font-bold">
        {buttonText}
      </Button>
    </form>
  </div>
</main>

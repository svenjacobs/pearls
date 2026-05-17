<!--
  ReactionController — manages incoming SSE reaction events and outgoing
  reaction POST requests. Renders the ReactionOverlay when reactions are
  enabled. Exposes onSseReaction and handleReact for the parent to wire up.
-->
<script lang="ts">
  import { notification } from '$lib/notification.svelte'
  import * as m from '$lib/paraglide/messages.js'
  import { REACTIONS, type ReactionType } from '$lib/reactions'

  import type { FloatingReaction } from './ReactionOverlay.svelte'
  import ReactionOverlay from './ReactionOverlay.svelte'

  type Props = {
    reactionsEnabled: boolean
  }

  let { reactionsEnabled }: Props = $props()

  let activeReactions = $state<FloatingReaction[]>([])
  let reactionCounter = 0

  export function onSseReaction(e: Event) {
    const evt = JSON.parse((e as MessageEvent<string>).data) as {
      emoji: string
      type: ReactionType
    }
    const emoji = evt.emoji ?? REACTIONS[evt.type]
    if (!emoji) return
    const id = String(++reactionCounter)
    const left = 10 + Math.random() * 75
    activeReactions = [...activeReactions, { id, emoji, left }]
    setTimeout(() => {
      activeReactions = activeReactions.filter((r) => r.id !== id)
    }, 3_500)
  }

  export async function handleReact(type: ReactionType) {
    const res = await fetch('/api/game/reaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type }),
    }).catch(() => null)
    if (!res || (!res.ok && res.status !== 429)) {
      notification.notify(m.spectator_reaction_failed(), 'error', null)
    }
  }
</script>

{#if reactionsEnabled}
  <ReactionOverlay reactions={activeReactions} />
{/if}

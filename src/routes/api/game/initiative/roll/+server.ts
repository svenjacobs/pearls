import { error, json } from '@sveltejs/kit'

import { triggerAiInitiativeIfNeeded } from '$lib/server/ai/runner'
import { performInitiativeRoll } from '$lib/server/game/service'
import { requireSession } from '$lib/server/request-guards'

import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ cookies }) => {
  const session = await requireSession(cookies)
  try {
    const initiative = await performInitiativeRoll(session.gameId, session.playerId)
    void triggerAiInitiativeIfNeeded(session.gameId, initiative)
    return json({ initiative })
  } catch (e) {
    error(409, e instanceof Error ? e.message : 'Initiative roll failed')
  }
}

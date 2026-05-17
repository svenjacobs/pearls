import { error, json } from '@sveltejs/kit'

import { performEndTurn } from '$lib/server/game/service'
import { requireSession } from '$lib/server/request-guards'

import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ cookies }) => {
  const session = await requireSession(cookies)
  try {
    const status = await performEndTurn(session.gameId, session.playerId)
    return json({ ok: true, status })
  } catch (e) {
    error(409, e instanceof Error ? e.message : 'End turn failed')
  }
}

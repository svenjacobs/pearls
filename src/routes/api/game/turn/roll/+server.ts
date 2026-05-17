import { error, json } from '@sveltejs/kit'

import { performRoll } from '$lib/server/game/service'
import { requireSession } from '$lib/server/request-guards'

import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ cookies }) => {
  const session = await requireSession(cookies)
  try {
    const result = await performRoll(session.gameId, session.playerId)
    return json({ ok: true, ...result })
  } catch (e) {
    error(409, e instanceof Error ? e.message : 'Roll failed')
  }
}

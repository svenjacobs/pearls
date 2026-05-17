import { error, json } from '@sveltejs/kit'

import { performSelect } from '$lib/server/game/service'
import { requireSession } from '$lib/server/request-guards'

import type { RequestHandler } from './$types'

type SelectBody = { target?: number; dieIndices?: number[] }

export const POST: RequestHandler = async ({ cookies, request }) => {
  const session = await requireSession(cookies)
  const body = (await request.json().catch(() => ({}))) as SelectBody
  if (typeof body.target !== 'number' || !Array.isArray(body.dieIndices)) {
    error(400, 'Invalid body')
  }
  try {
    const result = await performSelect(
      session.gameId,
      session.playerId,
      body.target,
      body.dieIndices,
    )
    return json({ ok: true, ...result })
  } catch (e) {
    error(400, e instanceof Error ? e.message : 'Select failed')
  }
}

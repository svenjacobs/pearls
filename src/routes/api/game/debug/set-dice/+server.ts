import { error, json } from '@sveltejs/kit'

import { publishGameEvent } from '$lib/server/pubsub'
import { turnRepository } from '$lib/server/repository'
import { requireSession, requireTurnForSession } from '$lib/server/request-guards'

import type { RequestHandler } from './$types'

type Body = {
  values?: unknown
}

const ROLLABLE_STATUSES = new Set(['rolling', 'locked', 'choosing'])

/**
 * POST /api/game/debug/set-dice
 *
 * Forces all dice to specified face values for the caller's active turn.
 * Only available in development mode — returns 403 in production.
 *
 * Body: { values: number[] } — exactly 6 integers in the range 1–6.
 */
export const POST: RequestHandler = async ({ cookies, request }) => {
  if (!import.meta.env.DEV) error(403, 'Not available in production')

  const session = await requireSession(cookies)

  const body = (await request.json().catch(() => ({}))) as Body
  const values = body.values

  if (
    !Array.isArray(values) ||
    values.length !== 6 ||
    values.some((v) => typeof v !== 'number' || v < 1 || v > 6 || !Number.isInteger(v))
  ) {
    error(400, 'values must be an array of exactly 6 integers in range 1–6')
  }

  const turn = await requireTurnForSession(session)
  if (!ROLLABLE_STATUSES.has(turn.status))
    error(409, `Cannot set dice while turn is "${turn.status}"`)

  // Override all dice with the specified values.
  turn.dice = values.map((v) => ({ value: v, status: 'active' as const }))
  turn.rolls.push({
    index: turn.rolls.length,
    values,
    slots: [0, 1, 2, 3, 4, 5],
    at: Date.now(),
  })
  turn.status = 'choosing'

  await turnRepository.save(turn)
  await publishGameEvent(turn.gameId, { event: 'turn-rolled', turnId: turn.id })

  return json({ ok: true })
}

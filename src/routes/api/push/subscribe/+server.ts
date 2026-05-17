import { error, json } from '@sveltejs/kit'

import type { PushSubscriptionJSON } from '$lib/server/push/types'
import { pushSubscriptionRepository } from '$lib/server/repository'
import { requireSession } from '$lib/server/request-guards'

import type { RequestHandler } from './$types'

export const POST: RequestHandler = async ({ request, cookies }) => {
  const session = await requireSession(cookies)
  const body: unknown = await request.json()
  if (
    typeof body !== 'object' ||
    body === null ||
    !('endpoint' in body) ||
    typeof (body as Record<string, unknown>).endpoint !== 'string'
  ) {
    error(400, 'Invalid subscription')
  }
  await pushSubscriptionRepository.add(session.playerId, body as PushSubscriptionJSON)
  return json({ ok: true })
}

export const DELETE: RequestHandler = async ({ request, cookies }) => {
  const session = await requireSession(cookies)
  const body: unknown = await request.json()
  if (
    typeof body !== 'object' ||
    body === null ||
    !('endpoint' in body) ||
    typeof (body as Record<string, unknown>).endpoint !== 'string'
  ) {
    error(400, 'Invalid body')
  }
  await pushSubscriptionRepository.removeByEndpoint(
    session.playerId,
    (body as { endpoint: string }).endpoint,
  )
  return json({ ok: true })
}

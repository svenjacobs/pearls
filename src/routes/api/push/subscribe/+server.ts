import { error, json } from '@sveltejs/kit'

import type { PushSubscriptionJSON } from '$lib/server/push/types'
import { pushSubscriptionRepository } from '$lib/server/repository'
import { requireSession } from '$lib/server/request-guards'

import type { RequestHandler } from './$types'
import { isValidPushEndpoint } from './endpoint'

const parseEndpoint = (body: unknown, message: string): string => {
  if (
    typeof body !== 'object' ||
    body === null ||
    !('endpoint' in body) ||
    typeof (body as Record<string, unknown>).endpoint !== 'string'
  ) {
    error(400, message)
  }
  const endpoint = (body as Record<string, unknown>).endpoint as string
  if (!isValidPushEndpoint(endpoint)) {
    error(400, message)
  }
  return endpoint
}

export const POST: RequestHandler = async ({ request, cookies }) => {
  const session = await requireSession(cookies)
  const body: unknown = await request.json()
  parseEndpoint(body, 'Invalid subscription')
  await pushSubscriptionRepository.add(session.playerId, body as PushSubscriptionJSON)
  return json({ ok: true })
}

export const DELETE: RequestHandler = async ({ request, cookies }) => {
  const session = await requireSession(cookies)
  const body: unknown = await request.json()
  const endpoint = parseEndpoint(body, 'Invalid body')

  await pushSubscriptionRepository.removeByEndpoint(session.playerId, endpoint)
  return json({ ok: true })
}

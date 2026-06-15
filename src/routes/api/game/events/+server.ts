import type { GameEvent } from '$lib/server/pubsub'
import { addGameListener } from '$lib/server/pubsub'
import { markPlayerActive, markPlayerInactive } from '$lib/server/push/activity'
import { clearPendingNotification } from '$lib/server/push/pending'
import { requireSession } from '$lib/server/request-guards'

import type { RequestHandler } from './$types'

/**
 * GET /api/game/events
 *
 * Server-Sent Events stream that emits named events each time the game state
 * mutates. The game is identified by resolving the session cookie server-side
 * — the game ID is never exposed to the client.
 *
 * Event types:
 *   - `refresh`  — generic state change; client calls invalidateAll()
 *   - `reaction` — emoji reaction from a spectator; data is the reaction JSON
 *
 * Resilience for mobile / slow connections:
 * - `retry: 2000` tells the browser to reconnect within 2 s after a drop.
 * - `id:` on every refresh event enables `Last-Event-ID` on reconnect so the
 *   server can detect a gap and immediately flush a refresh event.
 * - A 25 s named `heartbeat` event keeps the TCP connection alive through proxies
 *   and firewalls that silently close idle streams, and lets the client observe
 *   liveness (a `:` comment is never surfaced to JS) to drive its own watchdog.
 *
 * Client-side usage:
 *   const es = new EventSource('/api/game/events')
 *   es.addEventListener('refresh', () => invalidateAll())
 *   es.addEventListener('reaction', (e) => handleReaction(JSON.parse(e.data)))
 *   // clean up when done
 *   es.close()
 */
export const GET: RequestHandler = async ({ cookies, request }) => {
  const session = await requireSession(cookies)

  // If the client is reconnecting it sends the id of the last event it saw.
  // We flush a refresh immediately so it catches up on any state it missed.
  const isReconnect = request.headers.has('last-event-id')

  let cleanup: (() => Promise<void>) | undefined
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined
  let closed = false
  // When the client socket is backed up (desiredSize <= 0) we don't buffer
  // another refresh — we coalesce it and flush a single one once `pull` fires.
  // Safe because `refresh` is idempotent: the client always refetches full state.
  let refreshPending = false

  const encoder = new TextEncoder()
  const refreshFrame = () =>
    encoder.encode(`id: ${Date.now()}\nretry: 2000\nevent: refresh\ndata: 1\n\n`)

  const stream = new ReadableStream({
    async start(controller) {
      const hasRoom = () => controller.desiredSize === null || controller.desiredSize > 0

      const sendRefresh = () => {
        if (closed) return
        if (hasRoom()) controller.enqueue(refreshFrame())
        else refreshPending = true
      }

      const sendReaction = (evt: Extract<GameEvent, { event: 'reaction' }>) => {
        // Reactions are cosmetic; drop them under backpressure rather than buffer.
        if (closed || !hasRoom()) return
        controller.enqueue(encoder.encode(`event: reaction\ndata: ${JSON.stringify(evt)}\n\n`))
      }

      const sendHeartbeat = () => {
        if (closed) return
        markPlayerActive(session.gameId, session.playerId)
        clearPendingNotification(session.gameId, session.playerId)
        // Named event (not a `:` comment) so the client can observe liveness.
        if (hasRoom()) controller.enqueue(encoder.encode(`event: heartbeat\ndata: 1\n\n`))
      }

      const listener = await addGameListener(session.gameId, (evt) => {
        if (evt.event === 'reaction') {
          sendReaction(evt)
        } else {
          sendRefresh()
        }
      })
      cleanup = listener.remove

      // Mark the player as actively viewing this game.
      markPlayerActive(session.gameId, session.playerId)

      // Flush stale state immediately on reconnect.
      if (isReconnect) sendRefresh()

      // Keep the connection alive through mobile proxies / firewalls.
      heartbeatTimer = setInterval(sendHeartbeat, 25_000)
    },
    pull(controller) {
      // The consumer drained — flush a coalesced refresh if one is waiting.
      if (closed || !refreshPending) return
      refreshPending = false
      controller.enqueue(refreshFrame())
    },
    async cancel() {
      closed = true
      clearInterval(heartbeatTimer)
      await cleanup?.()
      markPlayerInactive(session.gameId, session.playerId)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      // Prevent proxies / Cloudflare from buffering the stream.
      'X-Accel-Buffering': 'no',
    },
  })
}

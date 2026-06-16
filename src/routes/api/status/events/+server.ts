import { addGlobalGameHook } from '$lib/server/pubsub'

import type { RequestHandler } from './$types'

// In-process fan-out: one callback per connected status SSE client.
const statusListeners = new Set<() => void>()
let removeGlobalHook: (() => void) | null = null

const addStatusListener = (fn: () => void): (() => void) => {
  if (statusListeners.size === 0) {
    removeGlobalHook = addGlobalGameHook(() => {
      statusListeners.forEach((cb) => cb())
    })
  }
  statusListeners.add(fn)
  return () => {
    statusListeners.delete(fn)
    if (statusListeners.size === 0) {
      removeGlobalHook?.()
      removeGlobalHook = null
    }
  }
}

export const GET: RequestHandler = async ({ request }) => {
  // On reconnect the client sends the id of the last event it saw; flush a
  // refresh immediately so it catches up on any state it missed during the gap.
  const isReconnect = request.headers.has('last-event-id')

  let cleanup: (() => void) | undefined
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined
  let closed = false
  // Coalesce refreshes under backpressure — refresh is idempotent (full refetch).
  let refreshPending = false

  const encoder = new TextEncoder()
  const refreshFrame = () =>
    encoder.encode(`id: ${Date.now()}\nretry: 2000\nevent: refresh\ndata: 1\n\n`)

  const stream = new ReadableStream({
    start(controller) {
      const hasRoom = () => controller.desiredSize === null || controller.desiredSize > 0

      const sendRefresh = () => {
        if (closed) return
        if (hasRoom()) controller.enqueue(refreshFrame())
        else refreshPending = true
      }

      const sendHeartbeat = () => {
        if (closed) return
        // Named event (not a `:` comment) so the client can observe liveness.
        if (hasRoom()) controller.enqueue(encoder.encode(`event: heartbeat\ndata: 1\n\n`))
      }

      cleanup = addStatusListener(sendRefresh)
      // Flush a frame immediately so the response headers are sent right away:
      // the browser only fires `open` (and proxies only start streaming) once the
      // first byte arrives. Without this a fresh connection would stall until the
      // first 25 s heartbeat, leaving the client stuck "reconnecting".
      if (isReconnect) sendRefresh()
      else sendHeartbeat()
      heartbeatTimer = setInterval(sendHeartbeat, 25_000)
    },
    pull(controller) {
      if (closed || !refreshPending) return
      refreshPending = false
      controller.enqueue(refreshFrame())
    },
    cancel() {
      closed = true
      clearInterval(heartbeatTimer)
      cleanup?.()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

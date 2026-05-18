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

export const GET: RequestHandler = async () => {
  let cleanup: (() => void) | undefined
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined
  let closed = false

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()

      const sendRefresh = () => {
        if (closed) return
        controller.enqueue(encoder.encode(`retry: 2000\nevent: refresh\ndata: 1\n\n`))
      }

      const sendHeartbeat = () => {
        if (closed) return
        controller.enqueue(encoder.encode(': heartbeat\n\n'))
      }

      cleanup = addStatusListener(sendRefresh)
      heartbeatTimer = setInterval(sendHeartbeat, 25_000)
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

/**
 * Sets up an EventSource connection that automatically reconnects when the
 * browser tab becomes visible again (e.g. after backgrounding on mobile) and
 * when the stream goes silent (a half-open connection the browser never noticed).
 *
 * Designed to be called inside a Svelte `$effect` — the returned cleanup
 * function is forwarded as the effect's destructor:
 *
 * ```ts
 * $effect(() => connectSse('/api/game/events', { onRefresh: () => void invalidateAll() }))
 * // With extra event listeners and connection-state reporting:
 * $effect(() =>
 *   connectSse('/api/game/events', {
 *     onRefresh: () => void invalidateAll(),
 *     extras: { reaction: onReaction },
 *     onConnectionChange: (c) => (connected = c),
 *   }),
 * )
 * ```
 */
export interface SseOptions {
  /**
   * Called on every `refresh` event, whenever the tab becomes visible, and when
   * the watchdog force-reconnects — ensuring state is always up-to-date.
   */
  onRefresh: () => void
  /**
   * Optional map of additional SSE event types to handlers. Re-registered on
   * every reconnect; each invocation also resets the silence watchdog.
   */
  extras?: Record<string, (e: Event) => void>
  /**
   * Optional callback notified when the connection opens (`true`) or errors
   * (`false`). Useful for surfacing a "reconnecting…" indicator.
   */
  onConnectionChange?: (connected: boolean) => void
}

/**
 * Force a reconnect if no frame (event or heartbeat) arrives within this window.
 * The server sends a heartbeat every 25 s, so 60 s leaves comfortable margin
 * while still catching a silently-dead stream the browser failed to drop.
 */
const WATCHDOG_MS = 60_000

export const connectSse = (url: string, options: SseOptions): (() => void) => {
  const { onRefresh, extras, onConnectionChange } = options

  let source: EventSource
  let watchdog: ReturnType<typeof setTimeout> | undefined

  const resetWatchdog = () => {
    clearTimeout(watchdog)
    watchdog = setTimeout(() => {
      // No traffic for WATCHDOG_MS — assume the stream is dead. Recreate it and
      // catch up on any state missed while it was silently broken.
      source.close()
      onRefresh()
      connect()
    }, WATCHDOG_MS)
  }

  const onRefreshFrame = () => {
    resetWatchdog()
    onRefresh()
  }

  const connect = () => {
    source = new EventSource(url)
    source.addEventListener('open', () => {
      onConnectionChange?.(true)
      resetWatchdog()
    })
    source.addEventListener('error', () => onConnectionChange?.(false))
    source.addEventListener('refresh', onRefreshFrame)
    // Named heartbeat is observable (a `:` comment is not surfaced to JS) and
    // keeps the watchdog from firing while the connection is healthy.
    source.addEventListener('heartbeat', resetWatchdog)
    if (extras) {
      for (const [type, handler] of Object.entries(extras)) {
        source.addEventListener(type, (e) => {
          resetWatchdog()
          handler(e)
        })
      }
    }
    resetWatchdog()
  }

  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      clearTimeout(watchdog)
      source.close()
      return
    }
    onRefresh()
    if (source.readyState === EventSource.CLOSED) connect()
    else resetWatchdog()
  }

  connect()
  document.addEventListener('visibilitychange', onVisibilityChange)

  return () => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    clearTimeout(watchdog)
    source.close()
  }
}

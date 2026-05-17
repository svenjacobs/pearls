/**
 * Sets up an EventSource connection that automatically reconnects when the
 * browser tab becomes visible again (e.g. after backgrounding on mobile).
 *
 * Designed to be called inside a Svelte `$effect` — the returned cleanup
 * function is forwarded as the effect's destructor:
 *
 * ```ts
 * $effect(() => connectSse('/api/game/events', () => void invalidateAll()))
 * // With extra event listeners:
 * $effect(() => connectSse('/api/game/events', () => void invalidateAll(), { reaction: onReaction }))
 * ```
 *
 * @param url       SSE endpoint URL
 * @param onRefresh Called on every `refresh` event **and** whenever the tab
 *                  becomes visible, ensuring state is always up-to-date.
 * @param extras    Optional map of additional SSE event types to handlers.
 *                  These are re-registered on every reconnect.
 * @returns Cleanup function that closes the connection and removes listeners.
 */
export const connectSse = (
  url: string,
  onRefresh: () => void,
  extras?: Record<string, (e: Event) => void>,
): (() => void) => {
  let source: EventSource

  const connect = () => {
    source = new EventSource(url)
    source.addEventListener('refresh', onRefresh)
    if (extras) {
      for (const [type, handler] of Object.entries(extras)) {
        source.addEventListener(type, handler)
      }
    }
  }

  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      source.close()
      return
    }
    onRefresh()
    if (source.readyState === EventSource.CLOSED) connect()
  }

  connect()
  document.addEventListener('visibilitychange', onVisibilityChange)

  return () => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    source.close()
  }
}

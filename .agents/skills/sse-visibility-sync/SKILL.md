---
name: sse-visibility-sync
description: >
  Ensures Server-Sent Events (SSE) connections stay in sync when a browser tab
  or mobile app returns from the background. Use this skill whenever a SvelteKit
  route opens an EventSource connection. Mobile browsers (especially iOS Safari)
  kill SSE connections when backgrounded and do not reliably fire the `open`
  event on return, leaving the UI stale. This skill documents the required
  visibilitychange pattern that every SSE-using route must implement.
compatibility: SvelteKit, Svelte 5, browser EventSource API
---

## Problem

Browsers — especially **iOS Safari** and Chrome on Android — aggressively
suspend or kill `EventSource` connections when the tab or app goes to the
background. When the user returns:

- The browser's auto-reconnect **may or may not fire**.
- Even when it fires, the `open` event is **not reliable on mobile** — it may
  be delayed or suppressed entirely.
- The result: the UI shows stale game/app state with no indication that it is
  out of sync.

Relying solely on the `EventSource` `open` event for state sync is therefore
**insufficient** on mobile.

---

## Required Pattern

Every SvelteKit route that opens an `EventSource` must:

1. Use an internal **`connect()` factory** so the connection can be recreated.
2. Add a **`visibilitychange` listener** that:
   - Calls `invalidateAll()` immediately when the page becomes visible (syncs
     load data regardless of SSE status).
   - Checks `source.readyState === EventSource.CLOSED` and recreates the
     connection if needed.

### Canonical implementation (Svelte 5 `$effect`)

```ts
$effect(() => {
  let source: EventSource
  let connected = false

  const connect = () => {
    source = new EventSource('/api/your-sse-endpoint')

    source.addEventListener('open', () => {
      if (connected) void invalidateAll()
      connected = true
    })
    source.addEventListener('refresh', () => void invalidateAll())
    // add other event listeners here...
  }

  const onVisibility = () => {
    if (document.visibilityState !== 'visible') return
    // Always sync on focus — catches events missed while backgrounded.
    void invalidateAll()
    // Recreate the EventSource if the browser killed it in the background.
    if (source.readyState === EventSource.CLOSED) {
      source.close()
      connect()
    }
  }

  connect()
  document.addEventListener('visibilitychange', onVisibility)

  return () => {
    document.removeEventListener('visibilitychange', onVisibility)
    source.close()
  }
})
```

---

## Why `invalidateAll()` on every visibility change?

`invalidateAll()` re-runs the SvelteKit page's `load` function, refreshing all
server data. This is safe to call even when the SSE connection is still alive —
it just fetches the latest state. It acts as a **guaranteed sync point** that
does not depend on SSE event delivery.

The SSE connection then continues to deliver real-time deltas going forward.

---

## Server-side complement

The SSE server should also support `Last-Event-ID` to flush a refresh on
reconnect, covering the window between the client going offline and the
`visibilitychange` handler running. See `src/routes/api/game/events/+server.ts`
in this project for a reference implementation.

---

## Checklist

When adding SSE to a new route, verify all of the following:

- [ ] `EventSource` is created inside a `connect()` function (not a `const`)
- [ ] `visibilitychange` listener added in the same `$effect`
- [ ] `invalidateAll()` called on visibility (unconditionally)
- [ ] `EventSource.CLOSED` check → `connect()` called if dead
- [ ] `document.removeEventListener` called in the `$effect` cleanup
- [ ] `source.close()` called in the `$effect` cleanup

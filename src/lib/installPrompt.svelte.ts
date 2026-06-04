/**
 * Captures the browser's `beforeinstallprompt` event so the start route can
 * offer an "Install" button on platforms that support programmatic install
 * (Chromium-based browsers on Android/desktop).
 *
 * The event frequently fires before the SvelteKit app hydrates, so an inline
 * script in app.html captures it first and stashes it on
 * `window.__deferredInstallPrompt`. This module picks up that early-captured
 * event and also keeps listening for any later ones.
 */
import { browser } from '$app/environment'

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  prompt: () => Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

declare global {
  interface Window {
    __deferredInstallPrompt?: BeforeInstallPromptEvent
  }
}

let deferredPrompt = $state<BeforeInstallPromptEvent | null>(null)
let installed = $state(false)

if (browser) {
  // Pick up the event captured by the inline script in app.html, if it already fired.
  deferredPrompt = window.__deferredInstallPrompt ?? null
  window.addEventListener('beforeinstallprompt', (event) => {
    // Prevent the default mini-infobar so we can trigger the prompt ourselves.
    event.preventDefault()
    deferredPrompt = event as BeforeInstallPromptEvent
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    installed = true
    window.__deferredInstallPrompt = undefined
  })
}

export const installPrompt = {
  /** Whether a programmatic install prompt is available. */
  get canInstall(): boolean {
    return deferredPrompt !== null
  },
  /** Whether the app was installed during this session. */
  get installed(): boolean {
    return installed
  },
  /** Show the native install prompt; returns the user's choice. */
  async prompt(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    if (!deferredPrompt) return 'unavailable'
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    deferredPrompt = null
    if (browser) window.__deferredInstallPrompt = undefined
    return outcome
  },
}

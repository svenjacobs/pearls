<script lang="ts">
  import { browser } from '$app/environment'
  import { page } from '$app/stores'
  import { urlBase64ToUint8Array } from '$lib/base64'
  import { notification } from '$lib/notification.svelte'
  import * as m from '$lib/paraglide/messages.js'

  type Props = { class?: string }
  let { class: className = '' }: Props = $props()

  const vapidPublicKey = $derived(($page.data as { vapidPublicKey?: string | null }).vapidPublicKey)

  const isSupported = $derived(
    browser && 'serviceWorker' in navigator && 'PushManager' in window && !!vapidPublicKey,
  )

  let permission = $state<NotificationPermission>(
    browser && 'Notification' in window ? Notification.permission : 'default',
  )
  let subscribed = $state(false)
  let loading = $state(false)

  $effect(() => {
    if (!browser || !isSupported) return
    void (async () => {
      const reg = await navigator.serviceWorker.getRegistration()
      if (!reg?.active) return
      const sub = await reg.pushManager.getSubscription()
      subscribed = sub !== null
    })()
  })

  $effect(() => {
    if (!browser || !('Notification' in window)) return
    let cleanup: (() => void) | undefined
    void (async () => {
      try {
        const status = await navigator.permissions.query({
          name: 'notifications' as PermissionName,
        })
        const sync = () => {
          permission = Notification.permission
        }
        status.addEventListener('change', sync)
        cleanup = () => status.removeEventListener('change', sync)
      } catch {
        // navigator.permissions.query for notifications not supported (iOS <16.4)
      }
    })()
    return () => cleanup?.()
  })

  const getActiveRegistration = async (): Promise<ServiceWorkerRegistration> => {
    // Fast path: SW already active (covers the common case after first load).
    const reg = await navigator.serviceWorker.getRegistration()
    if (reg?.active) return reg

    // SW is still installing (first visit, heavy asset cache). Wait up to 30 s.
    return Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Service worker not ready')), 30_000),
      ),
    ])
  }

  const handleClick = () => {
    if ('Notification' in window) permission = Notification.permission
    if (permission === 'denied') {
      notification.notify(m.push_notifications_blocked_hint(), 'warning', 4_000)
      return
    }
    void (subscribed ? unsubscribe() : subscribe())
  }

  const subscribe = async () => {
    if (!vapidPublicKey || loading) return
    loading = true
    try {
      const perm = await Notification.requestPermission()
      permission = perm
      if (perm !== 'granted') return
      const reg = await getActiveRegistration()
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      })
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...sub.toJSON(), locale: navigator.language }),
      })
      if (res.ok) {
        subscribed = true
        notification.notify(m.push_notifications_enabled(), 'info')
      } else {
        console.error('Push subscribe failed', res.status, await res.text())
        notification.notify(m.push_notifications_error(), 'error')
      }
    } catch (err) {
      console.error('Push subscribe error', err)
      notification.notify(m.push_notifications_error(), 'error')
    } finally {
      loading = false
    }
  }

  const unsubscribe = async () => {
    if (loading) return
    loading = true
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        })
        await sub.unsubscribe()
      }
      subscribed = false
      notification.notify(m.push_notifications_disabled(), 'info')
    } catch (err) {
      console.error('Push unsubscribe error', err)
    } finally {
      loading = false
    }
  }
</script>

{#if isSupported}
  <div class={className}>
    <button
      type="button"
      role="menuitem"
      onclick={handleClick}
      disabled={loading}
      title={permission === 'denied'
        ? m.push_notifications_blocked()
        : subscribed
          ? m.menu_push_notifications_off()
          : m.menu_push_notifications_on()}
      class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors
      {permission === 'denied'
        ? 'cursor-pointer text-gray-400 hover:bg-gray-50 dark:text-gray-500 dark:hover:bg-gray-800/60'
        : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800/60'}"
    >
      <span
        class="iconify size-4 {permission !== 'denied' && subscribed
          ? 'heroicons--bell-20-solid'
          : 'heroicons--bell-slash-20-solid'}"
      ></span>
      {#if permission === 'denied'}
        {m.push_notifications_blocked()}
      {:else}
        {subscribed ? m.menu_push_notifications_on() : m.menu_push_notifications_off()}
      {/if}
    </button>
  </div>
{/if}

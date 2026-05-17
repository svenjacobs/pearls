import { env } from '$env/dynamic/private'

import type { LayoutServerLoad } from './$types'

export const load: LayoutServerLoad = () => ({
  vapidPublicKey: env.VAPID_PUBLIC_KEY ?? null,
})

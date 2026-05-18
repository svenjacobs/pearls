import { getStats } from '$lib/server/repository/status'

import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async () => ({
  stats: await getStats(),
})

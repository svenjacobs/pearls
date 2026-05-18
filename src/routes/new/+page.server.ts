import { redirect } from '@sveltejs/kit'

import { resolve } from '$app/paths'
import { generateInviteCode } from '$lib'
import { MAX_NAME_LENGTH } from '$lib/playerName'
import { inviteUrl } from '$lib/server/invite'

import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = () => {
  const inviteCode = generateInviteCode()
  return {
    inviteCode,
    inviteUrl: inviteUrl(inviteCode),
  }
}

export const actions: Actions = {
  default: async ({ request }) => {
    const form = await request.formData()
    const name = ((form.get('name') as string | null) ?? '').trim()
    const inviteCode = (form.get('inviteCode') as string | null) ?? ''
    const pearlTheme = ((form.get('pearlTheme') as string | null) ?? '').trim()

    if (!name) return { error: 'name_required' as const }
    if (name.length > MAX_NAME_LENGTH) return { error: 'name_too_long' as const }

    const params = new URLSearchParams({ name })
    if (pearlTheme) params.set('pearlTheme', pearlTheme)
    redirect(302, resolve('/[inviteCode]', { inviteCode }) + `?${params.toString()}`)
  },
}

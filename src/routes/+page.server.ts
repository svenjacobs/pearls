import { fail, redirect } from '@sveltejs/kit'
import { sample } from 'es-toolkit'

import { resolve } from '$app/paths'
import { gameRepository, sessionRepository } from '$lib/server/repository'
import { getAllSessionIds } from '$lib/server/session/session'

import type { Actions, PageServerLoad } from './$types'

const PEARL_COLORS = [
  '#ff2c2c',
  '#ff8c00',
  '#ffd600',
  '#b5e800',
  '#00c957',
  '#00ddb0',
  '#1ab8ff',
  '#2866ff',
  '#8844ff',
  '#e800ff',
  '#ff1a8c',
  '#ff6040',
  '#f59e0b', // amber
] as const

export const load: PageServerLoad = async ({ cookies }) => {
  const sessionIds = getAllSessionIds(cookies)
  let activeGameCount = 0

  if (sessionIds.length > 0) {
    const sessions = await Promise.all(sessionIds.map((id) => sessionRepository.findById(id)))
    const validSessions = sessions.filter((s) => s !== null)
    const games = await Promise.all(validSessions.map((s) => gameRepository.findById(s!.gameId)))
    activeGameCount = games.filter((g) => g !== null && g.status !== 'finished').length
  }

  return { pearlColor: sample(PEARL_COLORS)!, activeGameCount }
}

export const actions: Actions = {
  join: async ({ request }) => {
    const form = await request.formData()
    const code = ((form.get('code') as string | null) ?? '').trim().toUpperCase()
    if (!code) return fail(400, { missingCode: true })
    redirect(302, resolve('/join/[inviteCode]', { inviteCode: code }))
  },
}

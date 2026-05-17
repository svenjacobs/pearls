import { error, redirect } from '@sveltejs/kit'
import { randomInt } from 'es-toolkit'

import { resolve } from '$app/paths'
import { MAX_PLAYERS } from '$lib/server/game/constants'
import { inviteUrl } from '$lib/server/invite'
import { gameRepository, playerRepository, sessionRepository } from '$lib/server/repository'
import { getAllSessionIds } from '$lib/server/session/session'

import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ params, cookies }) => {
  const inviteCode = params.inviteCode.toUpperCase()

  const game = await gameRepository.findByInviteCode(inviteCode)
  if (!game) error(404)

  // If player already has a session for this exact game, send them to the board.
  const sessionIds = getAllSessionIds(cookies)
  if (sessionIds.length > 0) {
    const sessions = await Promise.all(sessionIds.map((id) => sessionRepository.findById(id)))
    if (sessions.some((s) => s?.gameId === game.id)) {
      redirect(302, resolve('/[inviteCode]', { inviteCode }))
    }
  }

  const isFull =
    game.status === 'playing' || (game.status === 'waiting' && game.playerIds.length >= MAX_PLAYERS)
  if (isFull) {
    return { mode: 'full' as const, inviteCode }
  }

  return {
    mode: 'join' as const,
    inviteCode,
    inviteUrl: inviteUrl(inviteCode),
  }
}

const generateSuggestion = (baseName: string, takenNames: Set<string>): string => {
  for (let i = 0; i < 20; i++) {
    const num = String(randomInt(100, 1_000))
    const candidate = `${baseName}${num}`
    if (!takenNames.has(candidate)) return candidate
  }
  return `${baseName}${randomInt(100, 1_000)}`
}

export const actions: Actions = {
  join: async ({ request, params }) => {
    const form = await request.formData()
    const name = ((form.get('name') as string | null) ?? '').trim()
    const inviteCode = params.inviteCode.toUpperCase()
    const pearlTheme = ((form.get('pearlTheme') as string | null) ?? '').trim()

    if (!name) return { error: 'name_required' as const }

    const game = await gameRepository.findByInviteCode(inviteCode)
    if (!game) return { error: 'not_found' as const }
    if (game.status !== 'waiting' || game.playerIds.length >= MAX_PLAYERS) {
      return { error: 'game_full' as const }
    }
    if (game.playerIds.length > 0) {
      const players = await playerRepository.findManyByIds(game.playerIds)
      const takenNames = new Set(players.filter(Boolean).map((p) => p!.name.trim()))
      if (takenNames.has(name)) {
        const suggestion = generateSuggestion(name, takenNames)
        return { error: 'name_taken' as const, enteredName: name, suggestion }
      }
    }

    const qs = new URLSearchParams({ name })
    if (pearlTheme) qs.set('pearlTheme', pearlTheme)
    redirect(302, resolve('/[inviteCode]', { inviteCode }) + `?${qs.toString()}`)
  },
}

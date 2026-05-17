import { error, redirect } from '@sveltejs/kit'
import { shuffle } from 'es-toolkit'

import { dev } from '$app/environment'
import { resolve } from '$app/paths'
import { generateInviteCode } from '$lib'
import { MAX_PLAYERS, MIN_PLAYERS } from '$lib/server/game/constants'
import { startGameNow } from '$lib/server/game/turn-flow'
import { publishGameEvent } from '$lib/server/pubsub'
import { gameRepository, playerRepository, sessionRepository } from '$lib/server/repository'
import { setSessionId } from '$lib/server/session/session'

import type { Actions, PageServerLoad } from './$types'

export const load: PageServerLoad = () => {
  if (!dev) error(404, 'Not found')
  return { minPlayers: MIN_PLAYERS, maxPlayers: MAX_PLAYERS }
}

export const actions: Actions = {
  watchAiGame: async ({ request, cookies }) => {
    if (!dev) error(404)

    const form = await request.formData()
    const count = Math.min(
      MAX_PLAYERS,
      Math.max(MIN_PLAYERS, parseInt(form.get('count') as string) || MIN_PLAYERS),
    )

    const inviteCode = generateInviteCode()
    const game = await gameRepository.create(inviteCode)

    // Create AI players, avoiding duplicate names/themes.
    const existingNames: string[] = []
    const existingThemes: string[] = []
    const aiPlayerIds: string[] = []
    for (let i = 0; i < count; i++) {
      const ai = await playerRepository.createAiPlayer(existingNames, existingThemes)
      existingNames.push(ai.name)
      if (ai.pearlTheme) existingThemes.push(ai.pearlTheme)
      aiPlayerIds.push(ai.id)
    }

    // Add AI players to the game in a random turn order.
    const shuffled = shuffle(aiPlayerIds)
    await gameRepository.addPlayers(game.id, shuffled)

    // Create a ghost observer player (not in game.playerIds) so the
    // game page resolves a valid session and shows the spectator view.
    const observer = await playerRepository.create('Observer')
    const session = await sessionRepository.create(game.id, observer.id)
    setSessionId(cookies, session.id)

    // Start immediately — no initiative dice-off needed for a pure AI game.
    const freshGame = await gameRepository.findById(game.id)
    if (!freshGame) error(500, 'Game not found after creation')
    await startGameNow(freshGame)
    await publishGameEvent(game.id, { event: 'refresh' })

    redirect(302, resolve('/[inviteCode]', { inviteCode }))
  },
}

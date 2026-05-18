/**
 * Integration tests for getStats.
 *
 * Runs against a real Redis instance started by the testcontainers globalSetup.
 * Each test starts with a clean database (redis-flush.ts runs FLUSHALL beforeEach).
 */
import { describe, expect, it } from 'vitest'

import { gameRepository } from '$lib/server/repository/game'
import { playerRepository } from '$lib/server/repository/player'
import { getStats } from '$lib/server/repository/status'

describe('getStats', () => {
  it('returns zeros when Redis is empty', async () => {
    const stats = await getStats()
    expect(stats).toEqual({ activeGames: 0, activeHumanPlayers: 0 })
  })

  it('counts a waiting game with human players', async () => {
    const game = await gameRepository.create('CODE1')
    const p1 = await playerRepository.create('Alice')
    const p2 = await playerRepository.create('Bob')
    await gameRepository.addPlayer(game.id, p1.id)
    await gameRepository.addPlayer(game.id, p2.id)

    const stats = await getStats()
    expect(stats).toEqual({ activeGames: 1, activeHumanPlayers: 2 })
  })

  it('counts a playing game with mixed human and AI players', async () => {
    const game = await gameRepository.create('CODE1')
    const human = await playerRepository.create('Charlie')
    const ai = await playerRepository.createAiPlayer([])
    await gameRepository.addPlayer(game.id, human.id)
    await gameRepository.addPlayer(game.id, ai.id)
    await gameRepository.setStatus(game.id, 'playing')

    const stats = await getStats()
    expect(stats).toEqual({ activeGames: 1, activeHumanPlayers: 1 })
  })

  it('excludes finished games', async () => {
    const game = await gameRepository.create('CODE1')
    const p = await playerRepository.create('Dave')
    await gameRepository.addPlayer(game.id, p.id)
    await gameRepository.setWinner(game.id, p.id)

    const stats = await getStats()
    expect(stats).toEqual({ activeGames: 0, activeHumanPlayers: 0 })
  })

  it('aggregates across multiple active games and deduplicates players', async () => {
    // waiting game: 2 humans
    const g1 = await gameRepository.create('CODE1')
    const p1 = await playerRepository.create('Alice')
    const p2 = await playerRepository.create('Bob')
    await gameRepository.addPlayer(g1.id, p1.id)
    await gameRepository.addPlayer(g1.id, p2.id)

    // playing game: 1 human + 1 AI
    const g2 = await gameRepository.create('CODE2')
    const p3 = await playerRepository.create('Charlie')
    const ai = await playerRepository.createAiPlayer([])
    await gameRepository.addPlayer(g2.id, p3.id)
    await gameRepository.addPlayer(g2.id, ai.id)
    await gameRepository.setStatus(g2.id, 'playing')

    // finished game: 1 human — must not be counted
    const g3 = await gameRepository.create('CODE3')
    const p4 = await playerRepository.create('Dave')
    await gameRepository.addPlayer(g3.id, p4.id)
    await gameRepository.setWinner(g3.id, p4.id)

    const stats = await getStats()
    expect(stats.activeGames).toBe(2)
    expect(stats.activeHumanPlayers).toBe(3)
  })
})

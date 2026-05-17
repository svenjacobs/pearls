/**
 * Load tests: concurrent games and players.
 *
 * Verifies correctness (no data corruption) and responsiveness (time budget)
 * under parallel Redis operations. Runs against the Testcontainers Redis instance.
 */
import { describe, expect, it } from 'vitest'

import { gameRepository } from '$lib/server/repository/game'
import { playerRepository } from '$lib/server/repository/player'
import { turnRepository } from '$lib/server/repository/turn'

describe('load: concurrent games and players', () => {
  it('creates 20 games with 4 players each concurrently without data corruption', async () => {
    const GAMES = 20
    const PLAYERS = 4

    const games = await Promise.all(
      Array.from({ length: GAMES }, (_, i) =>
        gameRepository.create(`LOAD${String(i).padStart(2, '0')}`),
      ),
    )

    await Promise.all(
      games.flatMap((g) =>
        Array.from({ length: PLAYERS }, (_, i) =>
          gameRepository.addPlayer(g.id, `player-${g.id}-${i}`),
        ),
      ),
    )

    const fetched = await Promise.all(games.map((g) => gameRepository.findById(g.id)))
    for (const game of fetched) {
      expect(game?.playerIds).toHaveLength(PLAYERS)
      expect(Object.keys(game?.boards ?? {})).toHaveLength(PLAYERS)
    }
  })

  it('findById returns correct boards after concurrent setBoard calls', async () => {
    const game = await gameRepository.create('LOADBOARD')
    const playerIds = ['p1', 'p2', 'p3', 'p4']
    await Promise.all(playerIds.map((pid) => gameRepository.addPlayer(game.id, pid)))

    const customBoards = playerIds.map((_, i) => Array<number>(12).fill(i + 1))
    await Promise.all(
      playerIds.map((pid, i) => gameRepository.setBoard(game.id, pid, customBoards[i])),
    )

    const fresh = await gameRepository.findById(game.id)
    for (let i = 0; i < playerIds.length; i++) {
      expect(fresh?.boards[playerIds[i]]).toEqual(customBoards[i])
    }
  })

  it('concurrent turn creation across 10 games sets correct active turn pointers', async () => {
    const GAMES = 10
    const games = await Promise.all(
      Array.from({ length: GAMES }, (_, i) => gameRepository.create(`LTURN${i}`)),
    )
    await Promise.all(games.map((g) => gameRepository.addPlayer(g.id, 'player-0')))

    const turns = await Promise.all(games.map((g) => turnRepository.create(g.id, 'player-0', 0)))

    await Promise.all(
      games.map(async (g, i) => {
        const current = await turnRepository.findCurrentForGame(g.id)
        expect(current?.id).toBe(turns[i].id)
      }),
    )
  })

  it('findManyByIds returns correct data for 20 players', async () => {
    const players = await Promise.all(
      Array.from({ length: 20 }, (_, i) => playerRepository.create(`LoadPlayer${i}`)),
    )
    const ids = players.map((p) => p.id)
    const found = await playerRepository.findManyByIds(ids)

    expect(found).toHaveLength(20)
    for (let i = 0; i < players.length; i++) {
      expect(found[i]?.name).toBe(`LoadPlayer${i}`)
    }
  })

  it('20 concurrent games with full setup complete within 2 seconds', async () => {
    const start = Date.now()

    const games = await Promise.all(
      Array.from({ length: 20 }, (_, i) => gameRepository.create(`PERF${i}`)),
    )
    await Promise.all(
      games.flatMap((g) => [
        gameRepository.addPlayer(g.id, 'p0'),
        gameRepository.addPlayer(g.id, 'p1'),
      ]),
    )
    await Promise.all(games.map((g) => gameRepository.setStatus(g.id, 'playing')))
    await Promise.all(games.map((g) => gameRepository.findById(g.id)))

    expect(Date.now() - start).toBeLessThan(2_000)
  })
})

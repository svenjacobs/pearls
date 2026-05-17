/**
 * Integration tests for playerRepository.
 *
 * Runs against a real Redis instance started by the testcontainers globalSetup.
 * Each test starts with a clean database (redis-flush.ts runs FLUSHALL beforeEach).
 */
import { describe, expect, it } from 'vitest'

import { playerRepository } from '$lib/server/repository/player'

describe('playerRepository', () => {
  // ── create / findById ──────────────────────────────────────────────────────

  it('creates a player and retrieves it by id', async () => {
    const player = await playerRepository.create('Alice')

    expect(player.id).toBeTruthy()
    expect(player.name).toBe('Alice')
    expect(player.createdAt).toBeGreaterThan(0)
    expect(player.updatedAt).toBe(player.createdAt)

    const found = await playerRepository.findById(player.id)
    expect(found).toMatchObject({ id: player.id, name: 'Alice' })
  })

  it('returns null for an unknown id', async () => {
    expect(await playerRepository.findById('nonexistent')).toBeNull()
  })

  // ── save ───────────────────────────────────────────────────────────────────

  it('persists name changes via save', async () => {
    const player = await playerRepository.create('Bob')

    player.name = 'Robert'
    await playerRepository.save(player)

    const found = await playerRepository.findById(player.id)
    expect(found?.name).toBe('Robert')
  })

  // ── delete ─────────────────────────────────────────────────────────────────

  it('removes the player on delete', async () => {
    const player = await playerRepository.create('Charlie')
    await playerRepository.delete(player.id)

    expect(await playerRepository.findById(player.id)).toBeNull()
  })

  // ── isolation ─────────────────────────────────────────────────────────────

  it('two players coexist independently', async () => {
    const a = await playerRepository.create('Alice')
    const b = await playerRepository.create('Bob')

    const foundA = await playerRepository.findById(a.id)
    const foundB = await playerRepository.findById(b.id)

    expect(foundA?.name).toBe('Alice')
    expect(foundB?.name).toBe('Bob')
    expect(foundA?.id).not.toBe(foundB?.id)
  })

  // ── pearlTheme ─────────────────────────────────────────────────────────────

  it('create stores pearlTheme when provided', async () => {
    const player = await playerRepository.create('Alice', 'german')

    expect(player.pearlTheme).toBe('german')

    const found = await playerRepository.findById(player.id)
    expect(found?.pearlTheme).toBe('german')
  })

  it('findById returns undefined pearlTheme when omitted on create', async () => {
    const player = await playerRepository.create('Bob')

    expect(player.pearlTheme).toBeUndefined()

    const found = await playerRepository.findById(player.id)
    expect(found?.pearlTheme).toBeUndefined()
  })

  it('save updates pearlTheme on existing player', async () => {
    const player = await playerRepository.create('Charlie', 'rainbow')

    player.pearlTheme = 'ocean'
    await playerRepository.save(player)

    const found = await playerRepository.findById(player.id)
    expect(found?.pearlTheme).toBe('ocean')
  })

  it('findById returns updated pearlTheme after save', async () => {
    const player = await playerRepository.create('Dana')

    player.pearlTheme = 'sunset'
    await playerRepository.save(player)

    const found = await playerRepository.findById(player.id)
    expect(found?.pearlTheme).toBe('sunset')
  })

  // ── findManyByIds ──────────────────────────────────────────────────────────

  it('findManyByIds returns players in the same order as input ids', async () => {
    const a = await playerRepository.create('Alpha')
    const b = await playerRepository.create('Beta')
    const c = await playerRepository.create('Gamma')

    const found = await playerRepository.findManyByIds([c.id, a.id, b.id])
    expect(found).toHaveLength(3)
    expect(found[0]?.name).toBe('Gamma')
    expect(found[1]?.name).toBe('Alpha')
    expect(found[2]?.name).toBe('Beta')
  })

  it('findManyByIds returns null for unknown ids', async () => {
    const found = await playerRepository.findManyByIds(['nonexistent'])
    expect(found).toEqual([null])
  })

  it('findManyByIds returns empty array for empty input', async () => {
    const found = await playerRepository.findManyByIds([])
    expect(found).toEqual([])
  })

  it('findManyByIds handles mixed known and unknown ids', async () => {
    const player = await playerRepository.create('Known')
    const found = await playerRepository.findManyByIds([player.id, 'unknown-id'])
    expect(found).toHaveLength(2)
    expect(found[0]?.name).toBe('Known')
    expect(found[1]).toBeNull()
  })

  // ── createAiPlayer ─────────────────────────────────────────────────────────

  it('createAiPlayer creates a player with isAI flag set to true', async () => {
    const player = await playerRepository.createAiPlayer([])

    expect(player.id).toBeTruthy()
    expect(player.isAI).toBe(true)
    expect(player.createdAt).toBeGreaterThan(0)
    expect(player.updatedAt).toBe(player.createdAt)
  })

  it('createAiPlayer selects a name from known AI names', async () => {
    const player = await playerRepository.createAiPlayer([])

    // Known AI names from the repository
    const knownAiNames = [
      'Bender',
      'R2-D2',
      'HAL',
      'WALL-E',
      'Marvin',
      'Data',
      'Baymax',
      'GLaDOS',
      'Optimus',
      'TARS',
      'Robby',
      'Johnny5',
      'Claptrap',
      'HK-47',
      'JARVIS',
      'K-2SO',
      'Bishop',
      'Wheatley',
      'BB-8',
      'Chappie',
      'GERTY',
      'Sonny',
      'Ultron',
      'Rosie',
      'SHODAN',
    ]

    expect(knownAiNames).toContain(player.name)
  })

  it('createAiPlayer avoids names in existingNames when possible', async () => {
    // Create an AI player with some existing names to avoid
    const existingNames = ['Bender', 'R2-D2', 'HAL', 'WALL-E']
    const player = await playerRepository.createAiPlayer(existingNames)

    expect(existingNames).not.toContain(player.name)
  })

  it('createAiPlayer persists isAI flag in Redis', async () => {
    const player = await playerRepository.createAiPlayer([])

    const found = await playerRepository.findById(player.id)
    expect(found?.isAI).toBe(true)
    expect(found?.name).toBe(player.name)
  })

  it('createAiPlayer picks a name from full pool when all AI names are exhausted', async () => {
    // All 25 AI names are in existingNames
    const allAiNames = [
      'Bender',
      'R2-D2',
      'HAL',
      'WALL-E',
      'Marvin',
      'Data',
      'Baymax',
      'GLaDOS',
      'Optimus',
      'TARS',
      'Robby',
      'Johnny5',
      'Claptrap',
      'HK-47',
      'JARVIS',
      'K-2SO',
      'Bishop',
      'Wheatley',
      'BB-8',
      'Chappie',
      'GERTY',
      'Sonny',
      'Ultron',
      'Rosie',
      'SHODAN',
    ]

    const player = await playerRepository.createAiPlayer(allAiNames)

    // The player should still get a name from the full pool (may be a duplicate)
    expect(allAiNames).toContain(player.name)
  })

  it('createAiPlayer with empty existingNames picks from full pool', async () => {
    const player1 = await playerRepository.createAiPlayer([])
    const player2 = await playerRepository.createAiPlayer([])

    // Both should have valid AI names (may or may not be the same)
    const knownAiNames = [
      'Bender',
      'R2-D2',
      'HAL',
      'WALL-E',
      'Marvin',
      'Data',
      'Baymax',
      'GLaDOS',
      'Optimus',
      'TARS',
      'Robby',
      'Johnny5',
      'Claptrap',
      'HK-47',
      'JARVIS',
      'K-2SO',
      'Bishop',
      'Wheatley',
      'BB-8',
      'Chappie',
      'GERTY',
      'Sonny',
      'Ultron',
      'Rosie',
      'SHODAN',
    ]
    expect(knownAiNames).toContain(player1.name)
    expect(knownAiNames).toContain(player2.name)
  })

  it('createAiPlayer multiple times with growing existingNames avoids previous names', async () => {
    const existingNames: string[] = []

    const player1 = await playerRepository.createAiPlayer(existingNames)
    existingNames.push(player1.name)

    const player2 = await playerRepository.createAiPlayer(existingNames)
    existingNames.push(player2.name)

    const player3 = await playerRepository.createAiPlayer(existingNames)

    // player3 should not have a name from the first two
    expect([player1.name, player2.name]).not.toContain(player3.name)
  })
})

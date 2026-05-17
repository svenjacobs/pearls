import { createId } from '@paralleldrive/cuid2'
import { sample } from 'es-toolkit'

import { PEARL_THEMES } from '$lib/pearlThemes'
import { redis } from '$lib/server/redis'

import type { Player } from './types'

const key = (id: string) => `player:${id}`

// Famous fictional robots and androids from film, TV, and games.
const AI_NAMES = [
  'Bender', // Futurama
  'R2-D2', // Star Wars
  'HAL', // 2001: A Space Odyssey
  'WALL-E', // WALL-E
  'Marvin', // The Hitchhiker's Guide to the Galaxy
  'Data', // Star Trek: TNG
  'Baymax', // Big Hero 6
  'GLaDOS', // Portal
  'Optimus', // Transformers
  'TARS', // Interstellar
  'Robby', // Forbidden Planet
  'Johnny5', // Short Circuit
  'Claptrap', // Borderlands
  'HK-47', // Star Wars: KotOR
  'JARVIS', // Iron Man
  'K-2SO', // Star Wars: Rogue One
  'Bishop', // Aliens
  'Wheatley', // Portal 2
  'BB-8', // Star Wars: The Force Awakens
  'Chappie', // Chappie
  'GERTY', // Moon
  'Sonny', // I, Robot
  'Ultron', // Marvel
  'Rosie', // The Jetsons
  'SHODAN', // System Shock
]

export const playerRepository = {
  async create(name: string, pearlTheme?: string): Promise<Player> {
    const now = Date.now()
    const player: Player = {
      id: createId(),
      name: name.trim(),
      pearlTheme,
      createdAt: now,
      updatedAt: now,
    }
    await this.save(player)
    return player
  },

  async createAiPlayer(existingNames: string[], existingThemes: string[] = []): Promise<Player> {
    const available = AI_NAMES.filter((n) => !existingNames.includes(n))
    const pool = available.length > 0 ? available : AI_NAMES
    const name = sample(pool)!

    const availableThemes = PEARL_THEMES.filter((t) => !existingThemes.includes(t.id))
    const themePool = availableThemes.length > 0 ? availableThemes : [...PEARL_THEMES]
    const pearlTheme = sample(themePool)!.id

    const now = Date.now()
    const player: Player = {
      id: createId(),
      name,
      pearlTheme,
      isAI: true,
      createdAt: now,
      updatedAt: now,
    }
    await this.save(player)
    return player
  },

  async save(player: Player): Promise<void> {
    const fields: Record<string, string> = {
      id: player.id,
      name: player.name,
      createdAt: String(player.createdAt),
      updatedAt: String(player.updatedAt),
    }
    if (player.pearlTheme !== undefined) fields.pearlTheme = player.pearlTheme
    if (player.isAI) fields.isAI = '1'
    await redis.hSet(key(player.id), fields)
  },

  async findById(id: string): Promise<Player | null> {
    const data = await redis.hGetAll(key(id))
    if (!data.id) return null
    return {
      id: data.id,
      name: data.name,
      pearlTheme: data.pearlTheme || undefined,
      isAI: data.isAI === '1' || undefined,
      createdAt: Number(data.createdAt) || 0,
      updatedAt: Number(data.updatedAt) || 0,
    }
  },

  async delete(id: string): Promise<void> {
    await redis.del(key(id))
  },

  async findManyByIds(ids: string[]): Promise<(Player | null)[]> {
    if (ids.length === 0) return []
    const pipeline = redis.multi()
    for (const id of ids) pipeline.hGetAll(key(id))
    const results = (await pipeline.exec()) as unknown as Record<string, string>[]
    return results.map((data) =>
      data.id
        ? {
            id: data.id,
            name: data.name,
            pearlTheme: data.pearlTheme || undefined,
            isAI: data.isAI === '1' || undefined,
            createdAt: Number(data.createdAt) || 0,
            updatedAt: Number(data.updatedAt) || 0,
          }
        : null,
    )
  },
}

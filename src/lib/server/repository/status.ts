import { redis } from '$lib/server/redis'

export type ServerStats = {
  activeGames: number
  activeHumanPlayers: number
}

export const getStats = async (): Promise<ServerStats> => {
  const gameKeys: string[] = []
  for await (const keys of redis.scanIterator({ MATCH: 'game:*', TYPE: 'hash' })) {
    gameKeys.push(...keys)
  }

  if (gameKeys.length === 0) return { activeGames: 0, activeHumanPlayers: 0 }

  const pipeline = redis.multi()
  for (const key of gameKeys) {
    pipeline.hGet(key, 'status')
  }
  for (const key of gameKeys) {
    pipeline.lRange(`${key}:turn-order`, 0, -1)
  }
  const results = (await pipeline.exec()) as unknown as (string | null | string[])[]

  const statuses = results.slice(0, gameKeys.length) as (string | null)[]
  const turnOrders = results.slice(gameKeys.length) as string[][]

  const playerIdSet = new Set<string>()
  let activeGames = 0
  for (let i = 0; i < statuses.length; i++) {
    const status = statuses[i]
    if (status !== 'waiting' && status !== 'playing') continue
    activeGames++
    for (const pid of turnOrders[i]) {
      playerIdSet.add(pid)
    }
  }

  if (playerIdSet.size === 0) return { activeGames, activeHumanPlayers: 0 }

  const playerIds = [...playerIdSet]
  const playerPipeline = redis.multi()
  for (const pid of playerIds) {
    playerPipeline.hGet(`player:${pid}`, 'isAI')
  }
  const isAIResults = (await playerPipeline.exec()) as unknown as (string | null)[]

  const activeHumanPlayers = isAIResults.filter((v) => v !== '1').length

  return { activeGames, activeHumanPlayers }
}

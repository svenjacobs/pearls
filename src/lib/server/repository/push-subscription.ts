import type { PushSubscriptionJSON } from '$lib/server/push/types'
import { redis } from '$lib/server/redis'

const key = (playerId: string) => `player:${playerId}:push-subscriptions`

export const pushSubscriptionRepository = {
  async add(playerId: string, sub: PushSubscriptionJSON): Promise<void> {
    await redis.sAdd(key(playerId), JSON.stringify(sub))
  },

  async removeByEndpoint(playerId: string, endpoint: string): Promise<void> {
    const members = await redis.sMembers(key(playerId))
    for (const m of members) {
      if ((JSON.parse(m) as PushSubscriptionJSON).endpoint === endpoint) {
        await redis.sRem(key(playerId), m)
      }
    }
  },

  async findAll(playerId: string): Promise<PushSubscriptionJSON[]> {
    const members = await redis.sMembers(key(playerId))
    return members.map((m) => JSON.parse(m) as PushSubscriptionJSON)
  },
}

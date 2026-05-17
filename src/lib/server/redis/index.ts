import { createClient } from 'redis'

import { env } from '$env/dynamic/private'
import { logger } from '$lib/server/logger'

let client: ReturnType<typeof createClient> = undefined!

export const connectRedis = async (url?: string) => {
  const redisUrl = url ?? env.REDIS_URL
  if (!redisUrl) throw new Error('REDIS_URL is not set')
  client = createClient({ url: redisUrl })
  client.on('error', (err) => logger.error({ err }, 'Redis error'))
  await client.connect()
  logger.info('Redis connected')
}

export const disconnectRedis = () => client?.quit()

export { client as redis }

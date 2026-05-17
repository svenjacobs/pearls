/**
 * Vitest setupFile — flushes all Redis data before each test for isolation.
 *
 * Runs inside the test-worker environment (Vite module resolution active),
 * so $lib/* aliases resolve normally.
 */
import { beforeAll, beforeEach, inject } from 'vitest'

import { connectRedis, redis } from '$lib/server/redis'

beforeAll(async () => {
  await connectRedis(inject('REDIS_URL'))
})

beforeEach(async () => {
  await redis.flushAll()
})

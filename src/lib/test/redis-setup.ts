/**
 * Vitest globalSetup — starts a throwaway Redis container before the test
 * suite and injects REDIS_URL into process.env so the redis client module
 * picks it up via $env/dynamic/private.
 *
 * The returned teardown function stops the container after all tests finish.
 */
import { RedisContainer } from '@testcontainers/redis'
import type { ProvidedContext } from 'vitest'

declare module 'vitest' {
  export interface ProvidedContext {
    REDIS_URL: string
  }
}

type Provide = <T extends keyof ProvidedContext & string>(key: T, value: ProvidedContext[T]) => void

let stopContainer: (() => Promise<void>) | undefined

export const setup = async ({ provide }: { provide: Provide }): Promise<void> => {
  const container = await new RedisContainer('redis:8-alpine').start()
  provide('REDIS_URL', container.getConnectionUrl())
  stopContainer = async () => {
    await container.stop()
  }
}

export const teardown = async (): Promise<void> => {
  await stopContainer?.()
}

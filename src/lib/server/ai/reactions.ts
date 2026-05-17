import { delay, randomInt, sample } from 'es-toolkit'

import { REACTION_TYPES, type ReactionType } from '$lib/reactions'
import { publishGameEvent } from '$lib/server/pubsub'
import { gameRepository, playerRepository, reactionRepository } from '$lib/server/repository'
import type { Die } from '$lib/server/repository/types'

const POSITIVE_REACTIONS = REACTION_TYPES.filter((t): t is ReactionType => t !== 'frown')

export type AiReactionTrigger = 'cleared-row' | 'high-value' | 'perfect-roll' | 'triple-roll'

const REACTION_CHANCE: Record<AiReactionTrigger, number> = {
  'cleared-row': 0.45,
  'high-value': 0.3,
  'perfect-roll': 0.65,
  'triple-roll': 0.25,
}

/**
 * Returns true when any die value appears ≥3 times among active dice —
 * used to detect an exciting roll worth reacting to.
 */
export const hasTripleRoll = (dice: Die[]): boolean => {
  const counts = new Map<number, number>()
  for (const d of dice) {
    if (d.status !== 'active') continue
    counts.set(d.value, (counts.get(d.value) ?? 0) + 1)
  }
  return [...counts.values()].some((c) => c >= 3)
}

/**
 * Fires optional reactions from AI spectators — all AI players in the game
 * except the active player (who is not a spectator during their own turn).
 * Each AI is evaluated independently at REACTION_CHANCE[trigger].
 * Reactions are staggered with random jitter so they don't all fire at once.
 */
export const triggerAiReactions = async (
  gameId: string,
  activePlayerId: string,
  trigger: AiReactionTrigger,
): Promise<void> => {
  const game = await gameRepository.findById(gameId)
  if (!game || game.status !== 'playing') return

  const players = await playerRepository.findManyByIds(game.playerIds)
  const aiSpectators = players.filter(
    (p): p is NonNullable<typeof p> => p !== null && (p.isAI ?? false) && p.id !== activePlayerId,
  )
  if (aiSpectators.length === 0) return

  const chance = REACTION_CHANCE[trigger]

  await Promise.all(
    aiSpectators.map(async (ai) => {
      if (Math.random() > chance) return
      // Atomically claim the throttle slot. If another concurrent triggerAiReactions
      // call already claimed it (e.g. triple-roll + high-value fired in the same
      // loop iteration), bail out here before doing any work.
      const acquired = await reactionRepository.setThrottle(gameId, ai.id)
      if (!acquired) return

      await delay(randomInt(0, 1_500))

      const reaction = await reactionRepository.add(gameId, ai.id, sample(POSITIVE_REACTIONS)!)
      await publishGameEvent(gameId, {
        event: 'reaction',
        playerId: reaction.playerId,
        type: reaction.type,
        emoji: reaction.emoji,
      })
    }),
  )
}

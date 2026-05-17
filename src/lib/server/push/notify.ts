import webpush from 'web-push'

import { env } from '$env/dynamic/private'
import * as m from '$lib/paraglide/messages.js'
import { logger } from '$lib/server/logger'
import { playerRepository, pushSubscriptionRepository } from '$lib/server/repository'

import { isPlayerActive } from './activity'
import { clearPendingNotification, setPendingNotification } from './pending'
import type { PushSubscriptionJSON } from './types'

let initialized = false

const ensureInit = () => {
  if (initialized) return
  webpush.setVapidDetails(env.VAPID_SUBJECT!, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!)
  initialized = true
}

const normalizeLocale = (locale: string | undefined): 'en' | 'de' => {
  if (locale?.startsWith('de')) return 'de'
  return 'en'
}

type PushPayload = { title: string; body: string; url: string }

const sendToSubscription = async (
  playerId: string,
  sub: PushSubscriptionJSON,
  payload: PushPayload,
): Promise<void> => {
  try {
    await webpush.sendNotification(sub as webpush.PushSubscription, JSON.stringify(payload))
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode
    if (statusCode === 410 || statusCode === 404) {
      await pushSubscriptionRepository.removeByEndpoint(playerId, sub.endpoint)
    } else {
      logger.error({ err, playerId }, 'Push send failed')
    }
  }
}

export const dispatchTurnNotification = async (
  playerId: string,
  inviteCode: string,
  baseUrl: string,
): Promise<void> => {
  const subs = await pushSubscriptionRepository.findAll(playerId)
  if (subs.length === 0) return
  ensureInit()
  const player = await playerRepository.findById(playerId)
  await Promise.all(
    subs.map((sub) => {
      const locale = normalizeLocale(sub.locale)
      const payload: PushPayload = {
        title: m.push_turn_title({}, { locale }),
        body: m.push_turn_body({ name: player?.name ?? '?' }, { locale }),
        url: `${baseUrl}/${inviteCode}`,
      }
      return sendToSubscription(playerId, sub, payload)
    }),
  )
}

export const dispatchGameFinishedNotification = async (
  playerId: string,
  winnerName: string,
  isWinner: boolean,
  inviteCode: string,
  baseUrl: string,
): Promise<void> => {
  const subs = await pushSubscriptionRepository.findAll(playerId)
  if (subs.length === 0) return
  ensureInit()
  await Promise.all(
    subs.map((sub) => {
      const locale = normalizeLocale(sub.locale)
      const payload: PushPayload = {
        title: isWinner ? m.push_won_title({}, { locale }) : m.push_game_over_title({}, { locale }),
        body: isWinner
          ? m.push_won_body({}, { locale })
          : m.push_game_over_body({ winnerName }, { locale }),
        url: `${baseUrl}/${inviteCode}`,
      }
      return sendToSubscription(playerId, sub, payload)
    }),
  )
}

export const notifyPlayerTurn = async (
  gameId: string,
  playerId: string,
  inviteCode: string,
  baseUrl: string,
): Promise<void> => {
  if (await isPlayerActive(gameId, playerId)) {
    setPendingNotification(gameId, playerId, { type: 'turn', inviteCode, baseUrl })
    return
  }
  clearPendingNotification(gameId, playerId)
  await dispatchTurnNotification(playerId, inviteCode, baseUrl)
}

export const notifyGameFinished = async (
  gameId: string,
  playerIds: string[],
  winnerId: string,
  inviteCode: string,
  baseUrl: string,
): Promise<void> => {
  const winner = await playerRepository.findById(winnerId)
  const winnerName = winner?.name ?? '?'
  await Promise.all(
    playerIds.map(async (playerId) => {
      const isWinner = playerId === winnerId
      if (await isPlayerActive(gameId, playerId)) {
        setPendingNotification(gameId, playerId, {
          type: 'game-finished',
          winnerName,
          isWinner,
          inviteCode,
          baseUrl,
        })
        return
      }
      clearPendingNotification(gameId, playerId)
      await dispatchGameFinishedNotification(playerId, winnerName, isWinner, inviteCode, baseUrl)
    }),
  )
}

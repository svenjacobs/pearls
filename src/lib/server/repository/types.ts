/**
 * Shared domain types used across the repository layer.
 *
 * Redis key layout
 * ────────────────
 *  player:{id}                   Hash    — player fields (id, name, createdAt, updatedAt)
 *  game:{id}                     Hash    — game fields (id, inviteCode, status, currentPlayerId,
 *                                                        createdAt, updatedAt, startedAt)
 *  game:{id}:turn-order          List    — player IDs in turn order (index 0 goes first)
 *  game:{id}:board:{playerId}    String  — JSON number[12] pearl counts per slot
 *  game:{id}:staged:{playerId}   String  — JSON number[12] staged (pending) pearl counts
 *  game:{id}:turns               List    — append-only turn IDs in chronological order
 *  game:{id}:current-turn        String  — ID of the active turn (cleared on game finish)
 *  game:{id}:reactions           ZSet    — reactions sorted by epoch-ms timestamp (score)
 *  reaction-throttle:{gId}:{pId} String  — rate-limit sentinel; expires after throttle window
 *  turn:{id}                     String  — JSON-encoded Turn
 *  invite:{code}                 String  — gameId reverse-lookup by invite code
 *  session:{id}                  Hash    — session fields (id, gameId, playerId,
 *                                                           createdAt, updatedAt)
 *  game:{id}:initiative          String  — JSON-encoded GameInitiative (waiting phase only)
 *
 * Every entity carries `createdAt` and `updatedAt` (epoch ms). `updatedAt` is
 * refreshed on every mutation so a future cleanup job can scan and expire
 * stale state by last-modified time.
 */

import type { ReactionType } from '$lib/reactions'

export type GameStatus = 'waiting' | 'playing' | 'finished'

export type Player = {
  id: string
  name: string
  pearlTheme?: string
  isAI?: boolean
  createdAt: number
  updatedAt: number
}

export type Game = {
  id: string
  inviteCode: string
  status: GameStatus
  /** Ordered list of player IDs — defines turn order. */
  playerIds: string[]
  /** Board state per player: 12 slot counts (0–7). */
  boards: Record<string, number[]>
  /** Staged (selected but not yet committed) pearl counts per player. */
  staged: Record<string, number[]>
  /** ID of the player whose turn it currently is, or null between turns. */
  currentPlayerId: string | null
  /** ID of the winning player once status === 'finished', otherwise null. */
  winnerId: string | null
  createdAt: number
  updatedAt: number
  /** Epoch ms when the game transitioned to 'playing'; null until then. */
  startedAt: number | null
}

export type GameSession = {
  id: string
  gameId: string
  playerId: string
  createdAt: number
  updatedAt: number
}

// ── Reaction entity ───────────────────────────────────────────────────────────

export type Reaction = {
  /** cuid2 unique identifier. */
  id: string
  gameId: string
  /** ID of the spectator who sent the reaction. */
  playerId: string
  type: ReactionType
  /** UTF-8 emoji character. */
  emoji: string
  /** Epoch ms timestamp. */
  at: number
}

// ── Initiative entity ─────────────────────────────────────────────────────────

/** Per-player state during the pre-game initiative (playing-order) phase. */
export type InitiativeRollState = {
  /** Face value 1–6 rolled this round; 0 means not yet rolled. */
  value: number
  /** The round in which this player last rolled (1-based). */
  round: number
  /** True once this player is no longer competing in tie-break rounds. */
  locked: boolean
}

/**
 * Tracks the dice-off phase used to determine playing order before the game
 * starts. Stored as a single JSON blob under `game:{id}:initiative`.
 */
export type GameInitiative = {
  /** Current active round (1-based). */
  round: number
  /** Per-player roll state, keyed by player ID. */
  rolls: Record<string, InitiativeRollState>
  /** IDs of players who must still roll in the current round. */
  activePlayerIds: string[]
  /**
   * Final playing order (index 0 goes first). Null until all ties are
   * resolved and every position is determined.
   */
  playerOrder: string[] | null
}

// ── Turn entity ───────────────────────────────────────────────────────────────

export type DieStatus = 'in_cup' | 'active' | 'spent'

export type Die = {
  /** Face value 1–6; 0 means not yet rolled. */
  value: number
  status: DieStatus
  /** Spent dice sharing a pairId form a sum-pair (targets 7–12). */
  pairId?: number
}

export type Roll = {
  /** Roll sequence within the turn (0-based). */
  index: number
  /** Face values rolled this time, in dice-slot order (only slots that were in_cup). */
  values: number[]
  /** Slot indices in the dice array that were re-rolled this time. */
  slots: number[]
  at: number
}

export type TurnStatus =
  | 'rolling' // dice in cup, awaiting shake
  | 'choosing' // dice rolled, awaiting target / die selection
  | 'locked' // target chosen; subsequent rolls only re-roll non-spent dice
  | 'bust' // first roll could not form any 1–12 → turn ended without scoring
  | 'pending-end' // turn naturally over (target unreachable or all dice spent); staged pearls await commit
  | 'completed' // turn ended normally after player confirmed end
  | 'forfeited' // player left mid-turn; no pearls removed

export type Turn = {
  id: string
  gameId: string
  playerId: string
  /** Sequential index within the game (0-based). */
  index: number
  /** Locked target row 1–12, or null until the player chooses. */
  target: number | null
  /** Authoritative 6-die state. */
  dice: Die[]
  /** Append-only log of every roll within this turn (for replay). */
  rolls: Roll[]
  /** Pearls removed from the target row so far this turn. */
  pearlsRemoved: number
  status: TurnStatus
  createdAt: number
  updatedAt: number
}

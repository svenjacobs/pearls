/**
 * Shared reaction types and emoji map.
 * Imported by both client-side components and server-side endpoints.
 */

export type ReactionType = 'smile' | 'frown' | 'astonished' | 'thumbs-up' | 'tada' | 'clap'

export const REACTIONS: Record<ReactionType, string> = {
  smile: '🙂',
  frown: '🙁',
  astonished: '😲',
  'thumbs-up': '👍',
  tada: '🎉',
  clap: '👏',
}

export const REACTION_TYPES = Object.keys(REACTIONS) as ReactionType[]

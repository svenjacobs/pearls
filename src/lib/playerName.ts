/** Maximum number of characters allowed in a player name. */
export const MAX_NAME_LENGTH = 20

/** Returns the display name for a player, appending 🤖 for AI players. */
export const playerDisplayName = (player: { name: string; isAI?: boolean }): string =>
  player.isAI ? `${player.name} 🤖` : player.name

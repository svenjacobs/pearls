/** Returns the display name for a player, appending 🤖 for AI players. */
export const playerDisplayName = (player: { name: string; isAI?: boolean }): string =>
  player.isAI ? `${player.name} 🤖` : player.name

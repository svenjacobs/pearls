import { env } from '$env/dynamic/private'

export const inviteUrl = (inviteCode: string): string => `${env.ORIGIN}/join/${inviteCode}`

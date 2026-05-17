import * as m from '$lib/paraglide/messages.js'

export type DurationParts = {
  days: number
  hours: number
  minutes: number
  seconds: number
}

export const splitDuration = (secs: number): DurationParts => {
  const seconds = secs % 60
  const totalMinutes = Math.floor(secs / 60)
  const minutes = totalMinutes % 60
  const totalHours = Math.floor(totalMinutes / 60)
  const hours = totalHours % 24
  const days = Math.floor(totalHours / 24)
  return { days, hours, minutes, seconds }
}

const u = (n: number, one: () => string, other: (count: number) => string) =>
  n === 1 ? one() : other(n)

export const formatDuration = (secs: number): string => {
  const { days, hours, minutes, seconds } = splitDuration(secs)
  const parts: string[] = []
  if (days > 0) parts.push(u(days, m.duration_day, (count) => m.duration_days({ count })))
  if (hours > 0 || days > 0)
    parts.push(u(hours, m.duration_hour, (count) => m.duration_hours({ count })))
  if (minutes > 0 || hours > 0 || days > 0)
    parts.push(u(minutes, m.duration_minute, (count) => m.duration_minutes({ count })))
  parts.push(u(seconds, m.duration_second, (count) => m.duration_seconds({ count })))
  return parts.join(', ')
}

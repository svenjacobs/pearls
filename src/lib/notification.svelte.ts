export type NotificationType = 'info' | 'warning' | 'error'

export type NotificationItem = {
  id: number
  text: string
  type: NotificationType
  duration: number | null
}

const DEFAULT_DURATION_MS = 3_000

class NotificationStore {
  current = $state<NotificationItem | null>(null)
  #timer: ReturnType<typeof setTimeout> | null = null
  #nextId = 0

  notify(
    text: string,
    type: NotificationType = 'info',
    duration: number | null = DEFAULT_DURATION_MS,
  ): void {
    if (this.#timer !== null) {
      clearTimeout(this.#timer)
      this.#timer = null
    }
    this.current = { id: this.#nextId++, text, type, duration }
    if (duration !== null) {
      this.#timer = setTimeout(() => {
        this.current = null
        this.#timer = null
      }, duration)
    }
  }

  dismiss(): void {
    if (this.#timer !== null) {
      clearTimeout(this.#timer)
      this.#timer = null
    }
    this.current = null
  }
}

export const notification = new NotificationStore()

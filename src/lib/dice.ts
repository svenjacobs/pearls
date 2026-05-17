export type DieStatus = 'in_cup' | 'active' | 'spent'

export type DieModel = {
  value: number
  status: DieStatus
  /** Spent dice sharing the same pairId are displayed as a stacked pair. Only meaningful when status === 'spent'. */
  pairId?: number
}

import { describe, expect, it } from 'vitest'

import {
  advanceRound,
  applyRoll,
  computePlayerOrder,
  createInitiative,
  isComplete,
  isRoundComplete,
  isTied,
} from './initiative'

describe('createInitiative', () => {
  it('initialises round 1, all players active, all values 0', () => {
    const init = createInitiative(['a', 'b', 'c'])
    expect(init.round).toBe(1)
    expect(init.activePlayerIds).toEqual(['a', 'b', 'c'])
    expect(init.playerOrder).toBeNull()
    expect(init.rolls['a']).toEqual({ value: 0, round: 1, locked: false })
    expect(init.rolls['b']).toEqual({ value: 0, round: 1, locked: false })
    expect(init.rolls['c']).toEqual({ value: 0, round: 1, locked: false })
  })

  it('handles a single player', () => {
    const init = createInitiative(['solo'])
    expect(init.activePlayerIds).toEqual(['solo'])
    expect(init.rolls['solo']).toEqual({ value: 0, round: 1, locked: false })
  })
})

describe('applyRoll', () => {
  it('records the die value and current round', () => {
    const init = createInitiative(['a', 'b'])
    const updated = applyRoll(init, 'a', 4)
    expect(updated.rolls['a']).toEqual({ value: 4, round: 1, locked: false })
    expect(updated.rolls['b']).toEqual({ value: 0, round: 1, locked: false })
  })

  it('does not mutate the original', () => {
    const init = createInitiative(['a'])
    applyRoll(init, 'a', 3)
    expect(init.rolls['a']?.value).toBe(0)
  })
})

describe('isRoundComplete', () => {
  it('false when some active players have not rolled', () => {
    const init = createInitiative(['a', 'b'])
    const partial = applyRoll(init, 'a', 5)
    expect(isRoundComplete(partial)).toBe(false)
  })

  it('true when all active players have rolled', () => {
    const init = createInitiative(['a', 'b'])
    const full = applyRoll(applyRoll(init, 'a', 5), 'b', 3)
    expect(isRoundComplete(full)).toBe(true)
  })

  it('true immediately when there are no active players', () => {
    const done = { ...createInitiative([]), activePlayerIds: [] as string[] }
    expect(isRoundComplete(done)).toBe(true)
  })
})

describe('isTied', () => {
  it('returns true when two active players rolled the same max value', () => {
    let init = createInitiative(['a', 'b', 'c'])
    init = applyRoll(init, 'a', 5)
    init = applyRoll(init, 'b', 5)
    init = applyRoll(init, 'c', 3)
    expect(isTied(init)).toBe(true)
  })

  it('returns false when one player has the unique max', () => {
    let init = createInitiative(['a', 'b'])
    init = applyRoll(init, 'a', 6)
    init = applyRoll(init, 'b', 4)
    expect(isTied(init)).toBe(false)
  })

  it('returns false for a single active player', () => {
    let init = createInitiative(['solo'])
    init = applyRoll(init, 'solo', 3)
    expect(isTied(init)).toBe(false)
  })
})

describe('computePlayerOrder', () => {
  it('sorts by round desc then value desc', () => {
    const rolls = {
      a: { value: 5, round: 2, locked: true },
      b: { value: 1, round: 2, locked: true },
      c: { value: 3, round: 1, locked: true },
      d: { value: 2, round: 1, locked: true },
    }
    expect(computePlayerOrder(rolls)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('single player', () => {
    const rolls = { only: { value: 4, round: 1, locked: true } }
    expect(computePlayerOrder(rolls)).toEqual(['only'])
  })
})

describe('advanceRound — no tie', () => {
  it('locks all players and sets playerOrder when all values distinct', () => {
    const init = createInitiative(['a', 'b', 'c', 'd'])
    const rolled = [5, 3, 6, 2].reduce(
      (acc, v, i) => applyRoll(acc, ['a', 'b', 'c', 'd'][i]!, v),
      init,
    )
    const advanced = advanceRound(rolled)
    expect(advanced.playerOrder).toEqual(['c', 'a', 'b', 'd'])
    expect(advanced.activePlayerIds).toHaveLength(0)
    expect(Object.values(advanced.rolls).every((r) => r.locked)).toBe(true)
  })

  it('single player resolves immediately', () => {
    const init = createInitiative(['solo'])
    const rolled = applyRoll(init, 'solo', 4)
    const advanced = advanceRound(rolled)
    expect(advanced.playerOrder).toEqual(['solo'])
    expect(advanced.rolls['solo']?.locked).toBe(true)
  })
})

describe('advanceRound — tie', () => {
  it('re-arms tied players and locks others', () => {
    // Players: a=5, b=5, c=3, d=2 — a and b tie for max
    const init = createInitiative(['a', 'b', 'c', 'd'])
    const rolled = applyRoll(applyRoll(applyRoll(applyRoll(init, 'a', 5), 'b', 5), 'c', 3), 'd', 2)
    const advanced = advanceRound(rolled)

    expect(advanced.round).toBe(2)
    expect(advanced.activePlayerIds).toEqual(expect.arrayContaining(['a', 'b']))
    expect(advanced.activePlayerIds).toHaveLength(2)
    expect(advanced.playerOrder).toBeNull()

    // Winners reset, ready to re-roll
    expect(advanced.rolls['a']?.value).toBe(0)
    expect(advanced.rolls['b']?.value).toBe(0)

    // Losers locked
    expect(advanced.rolls['c']?.locked).toBe(true)
    expect(advanced.rolls['d']?.locked).toBe(true)
  })

  it('full two-round scenario matches expected order', () => {
    // Round 1: a=5, b=5, c=3, d=2
    let init = createInitiative(['a', 'b', 'c', 'd'])
    init = applyRoll(applyRoll(applyRoll(applyRoll(init, 'a', 5), 'b', 5), 'c', 3), 'd', 2)
    init = advanceRound(init)

    // Round 2: a=5, b=1
    init = applyRoll(applyRoll(init, 'a', 5), 'b', 1)
    init = advanceRound(init)

    // Expected order: a(r2,5) > b(r2,1) > c(r1,3) > d(r1,2)
    expect(init.playerOrder).toEqual(['a', 'b', 'c', 'd'])
    expect(isComplete(init)).toBe(true)
  })

  it('handles three-way tie across multiple rounds', () => {
    // Round 1: all tie at 4
    let init = createInitiative(['a', 'b', 'c'])
    init = applyRoll(applyRoll(applyRoll(init, 'a', 4), 'b', 4), 'c', 4)
    init = advanceRound(init)
    expect(init.round).toBe(2)
    expect(init.playerOrder).toBeNull()

    // Round 2: a=6, b=6, c=3 — a and b still tied
    init = applyRoll(applyRoll(applyRoll(init, 'a', 6), 'b', 6), 'c', 3)
    init = advanceRound(init)
    expect(init.round).toBe(3)
    expect(init.rolls['c']?.locked).toBe(true)
    expect(init.playerOrder).toBeNull()

    // Round 3: a=2, b=5 — resolved
    init = applyRoll(applyRoll(init, 'a', 2), 'b', 5)
    init = advanceRound(init)

    // b(r3,5) > a(r3,2) > c(r2,3)
    expect(init.playerOrder).toEqual(['b', 'a', 'c'])
    expect(isComplete(init)).toBe(true)
  })
})

describe('isComplete', () => {
  it('false when playerOrder is null', () => {
    expect(isComplete(createInitiative(['a', 'b']))).toBe(false)
  })

  it('true when playerOrder is set', () => {
    const init = createInitiative(['a'])
    const advanced = advanceRound(applyRoll(init, 'a', 3))
    expect(isComplete(advanced)).toBe(true)
  })
})

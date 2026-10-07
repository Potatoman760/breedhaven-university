import { describe, expect, it } from 'vitest'
import { describeRoll, rollDice, rollRange } from './dice'

/** Hands out the given numbers in turn, as a source of randomness would. */
const fixed = (...values: number[]) => {
  let i = 0
  return () => values[i++ % values.length]
}

describe('rollDice', () => {
  it('reads the usual notation', () => {
    expect(rollDice('d6', fixed(0))).toEqual({ label: 'd6', rolls: [1], modifier: 0, total: 1 })
    expect(rollDice('D20', fixed(0.999))).toMatchObject({ label: 'd20', rolls: [20], total: 20 })
    expect(rollDice(' 2d6 + 3 ', fixed(0.5, 0.99))).toEqual({ label: '2d6+3', rolls: [4, 6], modifier: 3, total: 13 })
    expect(rollDice('3d8-2', fixed(0))).toMatchObject({ label: '3d8-2', rolls: [1, 1, 1], total: 1 })
    expect(rollDice('d%', fixed(0.5))).toMatchObject({ label: 'd100', total: 51 })
  })

  it('stays within the die, however it is rolled', () => {
    for (let i = 0; i < 500; i++) {
      const { total } = rollDice('d6')
      expect(total).toBeGreaterThanOrEqual(1)
      expect(total).toBeLessThanOrEqual(6)
    }
  })

  it('says what is wrong with what it cannot roll', () => {
    expect(() => rollDice('six')).toThrow(/is not dice/)
    expect(() => rollDice('0d6')).toThrow(/between 1 and 20 dice/)
    expect(() => rollDice('99d6')).toThrow(/between 1 and 20 dice/)
    expect(() => rollDice('d1')).toThrow(/between 2 and 1000 sides/)
  })
})

describe('rollRange', () => {
  it('picks a whole number with both ends included, given either way round', () => {
    expect(rollRange(30, 100, fixed(0))).toEqual({ label: '30-100', rolls: [30], modifier: 0, total: 30 })
    expect(rollRange(100, 30, fixed(0.9999)).total).toBe(100)
    expect(rollRange(5, 5).total).toBe(5)
    expect(() => rollRange(Number.NaN, 3)).toThrow(/two numbers/)
    expect(() => rollRange(1.2, 1.8)).toThrow(/no whole number/)
  })
})

describe('describeRoll', () => {
  it('shows the dice as they fell when there is more than one number to add', () => {
    expect(describeRoll(rollDice('d20', fixed(0.8)))).toBe('d20: 17')
    expect(describeRoll(rollDice('2d6+3', fixed(0.5, 0.67)))).toBe('2d6+3: 4 + 5 + 3 = 12')
    expect(describeRoll(rollDice('d6-1', fixed(0.5)))).toBe('d6-1: 4 - 1 = 3')
    expect(describeRoll(rollRange(30, 100, fixed(0.5)))).toBe('30-100: 65')
  })
})

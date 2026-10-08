import { describe, expect, it } from 'vitest'
import type { GameState } from '../model'
import { canPerform, describeEffects, perform } from './activities'
import { createInitialState } from './state'
import { fixture } from './testFixture'

// In the fixture the player starts at home; work is at the shop, where Ana spends the day.
const content = fixture()
const activity = (id: string) => content.activities.find((a) => a.id === id)!
const start = (): GameState => createInitialState(content)
const atShop = (): GameState => ({ ...start(), locationId: 'shop' })
const withAffection = (state: GameState, affection: number): GameState => ({
  ...state,
  relationships: { ana: { affection, trust: 0, desire: 0 } }
})

describe('perform', () => {
  it('applies effects and advances the clock, without moving the player', () => {
    const after = perform(activity('work'), atShop(), content)
    expect(after.time).toBe(4)
    expect(after.locationId).toBe('shop')
    expect(after.player.money).toBe(10)
    expect(after.player.energy).toBe(30)
  })

  it('does not modify the input state', () => {
    const before = atShop()
    perform(activity('work'), before, content)
    expect(before).toEqual(atShop())
  })

  it('clamps energy to the maximum', () => {
    const rested = { ...start(), player: { ...start().player, energy: 80 } }
    expect(perform(activity('nap'), rested, content).player.energy).toBe(100)
  })

  it('applies meter effects to the partner', () => {
    const after = perform(activity('date'), withAffection(atShop(), 30), content, 'ana')
    expect(after.relationships.ana.affection).toBe(35)
    expect(after.time).toBe(2)
  })

  it('throws when the activity is unavailable', () => {
    expect(() => perform(activity('date'), start(), content)).toThrow(/Cannot perform "Date"/)
  })
})

describe('canPerform', () => {
  it('requires the player to be at the activity\'s location', () => {
    expect(canPerform(activity('work'), start(), content).reasons).toEqual(['Go to the Shop first'])
    expect(canPerform(activity('work'), atShop(), content).ok).toBe(true)
  })

  it('rejects when a requirement is unmet', () => {
    const tired = { ...atShop(), player: { ...start().player, energy: 10 } }
    expect(canPerform(activity('work'), tired, content).reasons).toEqual(['Requires 20 energy'])
  })

  it('rejects when the location is closed', () => {
    const late = { ...atShop(), time: 10 }
    expect(canPerform(activity('work'), late, content).reasons).toEqual(['the Shop is closed'])
  })

  it('requires a partner at a sufficient relationship stage', () => {
    expect(canPerform(activity('date'), atShop(), content).reasons).toContain(
      'Needs someone to do it with'
    )
    expect(canPerform(activity('date'), atShop(), content, 'ana').reasons).toEqual([
      'Requires Friend or closer with them'
    ])
    expect(canPerform(activity('date'), withAffection(atShop(), 30), content, 'ana').ok).toBe(true)
  })

  it('requires the partner to be where the player is, unless they are out together', () => {
    const friends = withAffection(start(), 30)
    expect(canPerform(activity('date'), friends, content, 'ana').reasons).toEqual(['Ana is not here'])
    expect(canPerform(activity('date'), friends, content, 'ana', true).ok).toBe(true)
    // At night Ana's schedule no longer puts her at the shop.
    const night = { ...withAffection(atShop(), 30), time: 9 }
    expect(canPerform(activity('date'), night, content, 'ana').reasons).toEqual(['Ana is not here'])
  })

  it('respects weekday and period availability', () => {
    expect(canPerform(activity('stargaze'), start(), content).reasons).toEqual([
      'Only during Night'
    ])
    expect(canPerform(activity('stargaze'), { ...start(), time: 14 }, content).reasons).toEqual([
      'Only on Two'
    ])
    expect(canPerform(activity('stargaze'), { ...start(), time: 9 }, content).ok).toBe(true)
  })

  it('rejects everything once the game is over', () => {
    expect(canPerform(activity('nap'), { ...start(), time: 134 }, content).ok).toBe(false)
  })
})

describe('describeEffects', () => {
  it('summarises what an activity changes', () => {
    expect(describeEffects(activity('work'))).toEqual(['+$10', '−20 energy'])
    expect(describeEffects(activity('date'))).toEqual(['+5 affection'])
  })
})

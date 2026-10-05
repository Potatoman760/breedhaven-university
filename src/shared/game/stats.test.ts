import { describe, expect, it } from 'vitest'
import type { ContentPack, GameState } from '../model'
import { applyEffect } from './conditions'
import { buildCharacterPrompt } from './prompt'
import { createInitialState, reconcileState } from './state'
import { affectionGain, appeal, appealLevel, describeStat } from './stats'
import { fixture } from './testFixture'

const base = fixture()
// Ana likes them strong and charming.
const content: ContentPack = {
  ...base,
  loveInterests: [{ ...base.loveInterests[0], admires: ['strength', 'charisma'] }]
}
const ana = content.loveInterests[0]
const withStats = (stats: Record<string, number>): GameState => {
  const state = createInitialState(content)
  return { ...state, player: { ...state.player, stats } }
}

describe('appeal', () => {
  it('is the average of the stats a love interest admires, in three levels', () => {
    expect(appeal(withStats({ strength: 10, charisma: 4, wisdom: 99 }), ana)).toBe(7)
    expect(appealLevel(withStats({ strength: 10, charisma: 4 }), ana)).toBe(0)
    expect(appealLevel(withStats({ strength: 10, charisma: 6 }), ana)).toBe(1)
    expect(appealLevel(withStats({ strength: 14, charisma: 10 }), ana)).toBe(2)
    expect(appealLevel(withStats({ strength: 99 }), base.loveInterests[0])).toBe(0)
  })

  it('makes affection grow faster, and leaves losses and other meters alone', () => {
    const taken = withStats({ strength: 14, charisma: 10 })
    expect(affectionGain(content, taken, 'ana', 1)).toBe(2)
    expect(affectionGain(content, taken, 'ana', 4)).toBe(6)
    expect(affectionGain(content, taken, 'ana', -4)).toBe(-4)
    expect(affectionGain(content, withStats({}), 'ana', 4)).toBe(4)

    const gain = (meter: 'affection' | 'trust') =>
      applyEffect(taken, { type: 'meter', meter, amount: 4 }, { content, loveInterestId: 'ana' }).relationships['ana'][meter]
    expect(gain('affection')).toBe(6)
    expect(gain('trust')).toBe(4)
  })

  it('is told to the character, with what anyone can see of the player', () => {
    expect(describeStat(7)).toBe('ordinary')
    expect(describeStat(12)).toBe('impressive')
    const plain = buildCharacterPrompt({ content, state: withStats({ strength: 5, charisma: 5 }), loveInterestId: 'ana' })
    expect(plain).toContain('strength ordinary (5)')
    expect(plain).toContain('You are drawn to strength and charisma in a man. So far nothing about Pat has caught your eye')
    const strong = buildCharacterPrompt({ content, state: withStats({ strength: 14, charisma: 12 }), loveInterestId: 'ana' })
    expect(strong).toContain('strength impressive (14)')
    expect(strong).toContain('Pat is hard for you to ignore')
  })
})

describe('older saves', () => {
  it('get the six stats, keeping what was earned under the old names', () => {
    const six = { intelligence: 5, charisma: 5, endurance: 5, strength: 5, dexterity: 5, wisdom: 5 }
    const real: ContentPack = {
      ...content,
      newGame: { ...content.newGame, player: { ...content.newGame.player, stats: six } }
    }
    const fresh = createInitialState(real)
    const old = { ...fresh, player: { ...fresh.player, stats: { intellect: 7, charm: 1, fitness: 3 } } }
    expect(reconcileState(old, real).player.stats).toEqual({ ...six, intelligence: 12, charisma: 6, endurance: 8 })
    expect(reconcileState(fresh, real).player.stats).toEqual(six)
  })
})

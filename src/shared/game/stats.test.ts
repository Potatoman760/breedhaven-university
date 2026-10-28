import { describe, expect, it } from 'vitest'
import type { ContentPack, GameState } from '../model'
import { applyEffect } from './conditions'
import { buildCharacterPrompt } from './prompt'
import { createInitialState } from './state'
import { STAT_CAP, statCost, trainingToward, trainStat, abilityModifier, adjustStat, affectionGain, appeal, appealLevel, describeModifier, describeStat, pointCost, pointsLeft, pointsSpent, randomStats, startingStats } from './stats'
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
    expect(appealLevel(withStats({ strength: 16, charisma: 12 }), ana)).toBe(1)
    expect(appealLevel(withStats({ strength: 20, charisma: 16 }), ana)).toBe(2)
    expect(appealLevel(withStats({ strength: 99 }), base.loveInterests[0])).toBe(0)
  })

  it('makes affection grow faster, and leaves losses and other meters alone', () => {
    const taken = withStats({ strength: 20, charisma: 16 })
    expect(affectionGain(content, taken, 'ana', 1)).toBe(2)
    expect(affectionGain(content, taken, 'ana', 4)).toBe(6)
    expect(affectionGain(content, taken, 'ana', -4)).toBe(-4)
    expect(affectionGain(content, withStats({}), 'ana', 4)).toBe(4)

    const gain = (meter: 'affection' | 'trust') =>
      applyEffect(taken, { type: 'meter', meter, amount: 4 }, { content, loveInterestId: 'ana' }).relationships['ana'][meter]
    expect(gain('affection')).toBe(6)
    expect(gain('trust')).toBe(4)
  })

  it('is told to the character as what draws her, without his numbers, and not at all when nothing does', () => {
    expect(describeStat(10)).toBe('ordinary')
    expect(describeStat(14)).toBe('good')
    expect(describeStat(18)).toBe('impressive')
    expect(describeStat(22)).toBe('exceptional')
    expect(describeStat(26)).toBe('legendary')
    const plain = buildCharacterPrompt({ content, state: withStats({ strength: 10, charisma: 10 }), loveInterestId: 'ana' })
    expect(plain).not.toContain('You are drawn to')
    expect(plain).not.toContain('ordinary')
    const strong = buildCharacterPrompt({ content, state: withStats({ strength: 19, charisma: 18 }), loveInterestId: 'ana' })
    expect(strong).toContain("You are drawn to Pat's impressive strength and impressive charisma. It makes him hard for you to ignore")
    expect(strong).not.toContain('19')
    // Only what is better than ordinary is named.
    const one = buildCharacterPrompt({ content, state: withStats({ strength: 10, charisma: 14 }), loveInterestId: 'ana' })
    expect(one).toContain("You are drawn to Pat's good charisma.")
    expect(one).not.toContain('strength')
  })
})

describe('setting stats from a pool of points', () => {
  it('starts everything at the lowest, with the whole pool to spend', () => {
    const stats = startingStats()
    expect(Object.keys(stats)).toEqual(['strength', 'dexterity', 'endurance', 'intelligence', 'charisma', 'wisdom'])
    expect(Object.values(stats)).toEqual([8, 8, 8, 8, 8, 8])
    expect(pointsSpent(stats)).toBe(0)
    expect(pointsLeft(stats)).toBe(27)
  })

  it('charges a point a point up to 13, and two for each of the two above', () => {
    expect([8, 9, 10, 11, 12, 13, 14, 15].map(pointCost)).toEqual([0, 1, 2, 3, 4, 5, 7, 9])
    // The spreads everyone knows cost exactly the pool.
    expect(pointsSpent({ strength: 15, dexterity: 14, endurance: 13, intelligence: 12, charisma: 10, wisdom: 8 })).toBe(27)
    expect(pointsSpent({ strength: 15, dexterity: 15, endurance: 15, intelligence: 8, charisma: 8, wisdom: 8 })).toBe(27)
    expect(pointsSpent({ strength: 13, dexterity: 13, endurance: 13, intelligence: 12, charisma: 12, wisdom: 12 })).toBe(27)
  })

  it('raises and lowers a stat a step at a time, within the scores allowed and the points left', () => {
    let stats = startingStats()
    stats = adjustStat(stats, 'strength', 1)
    expect(stats.strength).toBe(9)
    expect(pointsLeft(stats)).toBe(26)
    // Not below the lowest, nor above the highest.
    expect(adjustStat(startingStats(), 'wisdom', -1)).toEqual(startingStats())
    const top = { ...startingStats(), strength: 15 }
    expect(adjustStat(top, 'strength', 1)).toBe(top)
    // Not past what is left: three at 15 use it all.
    const spent = { ...startingStats(), strength: 15, dexterity: 15, endurance: 15 }
    expect(pointsLeft(spent)).toBe(0)
    expect(adjustStat(spent, 'wisdom', 1)).toBe(spent)
    expect(adjustStat(spent, 'strength', -1).strength).toBe(14)
    // One point left does not buy a step that costs two.
    const nearly = { ...startingStats(), strength: 15, dexterity: 15, endurance: 13, intelligence: 11 }
    expect(pointsLeft(nearly)).toBe(1)
    expect(adjustStat(nearly, 'endurance', 1)).toBe(nearly)
    expect(adjustStat(nearly, 'wisdom', 1).wisdom).toBe(9)
  })

  it('is what a new game begins with', () => {
    const stats = { ...startingStats(), strength: 15, charisma: 14 }
    expect(createInitialState(content, 'Kit', 0, stats).player.stats).toMatchObject({ strength: 15, charisma: 14, wisdom: 8 })
    // Without any, he has the content's own.
    expect(createInitialState(content).player.stats).toEqual(content.newGame.player.stats)
  })

  it('gives each score its modifier', () => {
    expect([3, 8, 9, 10, 11, 12, 15, 18].map(abilityModifier)).toEqual([-4, -1, -1, 0, 0, 1, 2, 4])
    expect(describeModifier(14)).toBe('+2')
    expect(describeModifier(10)).toBe('+0')
    expect(describeModifier(7)).toBe('-2')
  })
})

describe('training a stat', () => {
  // The fixture's days are 20 hours long, so each of these is a day apart.
  const onDay = (state: GameState, day: number): GameState => ({ ...state, time: day * 20 })

  it('costs more for each point the better he already is', () => {
    expect([8, 10, 11, 12, 14, 16, 18, 20, 24, 28, 29].map(statCost)).toEqual([1, 2, 2, 4, 6, 8, 10, 12, 16, 20, 20])
    // From an ordinary 10: 12 points of training to 14, 60 to 20, and 220 to the cap.
    const total = (to: number) => Array.from({ length: to - 10 }, (_, i) => statCost(10 + i)).reduce((sum, cost) => sum + cost, 0)
    expect([14, 20, 30].map(total)).toEqual([12, 60, 220])
  })

  it('banks the work until there is enough for the next point', () => {
    let state = withStats({ strength: 12 })
    state = trainStat(content, state, 'strength', 2)
    expect(state.player.stats['strength']).toBe(12)
    expect(trainingToward(state, 'strength')).toEqual({ banked: 2, needed: 4 })
    // Two more the next day buys the point, and the count starts again at the new price.
    state = trainStat(content, onDay(state, 1), 'strength', 2)
    expect(state.player.stats['strength']).toBe(13)
    expect(trainingToward(state, 'strength')).toEqual({ banked: 0, needed: 4 })
    // A stat effect, wherever it comes from, is this.
    const viaEffect = applyEffect(withStats({ strength: 10 }), { type: 'stat', stat: 'strength', amount: 2 }, { content })
    expect(viaEffect.player.stats['strength']).toBe(11)
    expect(trainStat(content, state, 'strength', 0)).toBe(state)
  })

  it('counts a day of one stat for less the more of it there is, and each stat on its own', () => {
    let state = withStats({ strength: 20, wisdom: 20 })
    state = trainStat(content, state, 'strength', 6)
    expect(state.training['strength']).toBe(6)
    // The next six points of the day count for half, and anything after for nothing.
    state = trainStat(content, state, 'strength', 6)
    expect(state.training['strength']).toBe(9)
    state = trainStat(content, state, 'strength', 5)
    expect(state.training['strength']).toBe(9)
    // Another stat has its own day.
    state = trainStat(content, state, 'wisdom', 1)
    expect(state.training['wisdom']).toBe(1)
    // And tomorrow is a new one.
    state = trainStat(content, onDay(state, 1), 'strength', 1)
    expect(state.training['strength']).toBe(10)
  })

  it('never takes a score past the cap', () => {
    let state = withStats({ strength: 29 })
    for (let day = 0; day < 12; day++) state = trainStat(content, onDay(state, day), 'strength', 2)
    expect(state.player.stats['strength']).toBe(STAT_CAP)
    expect(state.training['strength']).toBe(0)
    expect(trainStat(content, onDay(state, 20), 'strength', 2).player.stats['strength']).toBe(30)
  })
})

describe('random starting stats', () => {
  it('spend the whole pool, within the lowest and highest score, and differ from draw to draw', () => {
    const seen = new Set<string>()
    for (let seed = 1; seed <= 40; seed++) {
      let x = seed
      const random = () => ((x = (x * 16807) % 2147483647) - 1) / 2147483646
      const stats = randomStats(random)
      expect(pointsLeft(stats)).toBe(0)
      for (const score of Object.values(stats)) {
        expect(score).toBeGreaterThanOrEqual(8)
        expect(score).toBeLessThanOrEqual(15)
      }
      seen.add(JSON.stringify(stats))
    }
    expect(seen.size).toBeGreaterThan(10)
  })
})

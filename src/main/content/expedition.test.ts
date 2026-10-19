import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { canGoBelow, createInitialState, startRun, timeOn } from '../../shared/game'
import { playOut } from '../../shared/game/expeditionPolicy'
import { MODIFIER_KINDS, kindOf, type GameState } from '../../shared/model'
import { loadContentPack } from './loader'

/** The Undercroft as it ships: who can go, and that its depths are neither given away nor out of reach. */
describe('the Undercroft of the default pack', () => {
  const content = loadContentPack(join(process.cwd(), 'content', 'default'))

  it('has a file for every picture its fights are drawn with', () => {
    const effects = Object.entries(content.expedition!.effects)
    expect(effects.length).toBeGreaterThan(0)
    expect(effects.filter(([, path]) => !existsSync(join(process.cwd(), 'content', 'default', path))).map(([name]) => name)).toEqual([])
  })
  const config = content.expedition!
  const begun = createInitialState(content)

  /** Him at the way down on a free hour, every stat the same, with women who trust him, one of them perhaps carrying, and every depth open. */
  function ready(stat: number, party: string[], carrying: Record<string, number>, seed: number): GameState {
    const state: GameState = {
      ...begun,
      weatherSeed: seed,
      locationId: config.entryLocationId,
      met: party,
      orientationStep: 99,
      player: { ...begun.player, energy: begun.player.maxEnergy, stats: Object.fromEntries(Object.keys(begun.player.stats).map((key) => [key, stat])) },
      relationships: { ...begun.relationships, ...Object.fromEntries(party.map((id) => [id, { affection: 60, trust: 60, desire: 40 }])) },
      expedition: { ...begun.expedition, invited: true, cleared: config.depths.length }
    }
    const length = content.pregnancy!.lengthDays * content.calendar.hoursPerDay
    for (let day = 12; day < 40; day++) {
      for (const hour of [8, 10, 13, 15]) {
        const time = timeOn(content, day, hour)
        const then = { ...state, time, pregnancies: Object.fromEntries(Object.entries(carrying).map(([id, progress]) => [id, { conceivedAt: Math.max(0, Math.round(time - progress * length)), dueAt: Math.round(time + (1 - progress) * length) }])) }
        if (canGoBelow(content, then, party, 0).ok) return then
      }
    }
    throw new Error(`No hour at which ${party.join(' and ')} can come`)
  }
  const wins = (stat: number, party: string[], carrying: Record<string, number>, depth: number, tries = 10): number =>
    Array.from({ length: tries }, (_, index) => playOut(content, startRun(content, ready(stat, party, carrying, (index + 1) * 7919), party, depth)).outcome).filter((outcome) => outcome === 'won').length

  it('gives every love interest a part to play, and nobody else', () => {
    for (const li of content.loveInterests) expect(li.partyRole !== undefined, li.id).toBe(kindOf(li) !== 'npc')
    for (const role of config.roles) expect(content.loveInterests.some((li) => li.partyRole === role.id), role.id).toBe(true)
  })

  it('opens after the first week, from somewhere there is, on the word of someone there is', () => {
    expect(config).toMatchObject({ entryLocationId: 'bathhouse', opensOnDay: 8, guideId: 'vespera', hours: 3, partySize: 2 })
    expect(config.intro).toMatchObject({ hours: 1 })
    for (const text of [config.intro!.text, config.intro!.missedText]) for (const gap of ['{date}', '{place}']) expect(text).toContain(gap)
    // She shows him in a scene of her own, at the way down.
    expect(config.intro!.cutscene).toMatchObject({ speakerId: 'vespera', scenes: [{ locationId: 'bathhouse' }] })
  })

  it('has eight depths, each with a relic that does something: a modifier or traits while it is on, or a use in a scene', () => {
    expect(config.depths).toHaveLength(8)
    const traits = content.traits.map((trait) => trait.id)
    for (const depth of config.depths) {
      const { modifier, traitIds, use } = depth.relic
      expect(modifier !== undefined || traitIds.length > 0 || use !== undefined, depth.name).toBe(true)
      if (modifier) expect(MODIFIER_KINDS as readonly string[], depth.name).toContain(modifier.kind)
      for (const id of traitIds) expect(traits, depth.name).toContain(id)
      expect(depth.nodes.map((node) => node.kind).filter((kind) => kind === 'checkpoint'), depth.name).toHaveLength(1)
    }
  })

  it('is not to be done alone, is easy at the top with a party, and can be finished by a strong one', () => {
    // By himself, as he starts, he does not get past the first guardian.
    expect(wins(8, [], {}, 0)).toBe(0)
    // Two women and middling stats see the first three depths through every time.
    for (const depth of [0, 1, 2]) expect(wins(12, ['seraphine', 'faye'], {}, depth), config.depths[depth].name).toBe(10)
    // The last is hard, and not beyond a trained man with a healer and a woman far along: even played plainly it is won sometimes.
    const deepest = wins(16, ['tink', 'dinah'], { tink: 0.8 }, config.depths.length - 1, 20)
    expect(deepest).toBeGreaterThan(0)
    expect(deepest).toBeLessThan(20)
  })

  it('is stronger with a woman who is carrying than with the same woman who is not', () => {
    const depth = 5
    expect(wins(12, ['tink', 'dinah'], { tink: 0.8 }, depth, 20)).toBeGreaterThan(wins(12, ['tink', 'dinah'], {}, depth, 20))
  })
})

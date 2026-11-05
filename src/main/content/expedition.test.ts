import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { canGoBelow, createInitialState, startRun, timeOn } from '../../shared/game'
import { playOut } from '../../shared/game/expeditionPolicy'
import { EXPRESSIONS, MODIFIER_KINDS, kindOf, type GameState } from '../../shared/model'
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

  type Feel = { affection: number; trust: number; desire: number }
  // Where the women stand with him: dating, as the middle of the game has them; friends as the first week does; lovers.
  const DATING = { affection: 60, trust: 60, desire: 40 }
  const FRIENDS = { affection: 30, trust: 32, desire: 15 }
  const LOVERS = { affection: 95, trust: 95, desire: 95 }

  /** Him at the way down on a free hour, every stat the same, with women who feel this for him, one of them perhaps carrying, and every depth open. */
  function ready(stat: number, party: string[], carrying: Record<string, number>, seed: number, feel: Feel = DATING): GameState {
    const state: GameState = {
      ...begun,
      weatherSeed: seed,
      locationId: config.entryLocationId,
      met: party,
      orientationStep: 99,
      player: { ...begun.player, energy: begun.player.maxEnergy, stats: Object.fromEntries(Object.keys(begun.player.stats).map((key) => [key, stat])) },
      relationships: { ...begun.relationships, ...Object.fromEntries(party.map((id) => [id, feel])) },
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
  const wins = (stat: number, party: string[], carrying: Record<string, number>, depth: number, tries = 10, feel: Feel = DATING): number =>
    Array.from({ length: tries }, (_, index) => playOut(content, startRun(content, ready(stat, party, carrying, (index + 1) * 7919, feel), party, depth)).outcome).filter((outcome) => outcome === 'won').length

  it('gives every love interest a part to play, and nobody else', () => {
    for (const li of content.loveInterests) expect(li.partyRole !== undefined, li.id).toBe(kindOf(li) !== 'npc')
    for (const role of config.roles) expect(content.loveInterests.some((li) => li.partyRole === role.id), role.id).toBe(true)
  })

  it('gives every role a move from Friend and every woman who comes below an ultimate of her own from Lover', () => {
    expect(config).toMatchObject({ roleMoveStage: 'friend', ultimateStage: 'lover' })
    expect(config.roles.map((role) => [role.id, role.friendAction.id])).toEqual([['guard', 'quake'], ['striker', 'flame-wave'], ['hexer', 'wither'], ['warder', 'dispel'], ['healer', 'renewal']])
    const women = content.loveInterests.filter((li) => li.partyRole)
    for (const li of women) expect(li.ultimate, li.id).toBeDefined()
    expect(new Set(women.map((li) => li.ultimate!.id)).size).toBe(women.length)
    expect(new Set(women.map((li) => li.ultimate!.name)).size).toBe(women.length)
  })

  it('fights harder the deeper it goes: plain at the top, new ways of fighting below, and guardians that turn as they are worn down', () => {
    const enemy = (id: string) => config.enemies.find((one) => one.id === id)!
    const ways = (id: string) => {
      const one = enemy(id)
      return [one.armor > 0 && 'armor', one.charges > 0 && 'charges', one.summons && 'summons', one.mends > 0 && 'mends', one.silences && 'silences'].filter(Boolean)
    }
    // The first depth's fights do nothing but hit.
    for (const id of config.depths[0].nodes.filter((node) => node.kind === 'fight').flatMap((node) => node.enemyIds)) expect(ways(id), id).toEqual([])
    // Every guardian turns at least once as it is worn down, and the last more than once.
    for (const depth of config.depths) {
      const guardian = depth.nodes.at(-1)!.enemyIds[0]
      expect(enemy(guardian).phases.length, guardian).toBeGreaterThan(0)
    }
    expect(enemy(config.depths.at(-1)!.nodes.at(-1)!.enemyIds[0]).phases.length).toBeGreaterThan(1)
  })

  it('gives every woman who fights below but Lira an outfit to earn in the echoes: for her days, locked, and drawn', () => {
    for (const li of content.loveInterests.filter((one) => one.partyRole && one.id !== 'lira')) {
      const earned = li.outfits.find((outfit) => outfit.id === config.echoes.outfitId)
      expect(earned, li.id).toMatchObject({ day: true, locked: 'echoes' })
      // Every face of hers, as a day outfit needs, and its pregnant form's.
      const carrying = li.outfits.find((outfit) => outfit.pregnant && outfit.inherits === config.echoes.outfitId)
      for (const outfit of [earned, carrying]) for (const face of EXPRESSIONS) expect(outfit?.sprites[face] && existsSync(join(process.cwd(), 'content', 'default', outfit.sprites[face].image)), `${li.id} ${outfit?.id} ${face}`).toBe(true)
    }
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

  it('is not to be done alone, gives the first two to two friends the week it opens, and gets harder all the way down', () => {
    // By himself, as he starts, he does not get past the first guardian.
    expect(wins(8, [], {}, 0)).toBe(0)
    // The week it opens, as he is, with two women who only just trust him enough: the first two are theirs every time.
    for (const depth of [0, 1]) expect(wins(10, ['seraphine', 'faye'], {}, depth, 10, FRIENDS), config.depths[depth].name).toBe(10)
    // The third is not, yet.
    expect(wins(10, ['seraphine', 'faye'], {}, 2, 10, FRIENDS)).toBeLessThan(10)
    // Each depth asks more of its enemies than the one above it.
    for (let i = 1; i < config.depths.length; i++) expect(config.depths[i].power, config.depths[i].name).toBeGreaterThanOrEqual(i === 6 ? 1 : config.depths[i - 1].power)
    // The middle of the game, dating, gets through the middle depths only some of the time.
    const middle = wins(12, ['seraphine', 'faye'], {}, 4, 10)
    expect(middle).toBeGreaterThan(0)
    expect(middle).toBeLessThan(10)
  })

  it('keeps the last two depths, and the echoes past them, for a party of lovers, who finish them some of the time', () => {
    for (const depth of [6, 7, config.depths.length]) {
      expect(canGoBelow(content, ready(16, ['tink', 'dinah'], {}, 7919, LOVERS), ['tink', 'dinah'], depth).ok).toBe(true)
      expect(canGoBelow(content, ready(16, ['tink', 'dinah'], {}, 7919, { ...LOVERS, affection: 80 }), ['tink', 'dinah'], depth).reasons.some((reason) => reason.includes('lover'))).toBe(true)
    }
    const deepest = wins(16, ['tink', 'dinah'], {}, config.depths.length - 1, 20, LOVERS)
    expect(deepest).toBeGreaterThan(0)
    expect(deepest).toBeLessThan(20)
  })

  it('is stronger with a woman who is carrying than with the same woman who is not', () => {
    // The Boiler Vaults: hard enough that the child she carries tells.
    const depth = 3
    expect(wins(12, ['tink', 'dinah'], { tink: 0.8 }, depth, 20)).toBeGreaterThan(wins(12, ['tink', 'dinah'], {}, depth, 20))
  })
})

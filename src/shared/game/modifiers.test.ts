import { describe, expect, it } from 'vitest'
import { PregnancyConfigSchema, type ContentPack, type Course, type GameState, type Modifier, type Skill } from '../model'
import { applyEffects } from './conditions'
import { spendOnFocus, setFocus } from './focus'
import { coursePoints } from './grades'
import { desireNeeded, sexGate } from './intimacy'
import { shiftPay } from './jobs'
import { canUse, carried, consume, giftReaction, giveGift, priceOf, useItem } from './market'
import { applyFeelings } from './memory'
import { growTies, tieKey } from './bonds'
import { devotedMothers } from './pregnancy'
import { addBoon, bonus, describeChange, factor, feltChange, inForce, liveBoons, skillsLearnt, trustOf } from './modifiers'
import { canConceive, conceive } from './pregnancy'
import { canUseAbility, readyIn, skillsOf, useAbility } from './skills'
import { createInitialState } from './state'
import { trainingToward, trainStat } from './stats'
import { fixture } from './testFixture'

const course = (code: string): Course => ({
  id: code.toLowerCase(),
  number: `${code} 101`,
  title: code,
  professor: 'Doctor Reed',
  description: '',
  subject: code,
  code,
  general: true,
  stats: ['wisdom'],
  studentIds: [],
  locationId: 'shop',
  meetings: [{ weekday: 'One', startHour: 8, hours: 1, kind: 'lecture' }]
})
const base = fixture()
const [ana] = base.loveInterests
const passive = (code: string, modifier: Modifier): Skill => ({ id: code.toLowerCase(), name: code, description: '', code, courseId: code.toLowerCase(), at: 30, passive: modifier })

/** The fixture with one skill, and a game in which he has it. */
function learnt(skill: Skill, more: Partial<ContentPack> = {}): { content: ContentPack; state: GameState; plain: GameState } {
  const content: ContentPack = {
    ...base,
    loveInterests: [{ ...ana, traitIds: [], likes: ['flowers'], dislikes: [] }, { ...ana, id: 'bea', name: 'Bea Stone', traitIds: ['prim'] }],
    relationships: { ...base.relationships, intimacy: { easyTraitIds: [], minDesire: 25, reluctantTraitIds: ['prim'], reluctantMinDesire: 50 } },
    skills: [skill],
    ...more
  }
  const plain: GameState = { ...createInitialState(content), courses: [course(skill.code)], enrolment: [skill.code.toLowerCase()] }
  return { content, plain, state: { ...plain, coursePoints: { [skill.code.toLowerCase()]: 30 } } }
}
const known = (state: GameState, id: string, desire = 0): GameState => ({
  ...state,
  memories: { ...state.memories, [id]: [{ time: 0, summary: 'They met.', level: 'normal' as const }] },
  relationships: { ...state.relationships, [id]: { affection: 20, trust: 20, desire } }
})

describe('what he has learnt', () => {
  it('is learnt in whichever section of its course he is in, on that section’s marks', () => {
    const { content, plain } = learnt(passive('HSP', { kind: 'wages', amount: 1.15 }))
    const second: Course = { ...course('HSP'), id: 'hsp-2', courseId: 'hsp', section: 2 }
    const inSecond: GameState = { ...plain, courses: [course('HSP'), second], enrolment: ['hsp-2'], coursePoints: { 'hsp-2': 30 } }
    expect(skillsLearnt(content, inSecond).map((skill) => skill.id)).toEqual(['hsp'])
    expect(skillsOf(content, inSecond).map((skill) => skill.id)).toEqual(['hsp'])
    // Marks in the section he is not in count for nothing.
    expect(skillsLearnt(content, { ...inSecond, coursePoints: { hsp: 30 } })).toEqual([])
  })

  it('changes a number only once he has the marks, in a course he is taking', () => {
    const { content, state, plain } = learnt(passive('HSP', { kind: 'wages', amount: 1.15 }))
    expect(skillsLearnt(content, plain)).toEqual([])
    expect(factor(content, plain, 'wages')).toBe(1)
    expect(skillsOf(content, state).map((skill) => skill.id)).toEqual(['hsp'])
    expect(factor(content, state, 'wages')).toBe(1.15)
    expect(factor(content, { ...state, enrolment: [] }, 'wages')).toBe(1)
    // Nothing else is touched by it.
    expect(factor(content, state, 'prices')).toBe(1)
    expect(bonus(content, state, 'comfort')).toBe(0)
    expect(inForce(content, state, 'unguarded')).toBe(false)
  })

  it('makes the work on a stat go further, for the stats it names', () => {
    const { content, state, plain } = learnt(passive('KIN', { kind: 'training', amount: 1.5, stats: ['strength', 'endurance'] }))
    const at12 = (s: GameState): GameState => ({ ...s, player: { ...s.player, stats: { ...s.player.stats, strength: 12, wisdom: 12 } } })
    expect(trainingToward(trainStat(content, at12(plain), 'strength', 1), 'strength').banked).toBe(1)
    expect(trainingToward(trainStat(content, at12(state), 'strength', 1), 'strength').banked).toBe(1.5)
    expect(trainingToward(trainStat(content, at12(state), 'wisdom', 1), 'wisdom').banked).toBe(1)
  })

  it('changes what a scene is worth to her: gains, losses, and a first scene', () => {
    const gain = learnt(passive('ETH', { kind: 'trust', amount: 1.25 }))
    expect(feltChange(gain.content, gain.state, 'ana', 'trust', 4)).toBe(5)
    expect(feltChange(gain.content, gain.state, 'ana', 'affection', 4)).toBe(4)
    expect(feltChange(gain.content, gain.plain, 'ana', 'trust', 4)).toBe(4)
    // A gain is never rounded away, and nothing is made of nothing.
    expect(feltChange(gain.content, gain.state, 'ana', 'trust', 1)).toBe(1)
    expect(feltChange(gain.content, gain.state, 'ana', 'trust', 0)).toBe(0)

    const soft = learnt(passive('WST', { kind: 'losses', amount: 0.5 }))
    expect(feltChange(soft.content, soft.state, 'ana', 'affection', -6)).toBe(-3)
    expect(feltChange(soft.content, soft.state, 'ana', 'desire', -6)).toBe(-6)
    const felt = applyFeelings(soft.content, known(soft.state, 'ana'), 'ana', { affection: -6, trust: -4, desire: 0, reason: '' })
    expect(felt.relationships['ana']).toMatchObject({ affection: 17, trust: 18 })
    // What is meant to cost what it costs is not softened.
    expect(applyFeelings(soft.content, known(soft.state, 'ana'), 'ana', { affection: -6, trust: -4, desire: 0, reason: '' }, true).relationships['ana']).toMatchObject({ affection: 14, trust: 16 })

  })

  it('has the women who share a scene with him grow closer faster', () => {
    const { content, state, plain } = learnt(passive('BPS', { kind: 'bonds', amount: 1.5 }))
    expect(growTies(content, plain, ['ana', 'bea']).ties[tieKey('ana', 'bea')]).toBe(5)
    expect(growTies(content, state, ['ana', 'bea']).ties[tieKey('ana', 'bea')]).toBe(8)
  })

  it('has every mother of his child want him as much as a woman can, those he has and those to come', () => {
    const { content, state, plain } = learnt(passive('RBI', { kind: 'devoted', amount: 1 }))
    const mother = (s: GameState): GameState => ({ ...known(s, 'ana'), children: [{ motherId: 'ana', bornAt: 0, daughter: true, name: 'Kit' }] })
    const without = mother(plain)
    expect(devotedMothers(content, without)).toBe(without)
    expect(devotedMothers(content, mother(state)).relationships['ana'].desire).toBe(content.relationships.meterMax)
    // Nobody who has not had his child, and nothing to do twice.
    expect(devotedMothers(content, known(state, 'ana'))).toEqual(known(state, 'ana'))
    const done = devotedMothers(content, mother(state))
    expect(devotedMothers(content, done)).toBe(done)
  })

  it('has every woman count his trust higher, met or not, for as long as he has it', () => {
    const { content, state, plain } = learnt(passive('ENG', { kind: 'trustBonus', amount: 5 }))
    const met = known(state, 'ana')
    expect(trustOf(content, met, 'ana')).toBe(met.relationships['ana'].trust + 5)
    expect(trustOf(content, known(plain, 'ana'), 'ana')).toBe(known(plain, 'ana').relationships['ana'].trust)
    // Someone he meets later counts it from the first.
    expect(trustOf(content, known(state, 'bea'), 'bea')).toBe(known(state, 'bea').relationships['bea'].trust + 5)
  })

  it('lowers what a woman needs to want him, for the women it is about', () => {
    const { content, state, plain } = learnt(passive('THE', { kind: 'desireGate', amount: 15, only: 'reluctant' }))
    const [a, b] = content.loveInterests
    expect(desireNeeded(content, plain, b)).toBe(50)
    expect(desireNeeded(content, state, b)).toBe(35)
    expect(desireNeeded(content, state, a)).toBe(25)
    expect(sexGate(content, known(state, 'bea', 40), b)).toEqual({ open: true })
    expect(sexGate(content, known(plain, 'bea', 40), b)).toEqual({ open: false, why: 'desire' })
  })

  it('changes what things cost and pay', () => {
    const wages = learnt(passive('HSP', { kind: 'wages', amount: 1.15 }), { jobs: { energyPerHour: 5, strikes: 3, missedStrike: 1, excusedStrike: 0.5, bonusPerPoint: 0, bonusCap: 0, jobs: [{ id: 'clerk', title: 'Clerk', description: '', locationId: 'shop', bossId: 'bryn', hourlyRate: 10, requirements: {}, shifts: [{ weekday: 'One', startHour: 8, hours: 4 }] }] } })
    const shift = { shift: { jobId: 'clerk', key: '0:8', hours: 4 } }
    expect(shiftPay(wages.content, wages.plain, shift)).toBe(40)
    expect(shiftPay(wages.content, wages.state, shift)).toBe(46)

    const prices = learnt(passive('ECO', { kind: 'prices', amount: 0.8 }))
    expect(priceOf(prices.content, prices.plain, { price: 10 })).toBe(10)
    expect(priceOf(prices.content, prices.state, { price: 10 })).toBe(8)

    const marks = learnt(passive('MTH', { kind: 'marks', amount: 1.5 }), { coursework: undefined })
    expect(factor(marks.content, marks.state, 'marks')).toBe(1.5)
  })
})

describe('a boon', () => {
  const { content, plain } = learnt(passive('NIL', { kind: 'rent', amount: 1 }))
  const drunk = applyEffects(plain, [{ type: 'boon', modifier: { kind: 'affection', amount: 2 }, hours: 24, on: 'self' }], { content, source: 'Heartsease draught' })

  it('is in force for its hours, and then is not', () => {
    expect(liveBoons(drunk)).toMatchObject([{ kind: 'affection', amount: 2, until: plain.time + 24, source: 'Heartsease draught' }])
    expect(factor(content, drunk, 'affection', { loveInterestId: 'ana' })).toBe(2)
    expect(factor(content, { ...drunk, time: plain.time + 23 }, 'affection')).toBe(2)
    expect(factor(content, { ...drunk, time: plain.time + 24 }, 'affection')).toBe(1)
    expect(describeChange(liveBoons(drunk)[0])).toBe('x2 affection')
    // A scene in that day is worth twice the affection to anyone.
    expect(applyFeelings(content, known(drunk, 'ana'), 'ana', { affection: 4, trust: 2, desire: 0, reason: '' }).relationships['ana']).toMatchObject({ affection: 28, trust: 22 })
  })

  it('is renewed and not doubled by another of the same, and clears away those that have run out', () => {
    const again = addBoon({ ...drunk, time: plain.time + 10 }, { ...liveBoons(drunk)[0], until: plain.time + 34 })
    expect(again.boons).toHaveLength(1)
    expect(again.boons[0].until).toBe(plain.time + 34)
    const later = addBoon({ ...drunk, time: plain.time + 30 }, { kind: 'marks', amount: 1.5, until: plain.time + 36, source: 'Study tonic' })
    expect(later.boons.map((boon) => boon.kind)).toEqual(['marks'])
  })

  it('set on a woman is hers alone, is told to her, and is nothing with nobody to set it on', () => {
    const effect = { type: 'boon' as const, modifier: { kind: 'desireGate' as const, amount: 10 }, hours: 24, on: 'her' as const, telling: 'You feel warmer toward him today.' }
    expect(applyEffects(plain, [effect], { content, source: 'Token' })).toBe(plain)
    const set = applyEffects(plain, [effect], { content, loveInterestId: 'ana', source: 'Token' })
    const [a, b] = content.loveInterests
    expect(liveBoons(set)[0]).toMatchObject({ targetId: 'ana', telling: 'You feel warmer toward him today.' })
    expect(desireNeeded(content, set, a)).toBe(15)
    expect(desireNeeded(content, set, b)).toBe(50)
    // A scene that began shut opens with it: the one thing that moves the gate inside a scene.
    expect(sexGate(content, known(plain, 'ana', 20), a)).toEqual({ open: false, why: 'desire' })
    expect(sexGate(content, known(set, 'ana', 20), a)).toEqual({ open: true })
  })
})

describe('what he carries and uses', () => {
  const items = [
    { id: 'draught', name: 'Draught', description: '', price: 0, icon: 'vial', appearance: '', tags: [], lovedByAll: false, use: { on: 'self' as const, effects: [{ type: 'boon' as const, modifier: { kind: 'affection' as const, amount: 2 }, hours: 24, on: 'self' as const }] } },
    { id: 'cordial', name: 'Cordial', description: '', price: 0, icon: 'bottle', appearance: '', tags: [], lovedByAll: false, use: { on: 'her' as const, effects: [{ type: 'boon' as const, modifier: { kind: 'unguarded' as const, amount: 1 }, hours: 24, on: 'her' as const }] } },
    { id: 'sweets', name: 'Sweets', description: '', price: 0, icon: 'sweet', appearance: '', tags: [], lovedByAll: true },
    { id: 'rock', name: 'Rock', description: '', price: 0, icon: 'stone', appearance: '', tags: [], lovedByAll: false }
  ]
  const brew: Skill = { id: 'brew', name: 'Brewing', description: '', code: 'WTC', courseId: 'wtc', at: 30, ability: { label: 'Brew', effects: [{ type: 'item', itemId: 'draught', count: 1 }], cooldownDays: 7, on: 'self' } }
  const { content, state, plain } = learnt(brew, { items, pregnancy: PregnancyConfigSchema.parse({ chance: 1, birthControlChance: 0, periodDays: 0, recoveryDays: 8, birthLocationId: 'shop', stages: [{ id: 'early', name: 'with child', from: 0 }] }) })

  it('makes a thing when he has learnt to, and not again until its days are up', () => {
    expect(canUseAbility(content, plain, 'brew')).toEqual({ ok: false, reasons: ['You have not learned that'] })
    expect(canUseAbility(content, state, 'brew').ok).toBe(true)
    const made = useAbility(content, state, 'brew')
    expect(made.inventory).toEqual({ draught: 1 })
    expect(readyIn(content, made, content.skills[0])).toBe(7 * content.calendar.hoursPerDay)
    expect(canUseAbility(content, made, 'brew')).toEqual({ ok: false, reasons: ['Ready in 7 days'] })
    expect(useAbility(content, made, 'brew')).toBe(made)
    const week: GameState = { ...made, time: made.time + 7 * content.calendar.hoursPerDay }
    expect(useAbility(content, week, 'brew').inventory).toEqual({ draught: 2 })
  })

  it('uses up what is used, on himself or on her', () => {
    const holding: GameState = { ...plain, inventory: { draught: 1, cordial: 1, rock: 2 } }
    expect(canUse(content, holding, 'rock')).toEqual({ ok: false, reasons: ['It is not something to use'] })
    expect(canUse(content, holding, 'cordial')).toEqual({ ok: false, reasons: ['It is for someone you are with'] })
    expect(canUse(content, plain, 'draught')).toEqual({ ok: false, reasons: ['You have none'] })
    const drunk = useItem(content, holding, 'draught')
    expect(drunk.inventory).toEqual({ cordial: 1, rock: 2 })
    expect(factor(content, drunk, 'affection')).toBe(2)
    expect(liveBoons(drunk)[0].source).toBe('Draught')
    expect(consume(holding, 'rock').inventory['rock']).toBe(1)
    expect(consume(plain, 'rock')).toBe(plain)
    expect(carried(content, drunk).map(({ item }) => item.id)).toEqual(['cordial', 'rock'])
  })

  it('has a cordial undo what she takes against the Bloom, for her and for the day', () => {
    const holding = known({ ...plain, inventory: { cordial: 1 } }, 'ana')
    // On birth control, nothing takes here.
    expect(conceive(content, holding, 'ana').pregnancies).toEqual({})
    const shared = useItem(content, holding, 'cordial', 'ana')
    expect(inForce(content, shared, 'unguarded', { loveInterestId: 'ana' })).toBe(true)
    expect(inForce(content, shared, 'unguarded', { loveInterestId: 'bea' })).toBe(false)
    expect(conceive(content, shared, 'ana').pregnancies['ana']).toBeDefined()
    expect(conceive(content, { ...shared, time: shared.time + 24 }, 'ana').pregnancies).toEqual({})
  })

  it('has a thing made for giving loved by anyone, and a well-chosen gift worth more to one who knows how', () => {
    const [a] = content.loveInterests
    expect(giftReaction(content.items[2], a)).toBe('loved')
    expect(giftReaction(content.items[3], a)).toBe('liked')
    const geo = learnt(passive('GEO', { kind: 'gifts', amount: 1.5 }), { items })
    const worth = (s: GameState) => giveGift(geo.content, known({ ...s, inventory: { sweets: 1 } }, 'ana'), 'ana', 'sweets').state.relationships['ana'].affection - 20
    expect(worth(geo.plain)).toBe(6)
    expect(worth(geo.state)).toBe(9)
  })

  it('has her ready for another child sooner in a house that knows how a mother is looked after', () => {
    const mid = learnt(passive('MID', { kind: 'recovery', amount: 0.5 }), { pregnancy: content.pregnancy })
    const born = (s: GameState, days: number): GameState => ({ ...known(s, 'ana'), time: days * mid.content.calendar.hoursPerDay, children: [{ motherId: 'ana', bornAt: 0, daughter: true, name: 'Ada' }] })
    expect(canConceive(mid.content, born(mid.plain, 5), 'ana')).toBe(false)
    expect(canConceive(mid.content, born(mid.state, 5), 'ana')).toBe(true)
    expect(canConceive(mid.content, born(mid.state, 3), 'ana')).toBe(false)
  })

  it('gives his spare hours more, when he has learnt to read in them', () => {
    const his = learnt(passive('HIS', { kind: 'focus', amount: 1.5 }))
    const focused = (s: GameState) => trainingToward(spendOnFocus(his.content, setFocus({ ...s, player: { ...s.player, stats: { ...s.player.stats, wisdom: 12 } } }, { kind: 'stat', id: 'wisdom' }), 2), 'wisdom').banked
    expect(focused(his.plain)).toBe(2)
    expect(focused(his.state)).toBe(3)
    expect(coursePoints(his.state, 'his')).toBe(30)
  })
})

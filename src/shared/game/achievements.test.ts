import { describe, expect, it } from 'vitest'
import { STATS, type Course, type GameState } from '../model'
import { ACHIEVEMENTS, HIDDEN_ACHIEVEMENTS, describeAchievement, earnedAtEvent, earnedByBond, earnedInScene, earnedInState } from './achievements'
import { END_BOND } from './bonds'
import { toDate } from './calendar'
import { createInitialState } from './state'
import { fixture } from './testFixture'

const content = fixture()
const max = content.relationships.meterMax
const start = (): GameState => createInitialState(content)
const course = (id: string): Course => ({ id, number: id, title: id, professor: '', description: '', subject: id, code: id, general: false, stats: ['wisdom'], studentIds: [], locationId: 'shop', meetings: [] })
const grade = (letter: 'A' | 'B') => ({ letter, points: 0, of: 0 }) as never

describe('achievements', () => {
  it('each has a name and what earns it', () => {
    for (const id of ACHIEVEMENTS) expect(describeAchievement(id).name).not.toMatch(/achievements\./)
  })

  it('Perfection: every meter full with one of them', () => {
    expect(earnedInState(content, start())).not.toContain('perfection')
    const full = { ...start(), relationships: { ...start().relationships, ana: { affection: max, trust: max, desire: max } } }
    expect(earnedInState(content, full)).toContain('perfection')
    const almost = { ...full, relationships: { ...full.relationships, ana: { affection: max, trust: max - 1, desire: max } } }
    expect(earnedInState(content, almost)).not.toContain('perfection')
  })

  it("Aced!: an A on the midterm of every course he takes, and not before they are sat", () => {
    const taking = { ...start(), courses: [course('a'), course('b')], enrolment: ['a', 'b'] }
    expect(earnedInState(content, taking)).not.toContain('aced')
    expect(earnedInState(content, { ...taking, grades: { a: { midterm: grade('A') } } })).not.toContain('aced')
    expect(earnedInState(content, { ...taking, grades: { a: { midterm: grade('A') }, b: { midterm: grade('B') } } })).not.toContain('aced')
    expect(earnedInState(content, { ...taking, grades: { a: { midterm: grade('A') }, b: { midterm: grade('A') } } })).toContain('aced')
  })

  it('those of who he was intimate with in a scene', () => {
    const inScene = (ids: string[], state = start()) => earnedInScene(content, state, ids)
    expect(inScene(['dinah', 'morwenna', 'faye'])).toEqual(['oil-and-water'])
    expect(inScene(['dinah', 'faye'])).toEqual([])
    expect(inScene(['anwen', 'elowen'])).toEqual(['forbidden'])
    expect(inScene(['yelena', 'seraphine'])).toEqual(['diplomacy'])
    expect(inScene(['zelie'])).toEqual(['maid-my-day'])
  })

  it('XXXmas: anyone, on the Feast of First Frost', () => {
    const state = start()
    const today = toDate(content.calendar, state.time)
    const frost = { ...content, calendar: { ...content.calendar, events: [{ id: 'first-frost', name: 'Frost', month: today.month.id, day: today.day, durationDays: 1 }] } } as never
    expect(earnedInScene(frost, state, ['ana'])).toContain('xxxmas')
    expect(earnedInScene(frost, state, [])).not.toContain('xxxmas')
    expect(earnedInScene(content, state, ['ana'])).not.toContain('xxxmas')
  })

  it('Light of my life: the lantern festival, with a date', () => {
    expect(earnedAtEvent('lantern-festival', ['ana'])).toEqual(['light-of-my-life'])
    expect(earnedAtEvent('lantern-festival', [])).toEqual([])
    expect(earnedAtEvent('masquerade', ['ana'])).toEqual([])
  })

  it('Legendary: every stat at 26 or more', () => {
    const at = (score: number) => Object.fromEntries(STATS.map((stat) => [stat, score]))
    const legend = { ...start(), player: { ...start().player, stats: at(26) } }
    expect(earnedInState(content, legend)).toContain('legendary')
    const short = { ...legend, player: { ...legend.player, stats: { ...at(30), charisma: 25 } } }
    expect(earnedInState(content, short)).not.toContain('legendary')
  })

  it('those a save shows: the Undercroft, a society, the Mistmoon Break, the house', () => {
    const earned = (state: GameState) => earnedInState(content, state)
    expect(earned(start())).toEqual([])
    expect(earned({ ...start(), expedition: { ...start().expedition, cleared: 7 } })).not.toContain('conqueror')
    expect(earned({ ...start(), expedition: { ...start().expedition, cleared: 8 } })).toContain('conqueror')
    expect(earned({ ...start(), societies: ['chess'] })).toContain('we-live-in-a-society')
    expect(earned({ ...start(), partsAttended: ['mistmoon-break:first-soak'] })).toContain('obligatory-onsen-scene')
    expect(earned({ ...start(), housing: { ...start().housing, status: 'evicted', movedInAt: 40 } })).toContain('wheres-the-landlady')
    expect(earned({ ...start(), housing: { ...start().housing, status: 'offered' } })).not.toContain('wheres-the-landlady')
  })

  it('Teach me!: any three of his teachers', () => {
    const teacher = (id: string) => ({ ...content.loveInterests[0], id, kind: 'teacher' as const })
    const staff = { ...content, loveInterests: [...content.loveInterests, teacher('t1'), teacher('t2'), teacher('t3')] } as never
    expect(earnedInScene(staff, start(), ['t1', 't2', 't3'])).toEqual(['teach-me'])
    expect(earnedInScene(staff, start(), ['t1', 't2'])).toEqual([])
  })

  it('BFFs: Tamsin pregnant, and with him', () => {
    const expecting = { ...start(), pregnancies: { tamsin: { conceivedAt: 0, dueAt: 100 } } }
    expect(earnedInState(content, expecting)).not.toContain('bffs')
    const together = { ...expecting, bonds: [{ statusId: 'exclusive', memberIds: ['tamsin'], since: 0 }] }
    expect(earnedInState(content, together)).toContain('bffs')
  })

  it('True Sire and Family Matters: every one of them carrying or delivered of his child, and one twice', () => {
    const born = { motherId: 'ana', bornAt: 0, daughter: true, name: 'Ada', thrivingWeeks: 0 }
    expect(earnedInState(content, start())).not.toContain('true-sire')
    expect(earnedInState(content, { ...start(), pregnancies: { ana: { conceivedAt: 0, dueAt: 100 } } })).toContain('true-sire')
    const once = { ...start(), children: [born] }
    expect(earnedInState(content, once)).toContain('true-sire')
    expect(earnedInState(content, once)).not.toContain('family-matters')
    expect(earnedInState(content, { ...once, pregnancies: { ana: { conceivedAt: 0, dueAt: 100 } } })).toContain('family-matters')
    expect(earnedInState(content, { ...once, children: [born, { ...born, name: 'Bram' }] })).toContain('family-matters')
  })

  it('the hidden ones are those of what he does in bed, and of the children', () => {
    expect(HIDDEN_ACHIEVEMENTS).toEqual(['oil-and-water', 'xxxmas', 'forbidden', 'teach-me', 'maid-my-day', 'diplomacy', 'bffs', 'full-house', 'true-sire', 'family-matters'])
  })

  it('Heartbreaker: what they had is ended', () => {
    expect(earnedByBond({ statusId: END_BOND, memberIds: ['ana'] } as never)).toEqual(['heartbreaker'])
    expect(earnedByBond({ statusId: 'dating', memberIds: ['ana'] } as never)).toEqual([])
  })
})

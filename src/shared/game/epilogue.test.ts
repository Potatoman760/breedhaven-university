import { describe, expect, it } from 'vitest'
import { CourseSchema, CourseworkConfigSchema, type ContentPack, type GameState } from '../model'
import { buildEpilogue, childrenBy, finalGrades, onGoodTerms, standingOf } from './epilogue'
import { createInitialState } from './state'
import { fixture } from './testFixture'

// Three love interests, two courses, and four arrangements: one that owes nothing and three that make a couple or more.
const base = fixture()
const [ana] = base.loveInterests
const status = (id: string, name: string, more: { exclusive?: boolean; committed?: boolean; members?: number } = {}) => ({
  id,
  name,
  description: '',
  guidance: '',
  minMembers: more.members ?? 1,
  maxMembers: more.members ?? 1,
  mutual: (more.members ?? 1) > 1,
  exclusive: more.exclusive ?? false,
  committed: more.committed ?? false,
  minTie: 0
})
const content: ContentPack = {
  ...base,
  loveInterests: [ana, { ...ana, id: 'bea', name: 'Bea Stone' }, { ...ana, id: 'cy', name: 'Cy Vane', pronouns: 'he/him' }],
  coursework: CourseworkConfigSchema.parse({ weekdays: ['Two'], locationId: 'shop' }),
  relationships: {
    ...base.relationships,
    statuses: [
      status('casual', 'Lovers'),
      status('exclusive', 'Exclusive', { exclusive: true, committed: true }),
      status('open', 'Open relationship', { committed: true }),
      status('triad', 'Triad', { exclusive: true, committed: true, members: 2 })
    ]
  }
}
const course = (id: string) =>
  CourseSchema.parse({
    id,
    number: `${id.toUpperCase()} 101`,
    title: 'Riddles',
    professor: 'Prof. Q',
    subject: 'Riddles',
    code: id.toUpperCase(),
    level: 1,
    studentIds: [],
    locationId: 'shop',
    meetings: [{ weekday: 'Two', startHour: 9, hours: 1, kind: 'lecture' }]
  })
const grade = (letter: 'A' | 'B' | 'C' | 'D' | 'F') => ({ final: { letter, points: 0, outOf: 100, passed: letter !== 'F', time: 0 } })
const start: GameState = { ...createInitialState(content), courses: [course('rid'), course('log')], enrolment: ['rid', 'log'] }
const rel = (affection: number) => ({ affection, trust: 0, desire: 0 })

describe('how the year went', () => {
  it('is failing, getting by or excelling by his final grades', () => {
    const letters = (...given: string[]) => given.map((letter) => ({ letter, passed: letter !== 'F' }))
    expect(standingOf(letters('A', 'B'))).toBe('excelling')
    expect(standingOf(letters('A', 'A', 'B', 'B'))).toBe('excelling')
    // A fail among good grades is not excelling, and a run of Cs is only getting by.
    expect(standingOf(letters('A', 'A', 'A', 'F'))).toBe('gettingBy')
    expect(standingOf(letters('C', 'C', 'D'))).toBe('gettingBy')
    expect(standingOf(letters('C', 'F'))).toBe('gettingBy')
    expect(standingOf(letters('D', 'F', 'F'))).toBe('failing')
    expect(standingOf(letters('F', 'F'))).toBe('failing')
    expect(standingOf([])).toBe('gettingBy')
  })

  it('reads the finals he sat, and grades what he has in a course whose final never came', () => {
    const sat = { ...start, grades: { rid: grade('A') } }
    expect(finalGrades(content, sat)).toEqual([
      { number: 'RID 101', title: 'Riddles', letter: 'A', passed: true },
      { number: 'LOG 101', title: 'Riddles', letter: 'F', passed: false }
    ])
    const [first] = buildEpilogue(content, { ...start, grades: { rid: grade('F'), log: grade('F') } })
    expect(first).toMatchObject({ kind: 'academics', standing: 'failing' })
    expect(first.text).toBe("You didn't focus enough on academics, and were forced to drop out of Breedhaven University.")
    expect(first.details).toEqual(['RID 101 Riddles: F', 'LOG 101 Riddles: F'])
    expect(buildEpilogue(content, { ...start, grades: { rid: grade('A'), log: grade('A') } })[0].text).toContain('excelled')
    expect(buildEpilogue(content, { ...start, grades: { rid: grade('C'), log: grade('C') } })[0].text).toContain('kept your head above water')
  })
})

describe('who he ended the year with', () => {
  it('has a screen for each arrangement that makes a couple or more, and none for lovers without promises', () => {
    const bonded = {
      ...start,
      bonds: [
        { statusId: 'casual', memberIds: ['cy'], since: 1 },
        { statusId: 'exclusive', memberIds: ['ana'], since: 2 }
      ]
    }
    const love = buildEpilogue(content, bonded).filter((screen) => screen.kind === 'love')
    expect(love.map((screen) => screen.text)).toEqual(['You found love with your girlfriend Ana.'])
    expect(love[0]).toMatchObject({ heading: 'Exclusive', loveInterestIds: ['ana'] })

    expect(buildEpilogue(content, { ...start, bonds: [{ statusId: 'open', memberIds: ['cy'], since: 1 }] })[1].text).toBe(
      'You found love with your boyfriend Cy, in a relationship open to others.'
    )
    expect(buildEpilogue(content, { ...start, bonds: [{ statusId: 'triad', memberIds: ['ana', 'bea'], since: 1 }] })[1].text).toBe(
      'You found love with Ana and Bea: the three of you together.'
    )
    expect(buildEpilogue(content, start).some((screen) => screen.kind === 'love')).toBe(false)
  })
})

describe('the children of the year', () => {
  it('have a screen for each mother: a girl or a boy, and how she took it', () => {
    const family = {
      ...start,
      children: [{ motherId: 'ana', bornAt: 5, daughter: true }],
      relationships: { ...start.relationships, ana: rel(70), bea: rel(2) },
      pregnancies: { bea: { conceivedAt: 10, dueAt: 9999 } }
    }
    const screens = buildEpilogue(content, family).filter((screen) => screen.kind === 'child')
    expect(screens).toHaveLength(2)
    expect(screens[0].text).toBe('You impregnated Ana and she gave birth to a beautiful baby girl, and she was overjoyed.')
    // Bea was still carrying when the year ended, and is barely more than a stranger to him now.
    expect(screens[1].text).toMatch(/^You impregnated Bea and she gave birth to a beautiful baby (girl|boy), and she raised the child by herself\.$/)
    expect(screens[1].loveInterestIds).toEqual(['bea'])
    expect(onGoodTerms(content, family, 'ana')).toBe(true)
    expect(onGoodTerms(content, family, 'bea')).toBe(false)
    // Together, she is on good terms whatever the numbers say.
    expect(onGoodTerms(content, { ...family, bonds: [{ statusId: 'casual', memberIds: ['bea'], since: 1 }] }, 'bea')).toBe(true)
  })

  it('are told together when she bore more than one, and the unborn one is the same every time it is told', () => {
    const twice = {
      ...start,
      relationships: { ...start.relationships, ana: rel(70) },
      children: [
        { motherId: 'ana', bornAt: 5, daughter: true },
        { motherId: 'ana', bornAt: 90, daughter: false }
      ]
    }
    expect(buildEpilogue(content, twice).find((screen) => screen.kind === 'child')?.text).toBe(
      'You impregnated Ana and she gave birth to two beautiful children, a girl and a boy, and she was overjoyed.'
    )

    const carrying = { ...start, pregnancies: { ana: { conceivedAt: 10, dueAt: 9999 } } }
    expect(childrenBy(content, carrying, 'ana')).toEqual(childrenBy(content, carrying, 'ana'))
    // Seven in eight are daughters, near enough, across many games.
    const girls = Array.from({ length: 800 }, (_, seed) => childrenBy(content, { ...carrying, weatherSeed: seed }, 'ana')[0].daughter).filter(Boolean).length
    expect(girls).toBeGreaterThan(640)
    expect(girls).toBeLessThan(760)
    expect(childrenBy(content, start, 'ana')).toEqual([])
  })

  it('ends on the end', () => {
    const screens = buildEpilogue(content, start)
    expect(screens.map((screen) => screen.kind)).toEqual(['academics', 'end'])
    expect(screens.at(-1)?.text).toContain('first year')
  })
})

import { describe, expect, it } from 'vitest'
import type { ContentPack, Course, GameState } from '../model'
import { revealFacts, revealedIds } from './facts'
import { hasSkill, intuitTaste, newSkills, skillFor, skillGranting, skillLevel, skillProgress, skillsOf, tellSkills, toldOf } from './skills'
import { createInitialState } from './state'
import { fixture } from './testFixture'

const course = (id: string, code: string): Course => ({
  id,
  number: `${code} 101`,
  title: `${code} studies`,
  professor: 'Doctor Reed',
  description: '',
  subject: `${code} studies`,
  code,
  general: true,
  stats: ['wisdom'],
  studentIds: [],
  locationId: 'shop',
  meetings: [{ weekday: 'One', startHour: 8, hours: 1, kind: 'lecture' }]
})
const base = fixture()
const content: ContentPack = {
  ...base,
  loveInterests: [{ ...base.loveInterests[0], likes: ['tea', 'books'], dislikes: ['noise'] }],
  skills: [
    { id: 'room', name: 'Reading the room', description: 'See how she is.', code: 'RHE', courseId: 'rhe', at: 30, grants: 'comfort' },
    { id: 'taste', name: 'An eye for taste', description: 'Notice what she likes.', code: 'HHS', courseId: 'hhs', at: 20, grants: 'tastes' }
  ]
}
const start: GameState = { ...createInitialState(content), courses: [course('rhe', 'RHE'), course('hhs', 'HHS')], enrolment: ['rhe'] }
const marks = (state: GameState, id: string, points: number): GameState => ({ ...state, coursePoints: { ...state.coursePoints, [id]: points } })

describe('a skill', () => {
  it('is his once he has the marks in a course he takes that teaches it, and not before', () => {
    expect(skillFor(content, start.courses[0])?.id).toBe('room')
    expect(skillFor(content, course('x', 'XXX'))).toBeUndefined()
    expect(skillGranting(content, 'comfort')?.id).toBe('room')
    expect(skillGranting(content, 'cycle')).toBeUndefined()
    expect(skillsOf(content, start)).toEqual([])
    expect(skillProgress(marks(start, 'rhe', 29), content.skills[0])).toEqual({ marks: 29, at: 30, has: false, level: 0 })
    expect(hasSkill(content, marks(start, 'rhe', 29), 'comfort')).toBe(false)
    expect(hasSkill(content, marks(start, 'rhe', 30), 'comfort')).toBe(true)
    // Marks in a course he is not taking teach him nothing.
    expect(hasSkill(content, marks(start, 'hhs', 90), 'tastes')).toBe(false)
    expect(hasSkill(content, marks({ ...start, enrolment: ['rhe', 'hhs'] }, 'hhs', 20), 'tastes')).toBe(true)
  })

  it('is told to him once', () => {
    const learnt = marks(start, 'rhe', 40)
    expect(newSkills(content, start)).toEqual([])
    expect(newSkills(content, learnt).map((skill) => skill.id)).toEqual(['room'])
    const told = tellSkills(learnt, ['room'])
    expect(told.skillsTold).toEqual(['room'])
    expect(newSkills(content, told)).toEqual([])
    expect(tellSkills(told, ['room'])).toBe(told)
  })

})

describe('a skill at its second level', () => {
  const brewing: ContentPack = {
    ...content,
    skills: [
      { id: 'room', name: 'Reading the room', description: 'See how she is.', code: 'RHE', courseId: 'rhe', at: 30, grants: 'comfort', upgrade: { at: 70, description: 'She stays.', alsoGrants: 'cycle' } },
      { id: 'brew', name: 'Brewing', description: 'Weekly.', code: 'HHS', courseId: 'hhs', at: 20, ability: { label: 'Brew', effects: [], cooldownDays: 7, on: 'self' }, upgrade: { at: 70, description: 'Every four days.', cooldownDays: 4 } }
    ]
  }
  const both = { ...start, enrolment: ['rhe', 'hhs'] }

  it('is had at its marks, says what it does then, and does it', () => {
    expect(skillsOf(brewing, marks(both, 'rhe', 69)).find((s) => s.id === 'room')).toMatchObject({ level: 1, description: 'See how she is.' })
    const far = marks(marks(both, 'rhe', 70), 'hhs', 70)
    expect(skillsOf(brewing, far).find((s) => s.id === 'room')).toMatchObject({ level: 2, description: 'She stays.' })
    expect(skillLevel(brewing, far, 'comfort')).toBe(2)
    // A second sight comes with it, and the ability is ready sooner.
    expect(hasSkill(brewing, marks(both, 'rhe', 69), 'cycle')).toBe(false)
    expect(hasSkill(brewing, far, 'cycle')).toBe(true)
    expect(skillsOf(brewing, far).find((s) => s.id === 'brew')?.ability?.cooldownDays).toBe(4)
    expect(skillProgress(marks(both, 'rhe', 40), brewing.skills[0])).toMatchObject({ level: 1, at: 70 })
  })

  it('is told to him once more, as it is reached', () => {
    const first = marks(both, 'rhe', 40)
    const told = tellSkills(first, newSkills(brewing, first).flatMap(toldOf))
    expect(newSkills(brewing, told)).toEqual([])
    const further = marks(told, 'rhe', 70)
    expect(newSkills(brewing, further).map((s) => [s.id, s.level])).toEqual([['room', 2]])
    expect(newSkills(brewing, tellSkills(further, newSkills(brewing, further).flatMap(toldOf)))).toEqual([])
  })
})

describe('an eye for taste', () => {
  it('finds one thing she likes or dislikes that he did not know, the same on a second look, until there is nothing left', () => {
    const first = intuitTaste(content, start, 'ana')
    expect(['like:tea', 'like:books', 'dislike:noise']).toContain(first)
    expect(intuitTaste(content, start, 'ana')).toBe(first)
    // What came out in the talk is not found twice.
    const others = ['like:tea', 'like:books', 'dislike:noise'].filter((id) => id !== first)
    expect(intuitTaste(content, start, 'ana', [first!])).not.toBe(first)
    expect(others).toContain(intuitTaste(content, start, 'ana', [first!]))
    const all = revealFacts(content, start, 'ana', ['like:tea', 'like:books', 'dislike:noise'])
    expect(revealedIds(all, 'ana')).toHaveLength(3)
    expect(intuitTaste(content, all, 'ana')).toBeUndefined()
    expect(intuitTaste(content, start, 'nobody')).toBeUndefined()
  })
})

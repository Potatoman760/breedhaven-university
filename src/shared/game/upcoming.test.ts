import { describe, expect, it } from 'vitest'
import { CourseSchema, CourseworkConfigSchema, type ContentPack, type GameState } from '../model'
import { attend } from './courses'
import { createInitialState } from './state'
import { fixture } from './testFixture'
import { arriveFor, canGoTo, nextUp, sharedUpcoming } from './upcoming'

// The fixture starts at 06:00 at home, on a Two, on a 20-hour day. Classes are at the shop.
const base = fixture()
const content: ContentPack = { ...base, coursework: CourseworkConfigSchema.parse({ weekdays: ['Two'], locationId: 'shop', energy: 5 }) }
const course = (id: string, startHour: number) =>
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
    meetings: [{ weekday: 'Two', startHour, hours: 1, kind: 'lecture' }]
  })
const start: GameState = { ...createInitialState(content), courses: [course('late', 12), course('soon', 9), course('other', 8)], enrolment: ['late', 'soon'] }
const plan = { id: 'plan-1', loveInterestId: 'ana', companionIds: [], title: 'Tea', time: 2, hours: 1, locationId: 'home' }

describe('the next thing on his timetable', () => {
  it('is the soonest class he takes that has yet to start today', () => {
    expect(nextUp(content, start)).toMatchObject({ kind: 'class', id: 'soon', time: 3, locationId: 'shop' })
    // Once it has begun it is no longer to come, and the one after it is next.
    expect(nextUp(content, { ...start, time: 3 })).toMatchObject({ id: 'late', time: 6 })
    expect(nextUp(content, { ...start, time: 6 })).toBeUndefined()
    // Tomorrow's are not today's.
    expect(nextUp(content, { ...start, enrolment: [] })).toBeUndefined()
  })

  it('is a plan when that comes first', () => {
    expect(nextUp(content, { ...start, appointments: [plan] })).toMatchObject({ kind: 'plan', id: 'plan-1', time: 2, locationId: 'home' })
    expect(nextUp(content, { ...start, appointments: [{ ...plan, time: 5 }] })).toMatchObject({ kind: 'class', id: 'soon' })
    expect(nextUp(content, { ...start, appointments: [{ ...plan, time: 25 }] })).toMatchObject({ kind: 'class', id: 'soon' })
  })

  it('can be taken up from wherever he is: the hours go by and he is there for it', () => {
    const next = nextUp(content, start)!
    const there = arriveFor(start, next)
    expect(there).toMatchObject({ time: 3, locationId: 'shop' })
    expect(canGoTo(content, start, next).ok).toBe(true)
    expect(attend(content, there, next.id).time).toBe(4)
    // Too tired for it, he is told so before he sets out.
    expect(canGoTo(content, { ...start, player: { ...start.player, energy: 0 } }, next).reasons).toEqual(['Requires 5 energy'])
    expect(canGoTo(content, { ...start, appointments: [plan] }, nextUp(content, { ...start, appointments: [plan] })!).ok).toBe(true)
  })
})

describe('something of his that those he is with are in too', () => {
  const shared = (studentIds: string[], teacherId?: string): GameState => ({ ...start, courses: start.courses.map((c) => (c.id === 'soon' ? { ...c, studentIds, teacherId } : c)) })

  it('is a class one of them takes or teaches, or a plan one of them is part of', () => {
    expect(sharedUpcoming(content, start, ['ana'])).toBeUndefined()
    expect(sharedUpcoming(content, shared(['ana']), ['ana'])).toMatchObject({ next: { kind: 'class', id: 'soon' }, sharedBy: ['ana'] })
    expect(sharedUpcoming(content, shared([], 'ana'), ['ana', 'bea'])).toMatchObject({ sharedBy: ['ana'] })
    expect(sharedUpcoming(content, shared(['bea']), ['ana'])).toBeUndefined()
    // Only the very next thing: a class she is in later in the day is not what they are leaving for.
    const later: GameState = { ...start, courses: start.courses.map((c) => (c.id === 'late' ? { ...c, studentIds: ['ana'] } : c)) }
    expect(sharedUpcoming(content, later, ['ana'])).toBeUndefined()
    expect(sharedUpcoming(content, { ...start, appointments: [plan] }, ['ana'])).toMatchObject({ next: { kind: 'plan', id: 'plan-1' }, sharedBy: ['ana'] })
    expect(sharedUpcoming(content, { ...start, appointments: [plan] }, ['bea'])).toBeUndefined()
  })

  it('is not one he could not go through with', () => {
    expect(sharedUpcoming(content, { ...shared(['ana']), player: { ...start.player, energy: 0 } }, ['ana'])).toBeUndefined()
  })
})

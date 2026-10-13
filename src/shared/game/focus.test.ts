import { describe, expect, it } from 'vitest'
import type { GameState } from '../model'
import { focusChoices, focusName, focusOf, setFocus, spendOnFocus } from './focus'
import { coursePoints } from './grades'
import { createInitialState } from './state'
import { trainingToward } from './stats'
import { fixture } from './testFixture'

const content = fixture()
const start = createInitialState(content)
const course = start.courses[0]
const enrolled: GameState = course ? { ...start, enrolment: [course.id] } : start

describe('his focus', () => {
  it('is one stat, or one course he is taking, or nothing', () => {
    expect(focusOf(start)).toBeUndefined()
    expect(focusName(start)).toBeUndefined()
    expect(focusChoices({ courses: [], enrolment: [] }).map((choice) => choice.focus.id)).toEqual(['strength', 'dexterity', 'endurance', 'intelligence', 'charisma', 'wisdom'])
    const strong = setFocus(start, { kind: 'stat', id: 'strength' })
    expect(focusOf(strong)).toEqual({ kind: 'stat', id: 'strength' })
    expect(focusName(strong)).toBe('Strength')
    expect(focusOf(setFocus(strong, undefined))).toBeUndefined()
    // A course he does not take is not something to work on.
    expect(focusOf(setFocus(start, { kind: 'course', id: 'nothing-he-takes' }))).toBeUndefined()
  })

  it('takes the hours he skips, at half what the same hours of work would be, for no energy', () => {
    const strong = setFocus(start, { kind: 'stat', id: 'strength' })
    // An hour of it is half a training point; two are a whole one, which at his 8 is a point of strength.
    const after = spendOnFocus(content, strong, 1)
    expect(trainingToward(after, 'strength').banked).toBe(trainingToward(strong, 'strength').banked + 0.5)
    expect(spendOnFocus(content, strong, 2).player.stats['strength']).toBe((strong.player.stats['strength'] ?? 0) + 1)
    expect(after.player.energy).toBe(strong.player.energy)
    expect(after.time).toBe(strong.time)
    // No focus, or no hours, and nothing changes.
    expect(spendOnFocus(content, start, 3)).toBe(start)
    expect(spendOnFocus(content, strong, 0)).toBe(strong)
  })

  it.skipIf(!course || !content.coursework)('earns marks in a course he is taking', () => {
    const studying = setFocus(enrolled, { kind: 'course', id: course!.id })
    expect(focusName(studying)).toBe(course!.number)
    const perHour = content.coursework!.grading.studyPerHour
    expect(coursePoints(spendOnFocus(content, studying, 4), course!.id)).toBe(coursePoints(studying, course!.id) + perHour * 2)
  })
})

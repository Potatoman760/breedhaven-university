import { describe, expect, it } from 'vitest'
import { CourseSchema, CourseworkConfigSchema, OrientationSchema, type ContentPack } from '../model'
import { coursesInSession } from './courses'
import { attendOrientation, isOrientationDay, orientationCasts, orientationStep } from './orientation'
import { buildCharacterPrompt } from './prompt'
import { createInitialState } from './state'
import { fixture } from './testFixture'

// Five love interests and a two-step orientation on the first day, which starts at 06:00
// at home on a 20-hour day. The player shares a class with Bea.
const base = fixture()
// All five are students; orientation is for people of the University.
const studies = { subject: 'Riddles', code: 'RID', level: 1, stats: ['wisdom' as const], practical: false }
const people = ['ana', 'bea', 'cy', 'dee', 'eve'].map((id) => ({ ...base.loveInterests[0], id, name: id[0].toUpperCase() + id.slice(1), studies }))
const content: ContentPack = {
  ...base,
  loveInterests: people,
  coursework: CourseworkConfigSchema.parse({ weekdays: ['Two'], locationId: 'shop' }),
  orientation: OrientationSchema.parse({
    steps: [
      { id: 'assembly', name: 'the Assembly', locationId: 'shop', startHour: 8, hours: 2, description: 'A bell rings.', direction: 'Introduce yourselves.' },
      { id: 'supper', name: 'the Supper', locationId: 'home', startHour: 9, hours: 1 }
    ]
  })
}
const course = CourseSchema.parse({
  id: 'c1',
  number: 'RID 101',
  title: 'Riddles',
  professor: 'Prof. Q',
  subject: 'Riddles',
  code: 'RID',
  level: 1,
  studentIds: ['bea'],
  locationId: 'shop',
  meetings: [{ weekday: 'Two', startHour: 6, hours: 3, kind: 'lecture' }]
})
const state = { ...createInitialState(content), courses: [course], enrolment: ['c1'] }

describe('orientation day', () => {
  it('has no classes, and waits to be attended step by step', () => {
    expect(isOrientationDay(content, state)).toBe(true)
    expect(coursesInSession(content, state)).toEqual([])
    expect(orientationStep(content, state)?.id).toBe('assembly')
    expect(orientationStep(base, createInitialState(base))).toBeUndefined()
  })

  it('introduces one person at each step, and only those he shares no class with', () => {
    // Bea is a classmate, so she is left for class. Dee and Eve are met some other way.
    expect(orientationCasts(content, state)).toEqual([['ana'], ['cy']])
    // With one stranger there is one introduction, and the other step is just the event.
    const mostly = { ...state, courses: [{ ...course, studentIds: ['bea', 'cy', 'dee', 'eve'] }] }
    expect(orientationCasts(content, mostly)).toEqual([['ana'], []])
    // Someone from outside the University is not at its orientation.
    const townie: ContentPack = { ...content, loveInterests: people.map((p) => (p.id === 'ana' ? { ...p, studies: undefined } : p)) }
    expect(orientationCasts(townie, state)).toEqual([['cy'], ['dee']])
    // However many strangers there are, it is still one to a step.
    const crowd: ContentPack = {
      ...content,
      loveInterests: [...people, ...['f', 'g', 'h', 'i'].map((id) => ({ ...people[0], id, name: id.toUpperCase() }))]
    }
    expect(orientationCasts(crowd, state)).toEqual([['ana'], ['cy']])
    const named: ContentPack = {
      ...content,
      orientation: { ...content.orientation!, steps: content.orientation!.steps.map((s, i) => (i === 1 ? { ...s, castIds: ['dee', 'nobody'] } : s)) }
    }
    // A step that names more than one keeps only the first of them.
    expect(orientationCasts(named, state)).toEqual([['ana'], ['dee']])
  })

  it('takes the player there at its hour, opens a scene with whoever he is put with, and moves on', () => {
    const first = attendOrientation(content, state)
    // Early by two hours, then two hours of assembly.
    expect(first.state.time).toBe(4)
    expect(first.state.locationId).toBe('shop')
    expect(first.state.relationships['ana'].affection).toBe(0)
    expect(first.state.relationships['bea'].affection).toBe(0)
    expect(first.scene).toMatchObject({
      loveInterestId: 'ana',
      companionIds: [],
      beats: [{ activityName: 'Orientation: the Assembly', locationName: 'the Shop', description: 'A bell rings.', direction: 'Introduce yourselves.' }]
    })
    const prompt = buildCharacterPrompt({ content, state: first.state, loveInterestId: 'ana', sceneBeats: first.scene!.beats })
    expect(prompt).toContain('Orientation: the Assembly at the Shop.\nIntroduce yourselves.')

    // Already past the supper's hour, so it starts at once.
    const second = attendOrientation(content, first.state)
    expect(second.state.time).toBe(5)
    expect(second.scene).toMatchObject({ loveInterestId: 'cy', companionIds: [] })
    expect(second.state.relationships['bea'].affection).toBe(0)
    expect(orientationStep(content, second.state)).toBeUndefined()
    expect(() => attendOrientation(content, second.state)).toThrow(/no orientation/)
  })

  it('is over once its day has passed, attended or not, and classes meet again', () => {
    const nextWeek = { ...state, time: 60 } // three days on: a "Two" again, at 06:00
    expect(isOrientationDay(content, nextWeek)).toBe(false)
    expect(orientationStep(content, nextWeek)).toBeUndefined()
    expect(coursesInSession(content, nextWeek).map((c) => c.id)).toEqual(['c1'])
  })
})

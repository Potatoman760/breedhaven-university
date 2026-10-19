import { describe, expect, it } from 'vitest'
import { CourseworkConfigSchema, type ContentPack, type Course, type GameState } from '../model'
import { buildCoursePickPrompt, parseCoursePick } from './coursePick'
import { createInitialState } from './state'
import { fixture } from './testFixture'

// Three courses, two of which meet at the same hour, and he may take two.
const base = fixture()
const content: ContentPack = { ...base, coursework: CourseworkConfigSchema.parse({ weekdays: ['One', 'Two', 'Three'], locationId: 'shop', maxCourses: 2 }) }
const course = (id: string, number: string, title: string, startHour: number, more: Partial<Course> = {}): Course => ({
  id,
  number,
  title,
  professor: 'Prof. Q',
  description: '',
  subject: title,
  code: number.split(' ')[0],
  general: false,
  stats: ['wisdom'],
  studentIds: [],
  locationId: 'shop',
  meetings: [{ weekday: 'Two', startHour, hours: 1, kind: 'lecture' }],
  ...more
})
const state: GameState = {
  ...createInitialState(content),
  courses: [course('rid', 'RID 101', 'Riddles', 8, { studentIds: ['ana'] }), course('log', 'LOG 101', 'Logic', 8), course('bio', 'BIO 201', 'Biology', 10)]
}

describe('asking for his courses to be chosen', () => {
  it('shows the LLM the catalogue: each course, when it meets and who is in it, and what he said', () => {
    const { system, user } = buildCoursePickPrompt(content, state, 'I want to major in biology')
    expect(system).toContain('Choose exactly 2.')
    expect(user).toContain('He says: "I want to major in biology"')
    expect(user).toContain('- RID 101: Riddles (Riddles; trains wisdom). Meets Two 08:00. With Ana.')
    expect(user).toContain('- BIO 201: Biology')
  })

  it('takes what it names in turn, by number however written, and leaves out what clashes or is not there', () => {
    const pick = parseCoursePick('Sure!\n{"courses": ["BIO 201", "rid101: Riddles", "LOG 101", "XYZ 999"], "why": "Biology first."}', content, state)
    expect(pick).toEqual({ courseIds: ['bio', 'rid'], why: 'Biology first.', dropped: ['LOG 101'] })
    // Named twice, it is taken once.
    expect(parseCoursePick('{"courses": ["BIO 201", "BIO 201"]}', content, state)).toEqual({ courseIds: ['bio'], why: '', dropped: [] })
  })

  it('says so when the reply cannot be read as a choice', () => {
    expect(() => parseCoursePick('I would suggest biology.', content, state)).toThrow('not a choice of courses')
    expect(() => parseCoursePick('{"courses": ["XYZ 999"]}', content, state)).toThrow('None of the courses')
    expect(() => parseCoursePick('{"courses": [', content, state)).toThrow('not a choice of courses')
  })
})

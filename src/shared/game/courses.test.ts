import { describe, expect, it } from 'vitest'
import { CourseworkConfigSchema, type ContentPack, type Course, type GameState } from '../model'
import { canPerform } from './activities'
import {
  attend,
  buildCoursePrompt,
  buildTimetablePrompt,
  canAttend,
  canEnrol,
  classmates,
  coursesInSession,
  describeMeetings,
  draftCourses,
  enrolledCourses,
  fallbackTimetable,
  parseGeneratedCourses,
  parseTimetable
} from './courses'
import { locationOf, loveInterestsAt } from './map'
import { createInitialState } from './state'
import { fixture } from './testFixture'

// Fixture calendar: weekdays One, Two, Three in a 20-hour day; the game starts on a Two at
// 06:00. Classes meet at the shop and last 3 hours, in four slots: One 06:00, One 10:00,
// Two 06:00, Two 10:00.
const base = fixture()
const ana = base.loveInterests[0]
const student = (id: string, code: string, level: number) => ({
  ...ana,
  id,
  name: id[0].toUpperCase() + id.slice(1),
  schedule: [],
  likes: ['maps'],
  studies: { subject: `${code} studies`, code, level, stats: ['wisdom' as const, 'charisma' as const] }
})
const content: ContentPack = {
  ...base,
  loveInterests: [student('ana', 'POL', 1), student('bea', 'POL', 1), { ...ana, id: 'dee', schedule: [], studies: undefined }],
  coursework: CourseworkConfigSchema.parse({
    weekdays: ['One', 'Two'],
    startHours: [6, 10],
    hours: 3,
    locationId: 'shop',
    maxCourses: 2,
    generalEd: [
      { code: 'HIS', subject: 'History' },
      { code: 'PHY', subject: 'Physical Training' }
    ],
    professors: ['Magistra Vey', 'Doctor Reed']
  })
}
const drafts = draftCourses(content)
const byId = (id: string) => drafts.find((c) => c.id === id)!
// course-ana meets One 06:00; course-his meets Two 10:00; course-bea meets Two 06:00.
const timetabled = fallbackTimetable(content, drafts)
const start = (enrolment: string[] | null = ['course-bea']): GameState => ({
  ...createInitialState(content),
  locationId: 'shop',
  courses: timetabled,
  enrolment
})

describe('draftCourses', () => {
  it("offers a course in each student's subject plus the general ones", () => {
    expect(drafts.map((c) => [c.id, c.number, c.general])).toEqual([
      ['course-ana', 'POL 101', false],
      ['course-his', 'HIS 101', true],
      ['course-bea', 'POL 102', false],
      ['course-phy', 'PHY 101', true]
    ])
    expect(byId('course-ana')).toMatchObject({
      title: 'Foundations of POL studies',
      subject: 'POL studies',
      studentIds: ['ana'],
      locationId: 'shop'
    })
    expect(byId('course-phy')).toMatchObject({ title: 'Physical Training', studentIds: [] })
  })

  it('gives every course exactly one weekly slot, and no two the same while slots last', () => {
    expect(drafts.every((c) => c.meetings.length === 1)).toBe(true)
    expect(new Set(drafts.map(describeMeetings)).size).toBe(4)
    expect(describeMeetings(byId('course-ana'))).toBe('One 06:00')
  })

  it('makes none without a coursework config', () => {
    expect(draftCourses(base)).toEqual([])
  })
})

describe('catalogue wording', () => {
  it('asks for each drafted course by number, subject and level', () => {
    const { system, user } = buildCoursePrompt(content, drafts)
    expect(system).toContain('JSON array')
    expect(user).toContain('Write 4 courses:\n1. POL 101: subject POL studies, year 1 undergraduate course')
    expect(user).toContain('2. HIS 101: subject History, general-education course open to all years')
  })

  it('merges titles, professors and descriptions by position, keeping everything else', () => {
    const reply = `Here:\n${JSON.stringify([
      { title: 'The Art of Rule', professor: 'Magistra Orlena', description: 'How realms are held.' },
      { title: '' }
    ])}`
    const courses = parseGeneratedCourses(reply, drafts)
    expect(courses[0]).toMatchObject({ number: 'POL 101', title: 'The Art of Rule', professor: 'Magistra Orlena', studentIds: ['ana'] })
    expect(courses[1]).toEqual(drafts[1])
    expect(courses[2]).toEqual(drafts[2])
    expect(() => parseGeneratedCourses('I cannot.', drafts)).toThrow(/did not return a list/)
  })
})

describe("love interests' timetables", () => {
  it('tells the LLM the courses on offer and who each student is', () => {
    const { system, user } = buildTimetablePrompt(content, drafts)
    expect(system).toContain('between 2 and 2 courses')
    expect(user).toContain('- POL 101: Foundations of POL studies (POL studies), One 06:00')
    expect(user).toContain('- ana: Ana. Required: POL 101. Dry and watchful. Likes maps.')
    expect(user).toContain('- dee: Ana. No required course.')
  })

  it("applies the LLM's choices, always keeping a required course and capping the load", () => {
    const reply = `Sure:\n${JSON.stringify({
      ana: ['HIS 101', 'phy 101', 'POL 102'],
      bea: ['POL 102', 'XYZ 999', 'HIS 101'],
      dee: ['PHY 101']
    })}`
    const courses = parseTimetable(reply, content, drafts)
    const taking = (id: string) => courses.filter((c) => c.studentIds.includes(id)).map((c) => c.number)
    // Ana's required POL 101 is kept and comes first, so the cap of two drops her last pick.
    expect(taking('ana')).toEqual(['POL 101', 'HIS 101'])
    expect(taking('bea')).toEqual(['HIS 101', 'POL 102'])
    expect(taking('dee')).toEqual(['PHY 101'])
  })

  it('deals out a timetable by rote for anyone the reply leaves out', () => {
    const courses = parseTimetable('{"ana": ["HIS 101"]}', content, drafts)
    const taking = (id: string) => courses.filter((c) => c.studentIds.includes(id)).map((c) => c.number)
    expect(taking('ana')).toEqual(['POL 101', 'HIS 101'])
    expect(taking('bea')).toContain('POL 102')
    expect(taking('bea').length).toBeGreaterThan(1)
    expect(taking('dee').length).toBeGreaterThan(0)
    expect(() => parseTimetable('No.', content, drafts)).toThrow(/did not return a timetable/)
  })

  it('has a fallback that enrols everyone in their own course and some general ones', () => {
    const taking = (id: string) => timetabled.filter((c) => c.studentIds.includes(id)).map((c) => c.number)
    expect(taking('ana')).toContain('POL 101')
    expect(taking('bea')).toContain('POL 102')
    expect(taking('ana').length).toBe(3)
    expect(timetabled.filter((c) => c.general).every((c) => c.studentIds.length > 0)).toBe(true)
  })
})

describe('enrolment', () => {
  it('refuses a clash or more than the maximum', () => {
    const state = start(null)
    expect(canEnrol(content, state, [], 'course-ana').ok).toBe(true)
    expect(canEnrol(content, state, ['course-ana', 'course-bea'], 'course-his').reasons).toEqual([
      'You can take at most 2 courses'
    ])
    const sameTime = { ...state, courses: timetabled.map((c) => ({ ...c, meetings: [{ weekday: 'One', startHour: 6 }] })) }
    expect(canEnrol(content, sameTime, ['course-ana'], 'course-bea').reasons).toEqual([
      'Meets at the same time as POL 101'
    ])
  })

  it('lists what the player is taking', () => {
    expect(enrolledCourses(start()).map((c) => c.id)).toEqual(['course-bea'])
    expect(enrolledCourses(start(null))).toEqual([])
  })
})

describe('classes in session', () => {
  it('puts everyone taking a course in class while it meets', () => {
    // Day 0 is a Two at 06:00: POL 102 (Two 06:00) is the only class on.
    expect(coursesInSession(content, start()).map((c) => c.number)).toEqual(['POL 102'])
    const inClass = byId('course-bea').id
    const students = timetabled.find((c) => c.id === inClass)!.studentIds
    expect(loveInterestsAt(content, start(), 'shop').map((li) => li.id).sort()).toEqual([...students].sort())
    expect(locationOf(content, start(), content.loveInterests[1])).toBe('shop')
    // 09:00: the class is over and these students have no other schedule.
    expect(loveInterestsAt(content, { ...start(), time: 3 }, 'shop')).toEqual([])
  })

  it('lets shared activities happen with a classmate found in class', () => {
    const friends = { ...start(), relationships: { ...start().relationships, bea: { affection: 30, trust: 0, desire: 0 } } }
    const date = content.activities.find((a) => a.id === 'date')!
    expect(canPerform(date, friends, content, 'bea').ok).toBe(true)
  })
})

describe('attending', () => {
  it('raises what the course teaches and a little affection with every classmate, for energy and time', () => {
    const state = { ...start(), courses: timetabled.map((c) => (c.id === 'course-bea' ? { ...c, studentIds: ['bea', 'dee'] } : c)) }
    const after = attend(content, state, 'course-bea')
    // Two points a class, shared between the two stats the course teaches.
    expect(after.player.stats).toMatchObject({ wisdom: 1, charisma: 1 })
    expect(after.player.energy).toBe(35)
    expect(after.relationships.bea.affection).toBe(1)
    expect(after.relationships.dee.affection).toBe(1)
    expect(after.relationships.ana.affection).toBe(0)
    expect(after.time).toBe(3)
    expect(after.attendance['course-bea']).toEqual({ count: 1, last: '0:6' })
  })

  it('keeps a latecomer only until the class ends', () => {
    expect(attend(content, { ...start(), time: 2 }, 'course-bea').time).toBe(3)
    expect(canAttend(content, { ...start(), time: 3 }, 'course-bea').reasons).toEqual(['It is not meeting now'])
  })

  it('counts each meeting once', () => {
    const once = attend(content, start(), 'course-bea')
    expect(canAttend(content, { ...once, time: 1 }, 'course-bea').reasons).toEqual([
      'You have already sat this class'
    ])
    // Day 3 is the next Two.
    const nextWeek = { ...once, time: 3 * 20 }
    expect(attend(content, nextWeek, 'course-bea').attendance['course-bea'].count).toBe(2)
  })

  it('refuses when not enrolled, elsewhere or too tired', () => {
    expect(canAttend(content, start(['course-ana']), 'course-bea').reasons).toEqual(['You are not taking this course'])
    expect(canAttend(content, { ...start(), locationId: 'home' }, 'course-bea').reasons).toEqual(['Go to the Shop first'])
    const tired = { ...start(), player: { ...start().player, energy: 5 } }
    expect(canAttend(content, tired, 'course-bea').reasons).toEqual(['Requires 15 energy'])
    expect(() => attend(content, tired, 'course-bea')).toThrow(/Cannot attend/)
  })
})

describe('classmates', () => {
  it('seats the player with the love interests they are closest to, three at most', () => {
    const state = createInitialState(fixture())
    const rel = (affection: number) => ({ affection, trust: 0, desire: 0 })
    const known = { ...state, relationships: { a: rel(1), b: rel(9), c: rel(5), d: rel(7) } }
    const course = { studentIds: ['a', 'b', 'c', 'd', 'stranger'] } as Course
    expect(classmates(known, course)).toEqual(['b', 'd', 'c'])
    expect(classmates(known, { studentIds: [] } as unknown as Course)).toEqual([])
  })
})

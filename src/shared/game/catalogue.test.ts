import { describe, expect, it } from 'vitest'
import { CourseworkConfigSchema, type ContentPack, type Course, type CourseMeeting } from '../model'
import { buildCatalogue, buildCourseWordingPrompt, catalogueBasis, catalogueIsStale, catalogueOf, parseCourseWording, startingCourses } from './catalogue'
import { coursesClash } from './courses'
import { createInitialState } from './state'
import { fixture } from './testFixture'

// Fixture calendar: weekdays One, Two, Three. Classes run from 06:00 to 16:00: thirty hours a week.
const base = fixture()
const ana = base.loveInterests[0]
const student = (id: string, code: string, level: number, practical = false) => ({
  ...ana,
  id,
  name: id[0].toUpperCase() + id.slice(1),
  schedule: [],
  studies: { subject: `${code} studies`, code, level, stats: ['wisdom' as const], practical }
})
const cy = {
  ...ana,
  id: 'cy',
  name: 'Cy Vane',
  schedule: [],
  studies: undefined,
  teaching: { department: 'the College of Riddles', title: 'Magistra', subjects: [{ subject: 'Riddles', code: 'RID', level: 2, stats: ['wisdom' as const], practical: false }] }
}
const school = (coursesPerMajor: number): ContentPack => ({
  ...base,
  loveInterests: [student('ana', 'POL', 1), student('bea', 'POL', 2), student('cee', 'ENG', 3, true), cy, { ...ana, id: 'dee', schedule: [], studies: undefined }],
  coursework: CourseworkConfigSchema.parse({
    weekdays: ['One', 'Two', 'Three'],
    dayStart: 6,
    dayEnd: 16,
    locationId: 'shop',
    coursesPerMajor,
    maxCourses: 4,
    generalEd: [
      { code: 'HIS', subject: 'History' },
      { code: 'PHY', subject: 'Physical Training', practical: true }
    ],
    professors: ['Magistra Vey', 'Doctor Reed', 'Doctor Sedge']
  })
})
const content = school(3)
const courses = buildCatalogue(content, 7)
const numbered = (number: string) => courses.find((c) => c.number === number)!
const overlap = (a: CourseMeeting, b: CourseMeeting) => a.weekday === b.weekday && a.startHour < b.startHour + b.hours && b.startHour < a.startHour + a.hours
/** The most courses meeting in any one hour of the week. */
const busiest = (all: Course[]) => {
  const load = new Map<string, number>()
  for (const c of all) for (const m of c.meetings) for (let h = m.startHour; h < m.startHour + m.hours; h++) load.set(`${m.weekday} ${h}`, (load.get(`${m.weekday} ${h}`) ?? 0) + 1)
  return Math.max(...load.values())
}

describe('the catalogue', () => {
  it('is the same for the same seed, and different for another', () => {
    expect(buildCatalogue(content, 7)).toEqual(courses)
    expect(buildCatalogue(content, 8)).not.toEqual(courses)
    expect(buildCatalogue(base, 7)).toEqual([])
  })

  it('has a few courses in each major, at the years its students and teachers need, each with its own number', () => {
    expect(courses.map((c) => c.number).sort()).toEqual(
      ['ENG 101', 'ENG 201', 'ENG 301', 'HIS 101', 'PHY 101', 'POL 101', 'POL 201', 'POL 301', 'RID 101', 'RID 201', 'RID 301'].sort()
    )
    expect(new Set(courses.map((c) => c.id)).size).toBe(courses.length)
    expect(numbered('POL 201')).toMatchObject({ id: 'course-pol-201', title: 'Topics in POL studies', subject: 'POL studies', code: 'POL', level: 2, general: false, locationId: 'shop' })
    expect(numbered('HIS 101')).toMatchObject({ title: 'History', general: true })
  })

  it('gives a love interest every course in the subject she teaches, and each other major one professor', () => {
    for (const number of ['RID 101', 'RID 201', 'RID 301']) expect(numbered(number)).toMatchObject({ teacherId: 'cy', professor: 'Magistra Cy Vane' })
    expect(courses.filter((c) => c.teacherId !== undefined).every((c) => c.code === 'RID')).toBe(true)
    expect(new Set(['POL 101', 'POL 201', 'POL 301'].map((n) => numbered(n).professor)).size).toBe(1)
    expect(content.coursework!.professors).toContain(numbered('POL 101').professor)
  })

  it('gives every course two one-hour lectures on different days, and a practical one a three-hour lab', () => {
    for (const c of courses) {
      const lectures = c.meetings.filter((m) => m.kind === 'lecture')
      const labs = c.meetings.filter((m) => m.kind === 'lab')
      expect(lectures.map((m) => m.hours)).toEqual([1, 1])
      expect(labs.map((m) => m.hours)).toEqual(['ENG', 'PHY'].includes(c.code) ? [3] : [])
      // Nothing of a course's own falls on the same day, and nothing runs outside the teaching day.
      expect(new Set(c.meetings.map((m) => m.weekday)).size).toBe(c.meetings.length)
      for (const m of c.meetings) {
        expect(m.startHour).toBeGreaterThanOrEqual(6)
        expect(m.startHour + m.hours).toBeLessThanOrEqual(16)
      }
    }
  })

  it('never has two courses of one major meeting at once, whatever the seed', () => {
    for (const seed of [1, 2, 3, 7, 99]) {
      const built = buildCatalogue(content, seed)
      for (const a of built) for (const b of built) if (a !== b && a.code === b.code) expect(coursesClash(a, b)).toBe(false)
    }
  })

  it('fills the empty hours first, and lets classes overlap only when the week is full', () => {
    // Six courses, eighteen hours of class in a thirty-hour week: room for all of it.
    for (const seed of [1, 2, 3, 7, 99]) expect(busiest(buildCatalogue(school(1), seed))).toBe(1)
    // Eleven courses, thirty-four hours: something has to share, and nothing piles up while other hours are lighter.
    expect(busiest(courses)).toBe(2)
  })

  it('never has a teaching love interest in two rooms at once', () => {
    const twice: ContentPack = {
      ...content,
      loveInterests: content.loveInterests.map((li) =>
        li.id === 'cy' ? { ...cy, teaching: { ...cy.teaching, subjects: [...cy.teaching.subjects, { subject: 'Ciphers', code: 'CIP', level: 1, stats: ['intelligence' as const], practical: true }] } } : li
      )
    }
    for (const seed of [1, 2, 3]) {
      const hers = buildCatalogue(twice, seed).filter((c) => c.teacherId === 'cy')
      expect(hers.map((c) => c.number).sort()).toEqual(['CIP 101', 'CIP 201', 'CIP 301', 'RID 101', 'RID 201', 'RID 301'])
      for (const a of hers) for (const b of hers) if (a !== b) expect(coursesClash(a, b)).toBe(false)
    }
  })

  it("puts each student in her own major's course at her year, and in nothing that clashes with it", () => {
    const taking = (id: string) => courses.filter((c) => c.studentIds.includes(id))
    expect(taking('ana').map((c) => c.number)).toContain('POL 101')
    expect(taking('bea').map((c) => c.number)).toContain('POL 201')
    expect(taking('cee').map((c) => c.number)).toContain('ENG 301')
    for (const id of ['ana', 'bea', 'cee']) {
      const hers = taking(id)
      expect(hers.length).toBeGreaterThanOrEqual(3)
      expect(hers.length).toBeLessThanOrEqual(4)
      for (const a of hers) for (const b of hers) if (a !== b) expect(coursesClash(a, b)).toBe(false)
      // Besides her own, only general courses and the first-year courses of other subjects.
      const major = content.loveInterests.find((li) => li.id === id)!.studies!.code
      expect(hers.every((c) => c.code === major || c.general || c.level === 1)).toBe(true)
    }
    // No class holds more love interests than a scene can, its teacher counted.
    for (const seed of [1, 2, 3, 7, 99]) {
      for (const c of buildCatalogue(content, seed)) expect(c.studentIds.length + (c.teacherId ? 1 : 0)).toBeLessThanOrEqual(3)
    }
    // A teacher and an outsider take nothing.
    expect(taking('cy')).toEqual([])
    expect(taking('dee')).toEqual([])
    expect(overlap(courses[0].meetings[0], courses[0].meetings[0])).toBe(true)
  })
})

describe('the saved catalogue', () => {
  const saved: ContentPack = { ...content, catalogue: catalogueOf(content, 7) }

  it('is what a new game starts with', () => {
    expect(createInitialState(saved).courses).toEqual(courses)
    expect(createInitialState(content).courses).toEqual([])
  })

  it('is out of date once a character has changed what she studies, and leaves off anyone who has gone', () => {
    expect(catalogueIsStale(content)).toBe(false)
    expect(catalogueIsStale(saved)).toBe(false)
    const moved: ContentPack = { ...saved, loveInterests: saved.loveInterests.map((li) => (li.id === 'ana' ? student('ana', 'POL', 2) : li)) }
    expect(catalogueBasis(moved)).not.toBe(catalogueBasis(saved))
    expect(catalogueIsStale(moved)).toBe(true)
    // Someone who is not of the University changes nothing.
    expect(catalogueIsStale({ ...saved, loveInterests: saved.loveInterests.filter((li) => li.id !== 'dee') })).toBe(false)

    const gone: ContentPack = { ...saved, loveInterests: saved.loveInterests.filter((li) => li.id !== 'ana' && li.id !== 'cy') }
    const begun = startingCourses(gone)
    expect(begun.some((c) => c.studentIds.includes('ana') || c.teacherId === 'cy')).toBe(false)
    expect(begun.find((c) => c.number === 'RID 201')?.professor).toBe('Magistra Cy Vane')
  })
})

describe('course wording', () => {
  const batch = [numbered('POL 101'), numbered('PHY 101'), numbered('RID 201')]

  it('asks for each course by number, with its subject, year, lab and professor', () => {
    const { system, user } = buildCourseWordingPrompt(content, batch)
    expect(system).toContain('JSON object')
    expect(user).toContain('Write 3 courses:')
    expect(user).toContain(`- POL 101: subject POL studies, year 1 undergraduate course; taught by ${numbered('POL 101').professor}`)
    expect(user).toContain('- PHY 101: subject Physical Training, general-education course open to all years, with a weekly lab;')
    expect(user).toContain('taught by Magistra Cy Vane')
  })

  it('puts titles and descriptions on by number, and leaves alone what the reply leaves out or gets wrong', () => {
    const reply = `Here:\n${JSON.stringify({
      'pol 101': { title: 'The Art of Rule', description: 'How realms are held.', professor: 'Doctor Someone' },
      'RID 201': { title: '' },
      'XYZ 999': { title: 'Nothing' }
    })}`
    const written = parseCourseWording(reply, batch)
    // Only the wording changes: her professor, her times and her students are the catalogue's own.
    expect(written[0]).toEqual({ ...batch[0], title: 'The Art of Rule', description: 'How realms are held.' })
    expect(written[1]).toEqual(batch[1])
    expect(written[2]).toEqual(batch[2])
    expect(() => parseCourseWording('I cannot.', batch)).toThrow(/did not return the courses/)
  })
})

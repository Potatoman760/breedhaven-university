import { describe, expect, it } from 'vitest'
import { CourseworkConfigSchema, CurriculumSchema, resolveCurriculum, validateContentPack, type ContentPack, type Course, type CourseMeeting } from '../model'
import { buildCatalogue, catalogueBasis, catalogueIsStale, catalogueOf, dormantCourses, startingCourses, writtenCatalogue } from './catalogue'
import { coursesClash } from './courses'
import { createInitialState } from './state'
import { fixture, rawFixture } from './testFixture'

// Fixture calendar: weekdays One, Two, Three. Classes run from 06:00 to 16:00: thirty hours a week.
const topics = Array.from({ length: 6 }, (_, i) => ({ title: `Class ${i + 1}`, content: 'What is taught.' }))
const written = (number: string, title: string) => ({ number, title, description: `${title}, as it is taught.`, topics })
const curriculum = CurriculumSchema.parse({
  colleges: [{ id: 'arts', name: 'Arts' }],
  majors: [
    { code: 'POL', subject: 'Politics', college: 'arts', stats: ['wisdom'], courses: [written('101', 'First Politics'), written('120', 'Second Politics')] },
    { code: 'ENG', subject: 'Engines', college: 'arts', stats: ['wisdom'], practical: true, courses: [written('101', 'First Engines'), written('130', 'Third Engines')] },
    { code: 'RID', subject: 'Riddles', college: 'arts', stats: ['wisdom'], courses: [written('101', 'Second Riddles')] },
    { code: 'CIP', subject: 'Ciphers', college: 'arts', stats: ['intelligence'], practical: true, courses: [written('101', 'First Ciphers')] },
    { code: 'HIS', subject: 'History', college: 'arts', general: true, courses: [written('101', 'History')] },
    { code: 'PHY', subject: 'Physical Training', college: 'arts', general: true, practical: true, courses: [written('101', 'Physical Training')] }
  ]
})
const base = fixture()
const ana = base.loveInterests[0]
const subject = (code: string, level: number) => {
  const major = curriculum.majors.find((one) => one.code === code)!
  return { subject: major.subject, code, level, stats: major.stats, practical: major.practical }
}
/** A course as a teacher gives it: its subject and number, and no year. */
const taught = (code: string, number: string) => {
  const { level: _year, ...rest } = subject(code, 1)
  return { ...rest, number }
}
const student = (id: string, code: string, level: number) => ({ ...ana, id, name: id[0].toUpperCase() + id.slice(1), schedule: [], studies: subject(code, level) })
const cy = { ...ana, id: 'cy', name: 'Cy Vane', schedule: [], studies: undefined, teaching: { department: 'the College of Riddles', title: 'Magistra', subjects: [taught('RID', '101')] } }
const content: ContentPack = {
  ...base,
  curriculum,
  loveInterests: [student('ana', 'POL', 1), student('bea', 'POL', 2), student('cee', 'ENG', 3), cy, { ...ana, id: 'dee', schedule: [], studies: undefined }],
  coursework: CourseworkConfigSchema.parse({
    weekdays: ['One', 'Two', 'Three'],
    dayStart: 6,
    dayEnd: 16,
    locationId: 'shop',
    maxCourses: 4,
    generalEd: [
      { code: 'HIS', subject: 'History' },
      { code: 'PHY', subject: 'Physical Training', practical: true }
    ],
    professors: ['Magistra Vey', 'Doctor Reed', 'Doctor Sedge']
  })
}
const courses = buildCatalogue(content, 7)
const numbered = (number: string) => courses.find((c) => c.number === number)!
const overlap = (a: CourseMeeting, b: CourseMeeting) => a.weekday === b.weekday && a.startHour < b.startHour + b.hours && b.startHour < a.startHour + a.hours
const inClass = (course: Course) => course.studentIds.length + (course.teacherId ? 1 : 0)
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
    // With no curriculum there is nothing to lay out.
    expect(buildCatalogue({ ...content, curriculum: undefined }, 7)).toEqual([])
    expect(buildCatalogue(base, 7)).toEqual([])
  })

  it('gives only courses the curriculum has written, and of those only the ones somebody reads or teaches, and the general ones', () => {
    expect(courses.map((c) => c.number).sort()).toEqual(['ENG 101', 'ENG 130', 'HIS 101', 'PHY 101', 'POL 101', 'POL 120', 'RID 101'].sort())
    expect(new Set(courses.map((c) => c.id)).size).toBe(courses.length)
    // What a course is comes from the curriculum, word for word.
    expect(numbered('POL 120')).toMatchObject({ id: 'course-pol-120', title: 'Second Politics', description: 'Second Politics, as it is taught.', subject: 'Politics', code: 'POL', general: false, locationId: 'shop' })
    expect(numbered('HIS 101')).toMatchObject({ title: 'History', general: true })
    // Written, and nobody's this term.
    expect(dormantCourses(content, courses)).toEqual([{ number: 'CIP 101', title: 'First Ciphers' }])
  })

  it('sits a student in two courses of her subject, whatever her year', () => {
    for (const year of [1, 3, 5]) {
      const now: ContentPack = { ...content, loveInterests: content.loveInterests.map((li) => (li.id === 'cee' ? student('cee', 'ENG', year) : li)) }
      const hers = buildCatalogue(now, 7).filter((c) => c.studentIds.includes('cee') && c.code === 'ENG')
      expect(hers.map((c) => c.number).sort()).toEqual(['ENG 101', 'ENG 130'])
    }
  })

  it('has a love interest give the courses she is down for, and each other subject one professor', () => {
    expect(numbered('RID 101')).toMatchObject({ teacherId: 'cy', professor: 'Magistra Cy Vane' })
    expect(courses.filter((c) => c.teacherId !== undefined).every((c) => c.code === 'RID')).toBe(true)
    expect(new Set(['POL 101', 'POL 120'].map((n) => numbered(n).professor)).size).toBe(1)
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
    // Seven courses, twenty-three hours of class in a thirty-hour week: room for all of it.
    for (const seed of [1, 2, 3, 7, 99]) expect(busiest(buildCatalogue(content, seed))).toBe(1)
    const crowded: ContentPack = { ...content, coursework: { ...content.coursework!, lecturesPerWeek: 4 } }
    expect(busiest(buildCatalogue(crowded, 7))).toBeLessThanOrEqual(2)
  })

  it('never has a teaching love interest in two rooms at once', () => {
    const twice: ContentPack = { ...content, loveInterests: content.loveInterests.map((li) => (li.id === 'cy' ? { ...cy, teaching: { ...cy.teaching, subjects: [taught('RID', '101'), taught('CIP', '101')] } } : li)) }
    for (const seed of [1, 2, 3]) {
      const hers = buildCatalogue(twice, seed).filter((c) => c.teacherId === 'cy')
      expect(hers.map((c) => c.number).sort()).toEqual(['CIP 101', 'RID 101'])
      for (const a of hers) for (const b of hers) if (a !== b) expect(coursesClash(a, b)).toBe(false)
    }
  })

  it("puts each student in her own subject's courses, and in nothing that clashes with them", () => {
    const taking = (id: string) => courses.filter((c) => c.studentIds.includes(id))
    for (const id of ['ana', 'bea', 'cee']) {
      const hers = taking(id)
      const major = content.loveInterests.find((li) => li.id === id)!.studies!.code
      // Two courses of her subject, and up to two more: in a school this small there is not always a place left for her.
      expect(hers.filter((c) => c.code === major)).toHaveLength(2)
      expect(hers.length).toBeGreaterThanOrEqual(2)
      expect(hers.length).toBeLessThanOrEqual(4)
      for (const a of hers) for (const b of hers) if (a !== b) expect(coursesClash(a, b)).toBe(false)
    }
    // Every class has a love interest in it and none has more than two, its teacher counted: whatever the seed.
    for (const seed of [1, 2, 3, 7, 99]) {
      for (const c of buildCatalogue(content, seed)) {
        expect(inClass(c)).toBeGreaterThanOrEqual(1)
        expect(inClass(c)).toBeLessThanOrEqual(2)
      }
    }
    // A class nobody he could know is in is not offered: with nobody to take them, the general courses go.
    const alone: ContentPack = { ...content, loveInterests: content.loveInterests.filter((li) => li.id === 'cy') }
    expect(buildCatalogue(alone, 7).map((c) => c.number)).toEqual(['RID 101'])
    // A teacher and an outsider take nothing.
    expect(taking('cy')).toEqual([])
    expect(taking('dee')).toEqual([])
    expect(overlap(courses[0].meetings[0], courses[0].meetings[0])).toBe(true)
  })

  it('sits everyone who studies a subject in two of its courses, though with no room left that makes three', () => {
    const three: ContentPack = { ...content, loveInterests: [...content.loveInterests, student('eve', 'POL', 1)] }
    for (const seed of [1, 7, 99]) {
      for (const number of ['POL 101', 'POL 120']) expect(buildCatalogue(three, seed).find((c) => c.number === number)!.studentIds.sort()).toEqual(['ana', 'bea', 'eve'])
    }
  })

  it('opens another section of a course when its classes are full, so that everyone still has her full week', () => {
    const more: ContentPack = { ...content, loveInterests: [...content.loveInterests, ...['eve', 'fay', 'gil'].map((id) => student(id, 'POL', 1))] }
    const given = buildCatalogue(more, 7)
    const pol = ['ana', 'bea', 'eve', 'fay', 'gil']
    for (const id of pol) {
      const hers = given.filter((c) => c.studentIds.includes(id))
      // Two of her own subject, of two different courses, and two besides.
      expect(hers.filter((c) => c.code === 'POL').map((c) => c.courseId ?? c.id).sort(), id).toEqual(['course-pol-101', 'course-pol-120'])
      expect(hers, id).toHaveLength(4)
      for (const a of hers) for (const b of hers) if (a !== b) expect(coursesClash(a, b), `${id}: ${a.id} and ${b.id}`).toBe(false)
    }
    const sections = given.filter((c) => c.section !== undefined)
    expect(sections.length).toBeGreaterThan(0)
    for (const section of sections) {
      const of = given.find((c) => c.id === section.courseId)!
      // A class of its own, of the course it names: its title and what it teaches, and its department's professor.
      expect(section.id).toBe(`${section.courseId}-${section.section}`)
      expect(section).toMatchObject({ number: of.number, title: of.title, code: of.code, teacherId: undefined })
      expect(content.coursework!.professors).toContain(section.professor)
    }
    expect(new Set(given.map((c) => c.id)).size).toBe(given.length)
    // Nobody is in a crowd for it.
    for (const c of given) expect(inClass(c), c.id).toBeLessThanOrEqual(c.studentIds.some((id) => pol.includes(id)) && c.code === 'POL' ? 3 : 2)
    expect(buildCatalogue(more, 7)).toEqual(given)
  })

  it('finds room for a crowd, whatever the seed', () => {
    const crowd: ContentPack = { ...content, loveInterests: [...content.loveInterests, ...Array.from({ length: 12 }, (_, i) => student(`eng${i}`, 'ENG', 1))] }
    for (const seed of [1, 7, 99]) {
      const given = buildCatalogue(crowd, seed)
      for (const li of crowd.loveInterests.filter((one) => one.studies)) {
        const hers = given.filter((c) => c.studentIds.includes(li.id))
        expect(hers, `${seed}: ${li.id}`).toHaveLength(4)
        expect(new Set(hers.map((c) => c.courseId ?? c.id)).size, `${seed}: ${li.id}`).toBe(4)
      }
      for (const c of given) expect(inClass(c), `${seed}: ${c.id}`).toBeGreaterThan(0)
    }
  })
})

describe('the saved catalogue', () => {
  const saved: ContentPack = { ...content, catalogue: catalogueOf(content, 7) }

  it('is what a new game starts with', () => {
    expect(createInitialState(saved).courses).toEqual(courses)
    expect(createInitialState(content).courses).toEqual([])
  })

  it('is out of date once a character has changed what she studies or the curriculum has another course, and leaves off anyone who has gone', () => {
    expect(catalogueIsStale(content)).toBe(false)
    expect(catalogueIsStale(saved)).toBe(false)
    const moved: ContentPack = { ...saved, loveInterests: saved.loveInterests.map((li) => (li.id === 'ana' ? student('ana', 'ENG', 1) : li)) }
    expect(catalogueBasis(moved)).not.toBe(catalogueBasis(saved))
    expect(catalogueIsStale(moved)).toBe(true)
    // Her year is background, and changes nothing.
    const older: ContentPack = { ...saved, loveInterests: saved.loveInterests.map((li) => (li.id === 'ana' ? student('ana', 'POL', 4) : li)) }
    expect(catalogueIsStale(older)).toBe(false)
    const more: ContentPack = { ...saved, curriculum: { ...curriculum, majors: curriculum.majors.map((major) => (major.code === 'RID' ? { ...major, courses: [...major.courses, { ...major.courses[0], number: '150' }] } : major)) } }
    expect(catalogueIsStale(more)).toBe(true)
    // Someone who is not of the University changes nothing.
    expect(catalogueIsStale({ ...saved, loveInterests: saved.loveInterests.filter((li) => li.id !== 'dee') })).toBe(false)

    const gone: ContentPack = { ...saved, loveInterests: saved.loveInterests.filter((li) => li.id !== 'ana' && li.id !== 'cy') }
    const begun = startingCourses(gone)
    expect(begun.some((c) => c.studentIds.includes('ana') || c.teacherId === 'cy')).toBe(false)
    expect(begun.find((c) => c.number === 'RID 101')?.professor).toBe('Magistra Cy Vane')
  })

  it('is kept as only what was worked out, and put back together from the curriculum when the pack is read', () => {
    const kept = writtenCatalogue(saved.catalogue!)
    expect(Object.keys(kept.courses[0]).sort()).toEqual(['id', 'meetings', 'professor', 'studentIds', 'teacherId'].sort())
    // Read back with the curriculum beside it, every course is whole again.
    const read = resolveCurriculum({ curriculum, coursework: content.coursework, catalogue: kept, loveInterests: [] }) as { catalogue: { courses: Course[] } }
    expect(read.catalogue.courses).toEqual(courses.map((course) => ({ ...course })))
    // A course the curriculum no longer has is not given.
    const fewer = { ...curriculum, majors: curriculum.majors.filter((major) => major.code !== 'RID') }
    const without = resolveCurriculum({ curriculum: fewer, coursework: content.coursework, catalogue: kept, loveInterests: [] }) as { catalogue: { courses: Course[] } }
    expect(without.catalogue.courses.some((course) => course.code === 'RID')).toBe(false)
  })

  it('keeps a further section as a section of its course, and reads it back the same', () => {
    const more: ContentPack = { ...content, loveInterests: [...content.loveInterests, ...['eve', 'fay', 'gil'].map((id) => student(id, 'POL', 1))] }
    const given = buildCatalogue(more, 7)
    const kept = writtenCatalogue(catalogueOf(more, 7, given))
    const section = kept.courses.find((course) => course.section !== undefined)!
    expect(Object.keys(section).sort()).toEqual(['courseId', 'id', 'meetings', 'professor', 'section', 'studentIds', 'teacherId'].sort())
    const read = resolveCurriculum({ curriculum, coursework: content.coursework, catalogue: kept, loveInterests: [] }) as { catalogue: { courses: Course[] } }
    expect(read.catalogue.courses).toEqual(given.map((course) => ({ ...course })))
  })
})

describe('a pack with a curriculum', () => {
  const raw = { ...rawFixture(), curriculum, coursework: { weekdays: ['One', 'Two', 'Three'], dayStart: 6, dayEnd: 16, locationId: 'shop', professors: ['Doctor Reed'] } }
  const named = (studies: unknown) => ({ ...raw, loveInterests: raw.loveInterests.map((li, i) => (i === 0 ? { ...li, studies } : li)) })

  it('fills in what a character studies from the subject she names, and draws the syllabuses, skills and general subjects out of it', () => {
    const pack = validateContentPack(named({ major: 'ENG', level: 3 }))
    expect(pack.loveInterests[0].studies).toEqual({ subject: 'Engines', code: 'ENG', level: 3, stats: ['wisdom'], practical: true })
    expect(pack.coursework?.generalEd.map((general) => general.code)).toEqual(['HIS', 'PHY'])
    expect(pack.syllabus.find((entry) => entry.courseId === 'course-eng-130')?.topics).toHaveLength(6)
    expect(pack.skills).toEqual([])
    // Read again as it now stands, it is the same.
    expect(validateContentPack(pack).loveInterests[0].studies).toEqual(pack.loveInterests[0].studies)
  })

  it('will not have a subject made up, nor a general one read as her own', () => {
    expect(() => validateContentPack(named({ major: 'ZZZ', level: 1 }))).toThrow(/studies "ZZZ", which is not a subject the curriculum has/)
    expect(() => validateContentPack(named({ major: 'HIS', level: 1 }))).toThrow(/studies "HIS"/)
  })
})

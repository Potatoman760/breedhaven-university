import { describe, expect, it } from 'vitest'
import { CourseworkConfigSchema, type ContentPack, type Course, type GameState } from '../model'
import { canSitExam, describeGrade, examNotes, examPaper, gradeFor, settleExams, sitExam } from './exams'
import { examSlot } from './grades'
import { buildCharacterPrompt } from './prompt'
import { createInitialState } from './state'
import { fixture } from './testFixture'
import { nextUp } from './upcoming'

// As in grades.test.ts: a week of One, Two, Three on a 20-hour day, starting on a Two at 06:00, and a term of four
// weeks of seven days with the midterm in the second and the final in the fourth. The course meets on Twos at 06:00
// and Threes at 08:00: five times before the midterm (days 0, 1, 3, 4 and 6).
const base = fixture()
const question = (n: number) => ({ ask: `Riddle ${n}?`, answer: `Answer ${n}`, wrong: [`No ${n}a`, `No ${n}b`, `No ${n}c`] })
const content: ContentPack = {
  ...base,
  calendar: { ...base.calendar, lengthDays: 28 },
  coursework: CourseworkConfigSchema.parse({
    weekdays: ['One', 'Two', 'Three'],
    dayStart: 6,
    dayEnd: 14,
    locationId: 'shop',
    grading: { midtermWeek: 2, finalWeek: 4, examQuestions: 2 }
  }),
  syllabus: [{ courseId: 'rid', topics: [1, 2, 3, 4].map((n) => ({ title: `Topic ${n}`, content: '', question: question(n) })) }]
}
const course: Course = {
  id: 'rid',
  number: 'RID 101',
  title: 'Riddles',
  professor: 'Prof. Q',
  description: '',
  subject: 'Riddles',
  code: 'RID',
  general: false,
  stats: ['wisdom'],
  studentIds: ['ana'],
  locationId: 'shop',
  meetings: [
    { weekday: 'Two', startHour: 6, hours: 1, kind: 'lecture' },
    { weekday: 'Three', startHour: 8, hours: 1, kind: 'lecture' }
  ]
}
const FIRST_HALF = ['0:6', '1:8', '3:6', '4:8', '6:6']
const start: GameState = { ...createInitialState(content), courses: [course], enrolment: ['rid'], locationId: 'home' }
const midterm = examSlot(content, course, 'midterm')!
const final = examSlot(content, course, 'final')!
/** In the hall as the midterm begins, with so many marks and those classes sat. */
const atMidterm = (points: number, sat: string[] = FIRST_HALF): GameState => ({ ...start, time: midterm.begins, coursePoints: { rid: points }, attendance: { rid: { sat } } })
const right = (state: GameState, kind: 'midterm' | 'final' = 'midterm') => examPaper(content, state, course, kind).map((one) => one.right)

describe('the paper', () => {
  it('asks about topics of classes he sat, and is the same paper each time it is looked at', () => {
    const paper = examPaper(content, atMidterm(40), course, 'midterm')
    expect(paper).toHaveLength(2)
    expect(paper).toEqual(examPaper(content, atMidterm(40), course, 'midterm'))
    for (const one of paper) {
      expect(one.choices).toHaveLength(4)
      expect(one.choices[one.right]).toBe(`Answer ${one.topic + 1}`)
    }
    // Having sat one class, there is one topic to ask about; having sat none, nothing.
    expect(examPaper(content, atMidterm(40, ['0:6']), course, 'midterm').map((one) => one.topic)).toEqual([0])
    expect(examPaper(content, atMidterm(40, []), course, 'midterm')).toEqual([])
  })

  it('at the final asks first about what the midterm did not', () => {
    const sat = sitExam(content, atMidterm(40), 'rid', right(atMidterm(40))).state
    const asked = sat.grades['rid'].midterm!.topics
    const paper = examPaper(content, { ...sat, time: final.begins }, course, 'final')
    expect(paper.map((one) => one.topic).sort()).toEqual([0, 1, 2, 3].filter((index) => !asked.includes(index)))
  })
})

describe('a grade', () => {
  const all = { topics: [0, 1], correct: 2 }
  const some = { topics: [0, 1], correct: 1 }
  const letter = (state: GameState, sitting: typeof all | undefined) => gradeFor(content, state, course, 'midterm', sitting, 0).letter

  it('is a B with the mark, and an A with every answer right as well', () => {
    // The midterm is marked against half the term: forty of fifty is the mark it asks for.
    expect(gradeFor(content, atMidterm(40), course, 'midterm', some, 7)).toEqual({ letter: 'B', points: 40, outOf: 50, passed: true, sat: true, topics: [0, 1], correct: 1, time: 7 })
    expect(letter(atMidterm(40), all)).toBe('A')
    // A paper that asked nothing has nothing to get right.
    expect(letter(atMidterm(50), { topics: [], correct: 0 })).toBe('B')
  })

  it('is a C short of the mark with a pass, a B with every answer right, and an F under a pass or when he did not sit it', () => {
    expect(letter(atMidterm(39), some)).toBe('C')
    expect(letter(atMidterm(30), all)).toBe('B')
    expect(letter(atMidterm(29), all)).toBe('F')
    expect(gradeFor(content, atMidterm(50), course, 'midterm', undefined, 0)).toMatchObject({ letter: 'F', passed: false, sat: false })
    // The final is against the whole of the marks.
    expect(gradeFor(content, { ...atMidterm(79), time: final.begins }, course, 'final', all, 0)).toMatchObject({ letter: 'B', outOf: 100 })
  })
})

describe('sitting an examination', () => {
  it('is something to turn up for, and takes him to the hall until it is over', () => {
    const before = { ...atMidterm(40), time: midterm.begins - 1 }
    expect(canSitExam(content, before, 'rid')).toEqual({ ok: false, reasons: ['It is not being sat now'] })
    expect(sitExam(content, before, 'rid', [])).toEqual({ state: before, graded: undefined })
    expect(nextUp(content, before)).toMatchObject({ kind: 'exam', id: 'rid', title: 'Midterm: RID 101', time: midterm.begins })

    const during = { ...atMidterm(40), inOwnRoom: true }
    expect(canSitExam(content, during, 'rid').ok).toBe(true)
    const sat = sitExam(content, during, 'rid', right(during))
    expect(sat.state).toMatchObject({ time: midterm.ends, locationId: 'shop', inOwnRoom: false })
    expect(sat.graded && describeGrade(sat.graded)).toBe('Midterm in RID 101: A (40 of 50 marks · 2 of 2 right)')
    // One wrong is a B.
    const wrong = right(during).map((pick, index) => (index === 0 ? (pick + 1) % 4 : pick))
    expect(describeGrade(sitExam(content, during, 'rid', wrong).graded!)).toBe('Midterm in RID 101: B (40 of 50 marks · 1 of 2 right)')
    // Sat, it is not sat again, and nothing is left for the hour's end to mark.
    expect(canSitExam(content, { ...sat.state, time: midterm.begins }, 'rid')).toEqual({ ok: false, reasons: ['You have already sat it'] })
    expect(settleExams(content, sat.state).graded).toEqual([])
    expect(canSitExam(content, { ...during, enrolment: [] }, 'rid')).toEqual({ ok: false, reasons: ['You are not taking this course'] })
  })

  it('is failed when its hour goes by without him', () => {
    expect(settleExams(content, atMidterm(50)).graded).toEqual([])
    const missed = settleExams(content, { ...atMidterm(50), time: midterm.ends })
    expect(missed.graded.map(describeGrade)).toEqual(['Midterm in RID 101: F (not sat)'])
    expect(missed.state.grades['rid'].midterm).toMatchObject({ letter: 'F', sat: false, time: midterm.ends })
    // Only once, and not for a course he is not taking.
    expect(settleExams(content, missed.state).graded).toEqual([])
    expect(settleExams(content, { ...atMidterm(50), time: midterm.ends, enrolment: [] }).graded).toEqual([])
  })
})

describe('what a love interest knows of the examinations', () => {
  it('is that they are coming, when hers are, and what he got in a course they share', () => {
    expect(examNotes(content, start, { id: 'ana' }, 'Pat')).toEqual(['The midterms at the University are next week.'])
    const week = { ...start, time: 7 * 20 }
    expect(examNotes(content, week, { id: 'ana' }, 'Pat')).toEqual([
      'It is the week of the midterms at the University: no lectures or labs, and each course sits its midterm in place of its last class of the week.',
      'You sit the midterm in RID 101 Riddles on Three at 08:00, and Pat sits it.'
    ])
    // Someone who is not in the course knows only that it is the week of them.
    expect(examNotes(content, week, { id: 'nobody' }, 'Pat')).toHaveLength(1)
    const sat = sitExam(content, atMidterm(40), 'rid', right(atMidterm(40))).state
    expect(examNotes(content, sat, { id: 'ana' }, 'Pat')).toContain('Pat got an A in the midterm in RID 101, which you take with him.')
    expect(examNotes(content, { ...sat, courses: [{ ...course, studentIds: [], teacherId: 'ana' }] }, { id: 'ana' }, 'Pat')).toContain('Pat got an A in the midterm in RID 101, which you teach.')
    expect(examNotes(base, start, { id: 'ana' }, 'Pat')).toEqual([])
    expect(buildCharacterPrompt({ content, state: week, loveInterestId: 'ana', sceneBeats: [{ activityName: 'Talk' }] })).toContain('It is the week of the midterms')
  })
})

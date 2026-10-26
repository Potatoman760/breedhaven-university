import { EXAM_KINDS, courseOf, type ContentPack, type Course, type ExamKind, type GameState, type Grade, type LoveInterest } from '../model'
import type { PerformCheck } from './activities'
import { toDate } from './calendar'
import { courseMembers } from './courses'
import { coursePoints, examNow, examSlot, examWeek, gradingOf } from './grades'
import { draws, seedOf } from './seed'
import { topicsCovered, topicsOf } from './syllabus'
import { t } from '../i18n'

/**
 * Sitting an examination and what it is marked on. With the mark the course asks for by then he has a B, and short
 * of it but with a pass, a C; answering everything on the paper lifts either by a letter; and under a pass, or not
 * turning up, he fails.
 */

function shuffled<T>(items: T[], random: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** One question of a paper, with its answers in the order they are shown. */
export interface ExamQuestion {
  /** The topic it is on, by its place in the syllabus. */
  topic: number
  title: string
  ask: string
  choices: string[]
  /** Which of the choices is right. */
  right: number
}

/**
 * The paper of an examination: a few questions, each on a topic of a class he sat. The final asks first about what
 * the midterm did not. A course he sat no class of has nothing it can ask him. The same game sets the same paper.
 */
export function examPaper(content: ContentPack, state: GameState, course: Course, kind: ExamKind): ExamQuestion[] {
  const count = gradingOf(content)?.examQuestions ?? 0
  const topics = topicsOf(content, courseOf(course))
  const random = draws(state.weatherSeed ^ seedOf(`${course.id}:${kind}`))
  const taught = shuffled(topicsCovered(content, state, course).filter((index) => topics[index].question), random)
  const asked = kind === 'final' ? (state.grades[course.id]?.midterm?.topics ?? []) : []
  const chosen = [...taught.filter((index) => !asked.includes(index)), ...taught.filter((index) => asked.includes(index))].slice(0, count).sort((a, b) => a - b)
  return chosen.map((index) => {
    const { title, question } = topics[index]
    const choices = shuffled([question!.answer, ...question!.wrong], random)
    return { topic: index, title, ask: question!.ask, choices, right: choices.indexOf(question!.answer) }
  })
}

/** What he handed in: the topics the paper asked about, and how many he got right. Nothing for an examination he did not sit. */
export interface Sitting {
  topics: number[]
  correct: number
}

/**
 * The grade an examination gives. The marks are those he has in the course against what was to be had by then: the
 * midterm against the part of the term gone by, the final against the whole.
 */
export function gradeFor(content: ContentPack, state: GameState, course: Course, kind: ExamKind, sitting: Sitting | undefined, time: number): Grade {
  const grading = gradingOf(content)!
  const points = coursePoints(state, course.id)
  const outOf = kind === 'midterm' ? Math.round((grading.points * grading.midtermWeek) / grading.finalWeek) : grading.points
  const share = outOf > 0 ? points / outOf : 0
  const topics = sitting?.topics ?? []
  const correct = sitting?.correct ?? 0
  // A paper with nothing wrong on it lifts a pass by a letter. It does not make a pass of a fail.
  const perfect = topics.length > 0 && correct === topics.length
  const letter = !sitting || share < grading.passAt ? 'F' : share < grading.markAt ? (perfect ? 'B' : 'C') : perfect ? 'A' : 'B'
  return { letter, points: Math.round(points), outOf, passed: letter !== 'F', sat: sitting !== undefined, topics, correct, time }
}

/** A grade that has just been given, for telling the player. */
export interface Graded {
  course: Course
  kind: ExamKind
  grade: Grade
}

/**
 * Marks every examination whose slot has gone by without his sitting it: he was not there, and it is failed. Returns
 * the state with the grades kept, and what was given just now.
 */
export function settleExams(content: ContentPack, state: GameState): { state: GameState; graded: Graded[] } {
  if (!gradingOf(content)) return { state, graded: [] }
  const graded: Graded[] = []
  let grades = state.grades
  for (const course of state.courses.filter((c) => state.enrolment?.includes(c.id))) {
    for (const kind of EXAM_KINDS) {
      const slot = examSlot(content, course, kind)
      if (!slot || slot.ends > state.time || grades[course.id]?.[kind]) continue
      const grade = gradeFor(content, state, course, kind, undefined, slot.ends)
      grades = { ...grades, [course.id]: { ...grades[course.id], [kind]: grade } }
      graded.push({ course, kind, grade })
    }
  }
  return graded.length === 0 ? { state, graded } : { state: { ...state, grades }, graded }
}

/** Whether he can go and sit an examination: it is one of his, it is on now, and he has not sat it. */
export function canSitExam(content: ContentPack, state: GameState, courseId: string): PerformCheck {
  const course = state.courses.find((c) => c.id === courseId)
  if (!course || !state.enrolment?.includes(courseId)) return { ok: false, reasons: [t('llm.exams.notTaking')] }
  const slot = examNow(content, state, course)
  if (!slot) return { ok: false, reasons: [t('llm.exams.notNow')] }
  if (state.grades[courseId]?.[slot.kind]) return { ok: false, reasons: [t('llm.exams.alreadySat')] }
  return { ok: true, reasons: [] }
}

/**
 * Sits an examination that is on, with the answer he chose to each question of its paper: he is in the hall until it
 * ends, and comes out with his grade.
 */
export function sitExam(content: ContentPack, state: GameState, courseId: string, answers: number[]): { state: GameState; graded: Graded | undefined } {
  const course = state.courses.find((c) => c.id === courseId)
  const slot = course && examNow(content, state, course)
  if (!course || !slot || !canSitExam(content, state, courseId).ok) return { state, graded: undefined }
  const paper = examPaper(content, state, course, slot.kind)
  const sitting: Sitting = { topics: paper.map((question) => question.topic), correct: paper.filter((question, index) => answers[index] === question.right).length }
  const grade = gradeFor(content, state, course, slot.kind, sitting, slot.ends)
  return {
    state: {
      ...state,
      time: slot.ends,
      locationId: course.locationId,
      inOwnRoom: false,
      housing: { ...state.housing, room: undefined },
      grades: { ...state.grades, [courseId]: { ...state.grades[courseId], [slot.kind]: grade } }
    },
    graded: { course, kind: slot.kind, grade }
  }
}

const kindName = (kind: ExamKind): string => (kind === 'midterm' ? t('llm.exams.midterm') : t('llm.exams.final'))

/** "Midterm in ECO 101: B (42 of 50 marks · 2 of 3 right)" */
export function describeGrade({ course, kind, grade }: Graded): string {
  const why = grade.sat
    ? [
        t('llm.exams.marks', { points: grade.points, outOf: grade.outOf }),
        grade.topics.length > 0 && t('llm.exams.right', { correct: grade.correct, total: grade.topics.length })
      ]
        .filter(Boolean)
        .join(' · ')
    : t('llm.exams.notSat')
  return t('llm.exams.grade', { kind: kindName(kind), course: course.number, letter: grade.letter, why })
}

/**
 * What a love interest knows of the examinations, for her prompt: that they are next week or on now, when her own
 * are, and what he got in a course she shares with him.
 */
export function examNotes(content: ContentPack, state: GameState, li: Pick<LoveInterest, 'id'>, playerName: string): string[] {
  if (!gradingOf(content)) return []
  const { dayIndex } = toDate(content.calendar, state.time)
  const on = examWeek(content, dayIndex)
  const coming = on ? undefined : examWeek(content, dayIndex + 7)
  const notes: string[] = []
  if (on) notes.push(t('llm.exams.weekOf', { kind: on }))
  if (coming) notes.push(t('llm.exams.nextWeek', { kind: coming }))

  for (const course of state.courses.filter((one) => courseMembers(one).includes(li.id))) {
    const his = state.enrolment?.includes(course.id) ?? false
    const teaches = course.teacherId === li.id
    const slot = on && examSlot(content, course, on)
    if (slot && slot.ends > state.time) {
      const when = slot.dayIndex === dayIndex ? t('llm.exams.today') : t('llm.exams.onDay', { weekday: slot.meeting.weekday })
      notes.push(t('llm.exams.sitting', { teaches, kind: on, number: course.number, title: course.title, when, hour: String(slot.meeting.startHour).padStart(2, '0'), his, player: playerName }))
    }
    const kind = [...EXAM_KINDS].reverse().find((one) => state.grades[course.id]?.[one])
    if (his && kind) {
      const grade = state.grades[course.id]![kind]!
      notes.push(t('llm.exams.result', { player: playerName, sat: grade.sat, an: grade.letter === 'A', letter: grade.letter, kind, number: course.number, teaches }))
    }
  }
  return notes
}

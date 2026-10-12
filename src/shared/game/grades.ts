import { EXAM_KINDS, type ContentPack, type Course, type CourseMeeting, type ExamKind, type GameState, type Grade, type Grading, type LoveInterest } from '../model'
import { timeOn } from './agenda'
import { toDate } from './calendar'
import type { Outing } from './outing'
import { hasMet } from './scene'
import { isOpenFor } from './schedule'

/** The rules for marks, where the game has coursework. */
function gradingOf(content: ContentPack): Grading | undefined {
  return content.coursework?.grading
}

/** How far along the player is in a course: the points he has, out of the course's full marks. */
export function coursePoints(state: GameState, courseId: string): number {
  return state.coursePoints[courseId] ?? 0
}

/** Adds to what he has in a course, never past full marks. */
export function addCoursePoints(content: ContentPack, state: GameState, courseId: string, points: number): GameState {
  const full = gradingOf(content)?.points ?? 0
  const next = Math.min(full, Math.round((coursePoints(state, courseId) + points) * 100) / 100)
  return { ...state, coursePoints: { ...state.coursePoints, [courseId]: next } }
}

/**
 * What an hour of class is worth in a course. Sitting every class of the term comes to the
 * share of the marks that attendance carries, whatever the course's hours: a course with a
 * lab asks more hours for the same marks. The weeks of the examinations have no classes to
 * sit, and are not counted.
 */
export function pointsPerClassHour(content: ContentPack, course: Course): number {
  const grading = gradingOf(content)
  const hoursAWeek = course.meetings.reduce((sum, meeting) => sum + meeting.hours, 0)
  if (!grading || hoursAWeek === 0) return 0
  return grading.attendanceShare / (hoursAWeek * Math.max(1, grading.finalWeek - EXAM_KINDS.length))
}

/** What a session of study is worth: by the hour, and a little more in his own room, where nothing interrupts. */
export function studyPoints(content: ContentPack, outing: Pick<Outing, 'hours' | 'ownRoom'>): number {
  const grading = gradingOf(content)
  return grading ? grading.studyPerHour * outing.hours + (outing.ownRoom ? grading.ownRoomBonus : 0) : 0
}

/** When an examination is sat: the slot of the course it takes the place of. */
export interface ExamSlot {
  kind: ExamKind
  dayIndex: number
  meeting: CourseMeeting
  /** The game times it begins and is over. */
  begins: number
  ends: number
}

/**
 * The slot an examination in a course takes: the last meeting the course has in the week
 * of the examination. A course with lectures on two days sits it in place of the second.
 * Weeks are counted from the day the game begins. Undefined when the course never meets,
 * or the week is past the end of the game.
 */
export function examSlot(content: ContentPack, course: Course, kind: ExamKind): ExamSlot | undefined {
  const grading = gradingOf(content)
  if (!grading) return undefined
  const week = (kind === 'midterm' ? grading.midtermWeek : grading.finalWeek) - 1
  let found: ExamSlot | undefined
  for (let dayIndex = week * 7; dayIndex < week * 7 + 7 && dayIndex < content.calendar.lengthDays; dayIndex++) {
    const { weekday } = toDate(content.calendar, timeOn(content, dayIndex, content.calendar.start.hour))
    for (const meeting of course.meetings) {
      if (meeting.weekday !== weekday) continue
      const begins = timeOn(content, dayIndex, meeting.startHour)
      if (!found || begins > found.begins) found = { kind, dayIndex, meeting, begins, ends: begins + meeting.hours }
    }
  }
  return found
}

/** The examination a course is sitting right now, if its slot is on. */
export function examNow(content: ContentPack, state: GameState, course: Course): ExamSlot | undefined {
  return EXAM_KINDS.map((kind) => examSlot(content, course, kind)).find((slot) => slot !== undefined && state.time >= slot.begins && state.time < slot.ends)
}

/**
 * Which examinations a day falls in the week of, if either. In those weeks the lectures and
 * labs are off: a course meets only in the one slot in which its examination is sat.
 */
export function examWeek(content: ContentPack, dayIndex: number): ExamKind | undefined {
  const grading = gradingOf(content)
  if (!grading) return undefined
  const week = Math.floor(dayIndex / 7) + 1
  return week === grading.midtermWeek ? 'midterm' : week === grading.finalWeek ? 'final' : undefined
}

/** The examination, if any, that takes the place of a course's meeting on a given day at a given hour. */
export function examOn(content: ContentPack, course: Course, dayIndex: number, startHour: number): ExamSlot | undefined {
  return EXAM_KINDS.map((kind) => examSlot(content, course, kind)).find((slot) => slot?.dayIndex === dayIndex && slot.meeting.startHour === startHour)
}

/**
 * The grade a number of points earns at an examination. The midterm is marked against the
 * part of the term that has gone by, and the final against the whole of it; a pass is the
 * share of those marks the rules ask for, and the letters above it come by tenths.
 */
export function gradeFor(content: ContentPack, kind: ExamKind, points: number, time: number): Grade {
  const grading = gradingOf(content)!
  const outOf = kind === 'midterm' ? Math.round((grading.points * grading.midtermWeek) / grading.finalWeek) : grading.points
  const share = outOf > 0 ? points / outOf : 0
  const passed = share >= grading.passAt
  // A, B and C are the top three tenths; whatever else passes is a D.
  const letter = share >= 0.9 && passed ? 'A' : share >= 0.8 && passed ? 'B' : share >= 0.7 && passed ? 'C' : passed ? 'D' : 'F'
  return { letter, points: Math.round(points), outOf, passed, time }
}

/** A grade that has just been given, for telling the player. */
export interface Graded {
  course: Course
  kind: ExamKind
  grade: Grade
}

/**
 * Marks every examination whose slot has gone by and has not been marked yet: the player's
 * points in the course as they stand when it ends are his grade. Nothing is asked of him at
 * the time; there is no scene, and he need not be in the hall. Returns the state with the
 * grades kept, and what was given just now.
 */
export function settleExams(content: ContentPack, state: GameState): { state: GameState; graded: Graded[] } {
  if (!gradingOf(content)) return { state, graded: [] }
  const graded: Graded[] = []
  let grades = state.grades
  for (const course of state.courses.filter((c) => state.enrolment?.includes(c.id))) {
    for (const kind of EXAM_KINDS) {
      const slot = examSlot(content, course, kind)
      if (!slot || slot.ends > state.time || grades[course.id]?.[kind]) continue
      const grade = gradeFor(content, kind, coursePoints(state, course.id), slot.ends)
      grades = { ...grades, [course.id]: { ...grades[course.id], [kind]: grade } }
      graded.push({ course, kind, grade })
    }
  }
  return graded.length === 0 ? { state, graded } : { state: { ...state, grades }, graded }
}

/** "Midterm in ECO 101: B (42 of 50)" */
export function describeGrade({ course, kind, grade }: Graded): string {
  return `${kind === 'midterm' ? 'Midterm' : 'Final'} in ${course.number}: ${grade.letter} (${grade.points} of ${grade.outOf})${grade.passed ? '' : ', not a pass'}`
}

/** Somewhere to study for a course. */
export interface StudyPlace {
  /** What it is called in the list. */
  name: string
  locationId: string
  /** His own room: nothing interrupts, and the work goes further. */
  own?: boolean
  /** The love interest whose room it is, when it is a classmate's. */
  roomOf?: LoveInterest
}

/**
 * Where the player can study for a course: the places the rules name as good for it, his
 * own room, and the room of any love interest he has met who takes the course with him.
 */
export function studyPlaces(content: ContentPack, state: GameState, course: Course): StudyPlace[] {
  const grading = gradingOf(content)
  if (!grading) return []
  const fixed = grading.studyLocationIds.flatMap((id) => {
    const location = content.locations.find((l) => l.id === id)
    return location ? [{ name: location.name, locationId: location.id }] : []
  })
  const classmates = content.loveInterests
    .filter((li) => course.studentIds.includes(li.id) && li.room && hasMet(state, li.id))
    .map((li) => ({ name: `${li.name.split(' ')[0]}'s room`, locationId: li.room!.locationId, roomOf: li }))
  // Only somewhere that is open now, and stays open for as long as the session takes.
  const open = (place: StudyPlace) => {
    const location = content.locations.find((l) => l.id === place.locationId)
    return !location || isOpenFor(content.calendar, location, state.time, grading.studyHours)
  }
  return [...fixed, { name: 'My own room', locationId: content.newGame.room?.locationId ?? content.newGame.locationId, own: true }, ...classmates].filter(open)
}

/** The outing a session of study is: a couple of hours on one course at one place. */
export function studyOuting(content: ContentPack, course: Course, place: StudyPlace): Outing {
  const hours = gradingOf(content)?.studyHours ?? 2
  return {
    title: `Study for ${course.number}`,
    description: place.own
      ? `You shut the door, clear the desk and open your notes for ${course.title}.`
      : place.roomOf
        ? `You take your notes for ${course.title} round to ${place.roomOf.name.split(' ')[0]}'s.`
        : `You find a seat, spread out your notes for ${course.title} and get down to it.`,
    withIds: place.roomOf ? [place.roomOf.id] : [],
    locationId: place.locationId,
    hours,
    studyCourseId: course.id,
    ownRoom: place.own,
    roomOf: place.roomOf?.id,
    // Somewhere public, whoever is there is part of it; his own room is his own.
    dropIn: !place.own && !place.roomOf
  }
}

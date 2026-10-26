import { EXAM_KINDS, type ContentPack, type Course, type CourseMeeting, type ExamKind, type GameState, type Grading, type LoveInterest } from '../model'
import { timeOn } from './agenda'
import { toDate } from './calendar'
import type { Outing } from './outing'
import { hasMet } from './scene'
import { isOpenFor } from './schedule'
import { t } from '../i18n'

/** The rules for marks, where the game has coursework. */
export function gradingOf(content: ContentPack): Grading | undefined {
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
    .map((li) => ({ name: t('game.grades.herRoom', { first: li.name.split(' ')[0] }), locationId: li.room!.locationId, roomOf: li }))
  // Only somewhere that is open now, and stays open for as long as the session takes.
  const open = (place: StudyPlace) => {
    const location = content.locations.find((l) => l.id === place.locationId)
    return !location || isOpenFor(content.calendar, location, state.time, grading.studyHours)
  }
  return [...fixed, { name: t('game.grades.myRoom'), locationId: content.newGame.room?.locationId ?? content.newGame.locationId, own: true }, ...classmates].filter(open)
}

/** The outing a session of study is: a couple of hours on one course at one place. */
export function studyOuting(content: ContentPack, course: Course, place: StudyPlace): Outing {
  const hours = gradingOf(content)?.studyHours ?? 2
  return {
    title: t('game.grades.studyTitle', { number: course.number }),
    description: place.own
      ? t('game.grades.studyOwn', { title: course.title })
      : place.roomOf
        ? t('game.grades.studyHers', { title: course.title, first: place.roomOf.name.split(' ')[0] })
        : t('game.grades.studyPublic', { title: course.title }),
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

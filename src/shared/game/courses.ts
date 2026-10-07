import { MAX_SCENE_CAST, type ContentPack, type Course, type CourseMeeting, type GameState } from '../model'
import type { PerformCheck } from './activities'
import { toDate } from './calendar'
import { applyEffects } from './conditions'
import { eventsOn } from './events'
import { addCoursePoints, examNow, pointsPerClassHour } from './grades'

const clock = (hour: number): string => `${String(hour).padStart(2, '0')}:00`

/** "Solday and Windsday 10:00, lab Hearthday 13:00-16:00" */
export function describeMeetings(course: Course): string {
  const lectures = course.meetings.filter((m) => m.kind === 'lecture')
  const labs = course.meetings.filter((m) => m.kind === 'lab')
  const sameHour = lectures.every((m) => m.startHour === lectures[0]?.startHour)
  const said = [
    lectures.length === 0
      ? ''
      : sameHour
        ? `${lectures.map((m) => m.weekday).join(' and ')} ${clock(lectures[0].startHour)}`
        : lectures.map((m) => `${m.weekday} ${clock(m.startHour)}`).join(' and '),
    ...labs.map((m) => `lab ${m.weekday} ${clock(m.startHour)}-${clock(m.startHour + m.hours)}`)
  ]
  return said.filter(Boolean).join(', ')
}

/** Every love interest a course keeps busy while it meets: those who take it, and the one who teaches it. */
export function courseMembers(course: Course): string[] {
  return course.teacherId ? [course.teacherId, ...course.studentIds] : course.studentIds
}

/** Whether two courses ever meet at the same time. */
export function coursesClash(a: Course, b: Course): boolean {
  return a.meetings.some((m) =>
    b.meetings.some((n) => n.weekday === m.weekday && m.startHour < n.startHour + n.hours && n.startHour < m.startHour + m.hours)
  )
}

/** Whether a course can be added to a selection: room left, and no clash with one already picked. */
export function canEnrol(content: ContentPack, state: GameState, selected: string[], courseId: string): PerformCheck {
  const course = state.courses.find((c) => c.id === courseId)
  if (!course) return { ok: false, reasons: ['No such course'] }
  const reasons: string[] = []
  const max = content.coursework?.maxCourses ?? 0
  if (selected.length >= max) reasons.push(`You can take at most ${max} courses`)
  const clash = state.courses.find((c) => selected.includes(c.id) && c.id !== courseId && coursesClash(c, course))
  if (clash) reasons.push(`Meets at the same time as ${clash.number}`)
  return { ok: reasons.length === 0, reasons }
}

/** The courses the player is taking. */
export function enrolledCourses(state: GameState): Course[] {
  return state.courses.filter((c) => state.enrolment?.includes(c.id))
}

/** The meeting of a course that is under way at the current time, if one is. */
export function meetingNow(content: ContentPack, state: GameState, course: Course): CourseMeeting | undefined {
  const date = toDate(content.calendar, state.time)
  // No classes meet on orientation day, or during a holiday or break.
  if (content.orientation && date.dayIndex === content.orientation.day - 1) return undefined
  if (eventsOn(content, state).some((event) => event.noClasses)) return undefined
  return course.meetings.find((m) => m.weekday === date.weekday && date.hour >= m.startHour && date.hour < m.startHour + m.hours)
}

/**
 * The class a love interest has to be at soon, if she has one starting within the given
 * hours: the course, and how many hours off it is. Nothing while she is already in one.
 */
export function classSoon(content: ContentPack, state: GameState, loveInterestId: string, withinHours: number): { course: Course; inHours: number; startHour: number } | undefined {
  const hers = state.courses.filter((course) => courseMembers(course).includes(loveInterestId))
  if (hers.some((course) => meetingNow(content, state, course))) return undefined
  for (let inHours = 1; inHours <= withinHours; inHours++) {
    const then = { ...state, time: state.time + inHours }
    for (const course of hers) {
      const meeting = meetingNow(content, then, course)
      if (meeting) return { course, inHours, startHour: meeting.startHour }
    }
  }
  return undefined
}

/** Courses from the catalogue that are meeting at the current time, whether or not the player takes them. */
export function coursesInSession(content: ContentPack, state: GameState): Course[] {
  return state.courses.filter((course) => meetingNow(content, state, course) !== undefined)
}

export function canAttend(content: ContentPack, state: GameState, courseId: string): PerformCheck {
  const config = content.coursework
  const course = state.courses.find((c) => c.id === courseId)
  if (!config || !course) return { ok: false, reasons: ['No such course'] }

  const reasons: string[] = []
  const date = toDate(content.calendar, state.time)
  const meeting = meetingNow(content, state, course)
  if (!state.enrolment?.includes(courseId)) reasons.push('You are not taking this course')
  if (!meeting) reasons.push('It is not meeting now')
  // An examination takes the place of the class: there is nothing to attend, and the grade comes when it is over.
  const exam = meeting && examNow(content, state, course)
  if (exam) reasons.push(`The ${exam.kind} is being sat: your grade is given when it ends at ${String(exam.meeting.startHour + exam.meeting.hours).padStart(2, '0')}:00`)
  if (state.locationId !== course.locationId) {
    const where = content.locations.find((l) => l.id === course.locationId)
    reasons.push(`Go to ${where?.name ?? course.locationId} first`)
  }
  if (meeting && state.attendance[courseId]?.last === `${date.dayIndex}:${meeting.startHour}`) {
    reasons.push('You have already sat this class')
  }
  const energy = config.energy * (meeting?.hours ?? 1)
  if (state.player.energy < energy) reasons.push(`Requires ${energy} energy`)
  return { ok: reasons.length === 0, reasons }
}

/**
 * The love interests a class is a scene with: whoever teaches it, if a love interest
 * does, then the students the player is closest to, up to a scene's worth.
 */
export function classmates(state: GameState, course: Course): string[] {
  const affection = (id: string) => state.relationships[id]?.affection ?? 0
  const known = (id: string) => state.relationships[id] !== undefined
  const fellows = course.studentIds.filter(known).sort((a, b) => affection(b) - affection(a))
  return [...(course.teacherId && known(course.teacherId) ? [course.teacherId] : []), ...fellows].slice(0, MAX_SCENE_CAST)
}

/**
 * Sits the class that is under way, until it ends: works on the stats the course teaches, earns
 * marks in it, and costs energy. What his classmates make of him is for the scene to settle. A long class is worth, and
 * costs, as many times more as it has hours.
 */
export function attend(content: ContentPack, state: GameState, courseId: string): GameState {
  const check = canAttend(content, state, courseId)
  if (!check.ok) throw new Error(`Cannot attend "${courseId}": ${check.reasons.join('; ')}`)
  const config = content.coursework!
  const course = state.courses.find((c) => c.id === courseId)!
  const date = toDate(content.calendar, state.time)
  const meeting = meetingNow(content, state, course)!

  let after = applyEffects(
    state,
    [
      // The class's worth is shared between what it teaches: all of it to one stat, or half each to two.
      ...course.stats.map((stat) => ({
        type: 'stat' as const,
        stat,
        amount: (config.statGain * meeting.hours) / course.stats.length
      })),
      { type: 'energy', amount: -config.energy * meeting.hours }
    ],
    { content }
  )
  // Sitting a class is most of how a course's marks are earned.
  after = addCoursePoints(content, after, courseId, pointsPerClassHour(content, course) * meeting.hours)
  return {
    ...after,
    // Arriving late still keeps you until the class is over.
    time: after.time + (meeting.startHour + meeting.hours - date.hour),
    attendance: {
      ...after.attendance,
      [courseId]: {
        count: (after.attendance[courseId]?.count ?? 0) + 1,
        last: `${date.dayIndex}:${meeting.startHour}`
      }
    }
  }
}

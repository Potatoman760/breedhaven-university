import { type ContentPack, type Course, type CourseMeeting, type GameState } from '../model'
import type { PerformCheck } from './activities'
import { toDate } from './calendar'
import { applyEffects } from './conditions'
import { eventsOn } from './events'
import { factor } from './modifiers'
import { addCoursePoints, examNow, examOn, examWeek, pointsPerClassHour } from './grades'
import { classKey } from './syllabus'

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

/**
 * Whether a course answers a search: every word typed is found somewhere in its number
 * (so its code, "ADM"), title, subject or professor, or in the name of someone who takes
 * or teaches it ("tamsin"). Case does not matter. Nothing typed matches nothing.
 */
export function courseMatches(content: ContentPack, course: Course, search: string): boolean {
  const words = search.toLowerCase().split(/\s+/).filter((word) => word !== '')
  if (words.length === 0) return false
  const members = courseMembers(course)
  const names = [...content.loveInterests, ...content.npcs].filter((c) => members.includes(c.id)).map((c) => c.name)
  const text = [course.number, course.code, course.title, course.subject, course.professor, ...names].join('\n').toLowerCase()
  return words.every((word) => text.includes(word))
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
  const meeting = course.meetings.find((m) => m.weekday === date.weekday && date.hour >= m.startHour && date.hour < m.startHour + m.hours)
  // In the weeks of the midterms and the finals there are no lectures or labs: only the slot the examination is sat in is kept.
  if (meeting && examWeek(content, date.dayIndex) && !examOn(content, course, date.dayIndex, meeting.startHour)) return undefined
  return meeting
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
  // An examination takes the place of the class: it is sat, not attended.
  const exam = meeting && examNow(content, state, course)
  if (exam) reasons.push(`The ${exam.kind} is being sat`)
  if (state.locationId !== course.locationId) {
    const where = content.locations.find((l) => l.id === course.locationId)
    reasons.push(`Go to ${where?.name ?? course.locationId} first`)
  }
  if (meeting && state.attendance[courseId]?.sat.includes(classKey(date.dayIndex, meeting.startHour))) {
    reasons.push('You have already sat this class')
  }
  const energy = Math.round(config.energy * (meeting?.hours ?? 1) * factor(content, state, 'effort'))
  if (state.player.energy < energy) reasons.push(`Requires ${energy} energy`)
  return { ok: reasons.length === 0, reasons }
}

// How many love interests the player sits by in a class: the scene is with them and no one else.
export const CLASS_SEATS = 2

/** A repeatable source of numbers in [0, 1) for one class sitting of one game. */
function seatDraws(seed: number, time: number): () => number {
  let x = (seed ^ Math.imul(time + 1, 0x51ed270b)) >>> 0
  return () => {
    x = (x + 0x6d2b79f5) >>> 0
    let t = Math.imul(x ^ (x >>> 15), 1 | x)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000
  }
}

/**
 * The love interests a class is a scene with. A love interest who teaches it is always
 * there, at the front of the room, and leads the scene. The rest are the students sitting
 * next to the player: with two or fewer in the class, all of them; with more, two, the one
 * who likes him most and one of the others at random, or two at random when they all like
 * him the same. Anyone he walked in with sits by him before anyone else does.
 */
export function classmates(
  state: GameState,
  course: Course,
  random: () => number = seatDraws(state.weatherSeed, state.time),
  /** Those he arrived with, who take the seats by him first. */
  arrivedWith: string[] = []
): string[] {
  const affection = (id: string) => state.relationships[id]?.affection ?? 0
  const teacher = course.teacherId !== undefined && state.relationships[course.teacherId] !== undefined ? [course.teacherId] : []
  const known = course.studentIds.filter((id) => state.relationships[id] !== undefined && !teacher.includes(id))
  if (known.length <= CLASS_SEATS) return [...teacher, ...[...known].sort((a, b) => affection(b) - affection(a))]
  const walkedIn = arrivedWith.filter((id) => known.includes(id)).slice(0, CLASS_SEATS)
  if (walkedIn.length > 0) {
    const others = known.filter((id) => !walkedIn.includes(id)).sort((a, b) => affection(b) - affection(a))
    return [...teacher, ...walkedIn, ...others.slice(0, CLASS_SEATS - walkedIn.length)]
  }

  const draw = <T>(from: T[]): T => from[Math.floor(random() * from.length)]
  const most = Math.max(...known.map(affection))
  // Those who like him most: one of them takes the first seat. When that is everyone, both seats are drawn.
  const first = draw(known.filter((id) => affection(id) === most))
  const seated = [first]
  while (seated.length < CLASS_SEATS) seated.push(draw(known.filter((id) => !seated.includes(id))))
  return [...teacher, ...seated]
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
      { type: 'energy', amount: -Math.round(config.energy * meeting.hours * factor(content, state, 'effort')) }
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
      [courseId]: { sat: [...(after.attendance[courseId]?.sat ?? []), classKey(date.dayIndex, meeting.startHour)] }
    }
  }
}

import type { ContentPack, GameState } from '../model'
import type { PerformCheck } from './activities'
import { timeOn } from './agenda'
import { attendees, canKeep } from './appointments'
import { toDate } from './calendar'
import { canAttend, courseMembers, meetingNow } from './courses'
import { canSitExam } from './exams'
import { examOn } from './grades'
import { canWork, shiftLaterToday, shiftNow } from './jobs'

/** Something on his timetable still to come today: a class he takes, a shift at his job, or a plan he has made. */
export interface Upcoming {
  kind: 'class' | 'work' | 'plan' | 'exam'
  /** The course, the job or the plan. */
  id: string
  title: string
  /** Game time at which it starts. */
  time: number
  locationId: string
}

/**
 * The next thing on his timetable today that has yet to start: the soonest of the classes
 * he takes, an examination in one of them, his shift, and the plans he has made. Nothing when the rest of the
 * day is his own.
 */
export function nextUp(content: ContentPack, state: GameState): Upcoming | undefined {
  const { dayIndex, hour, weekday } = toDate(content.calendar, state.time)
  const found: Upcoming[] = []

  for (const plan of state.appointments) {
    if (plan.time > state.time && toDate(content.calendar, plan.time).dayIndex === dayIndex) {
      found.push({ kind: 'plan', id: plan.id, title: plan.title, time: plan.time, locationId: plan.locationId })
    }
  }

  const shift = shiftLaterToday(content, state)
  if (shift) {
    const time = timeOn(content, dayIndex, shift.shift.startHour)
    // Only a shift he could clock in for: one from before he was taken on, or already worked, is not to come.
    if (shiftNow(content, { ...state, time })?.key === shift.key) {
      found.push({ kind: 'work', id: shift.job.id, title: `Your shift: ${shift.job.title}`, time, locationId: shift.job.locationId })
    }
  }

  for (const course of state.courses) {
    if (!state.enrolment?.includes(course.id)) continue
    for (const meeting of course.meetings) {
      if (meeting.weekday !== weekday || meeting.startHour <= hour) continue
      const time = timeOn(content, dayIndex, meeting.startHour)
      // An examination takes the place of the class in its slot, and is something to turn up for like any other.
      const exam = examOn(content, course, dayIndex, meeting.startHour)
      if (exam) {
        if (!state.grades[course.id]?.[exam.kind]) found.push({ kind: 'exam', id: course.id, title: `${exam.kind === 'midterm' ? 'Midterm' : 'Final'}: ${course.number}`, time, locationId: course.locationId })
        continue
      }
      // No class meets on orientation day or a holiday.
      if (!meetingNow(content, { ...state, time }, course)) continue
      found.push({ kind: 'class', id: course.id, title: `${course.number}: ${course.title}`, time, locationId: course.locationId })
    }
  }

  // The soonest; of two that start together, the one listed first: a plan, then work, then a class.
  return found.reduce<Upcoming | undefined>((first, next) => (first === undefined || next.time < first.time ? next : first), undefined)
}

/**
 * Whether his day is clear from now until a given time: nothing of his own, a class, a shift or another plan, starts
 * before it. Skipping ahead to something is only offered when it is, so that the skip does not carry him past a class.
 */
export function clearUntil(content: ContentPack, state: GameState, time: number): boolean {
  const next = nextUp(content, state)
  return next === undefined || next.time >= time
}

/** The player as he would be on turning up for it: the hours until it starts gone by, and he at the place. */
export function arriveFor(state: GameState, next: Upcoming): GameState {
  return { ...state, time: next.time, locationId: next.locationId, inOwnRoom: false }
}

/** Whether he could go through with it on turning up: enough energy for the class, and so on. */
export function canGoTo(content: ContentPack, state: GameState, next: Upcoming): PerformCheck {
  const there = arriveFor(state, next)
  if (next.kind === 'class') return canAttend(content, there, next.id)
  if (next.kind === 'exam') return canSitExam(content, there, next.id)
  if (next.kind === 'work') return canWork(content, there)
  return canKeep(content, there, next.id)
}

/**
 * The next thing on his timetable today, when some of those he is with are in it too and he
 * could go through with it: a class one of them takes or teaches, or a plan one of them is
 * part of. With it, which of them. That is something they can set off for together. A
 * shift is his own, and is never one.
 */
export function sharedUpcoming(content: ContentPack, state: GameState, withIds: string[]): { next: Upcoming; sharedBy: string[] } | undefined {
  const next = nextUp(content, state)
  if (!next || next.kind === 'work') return undefined
  const course = next.kind === 'class' ? state.courses.find((c) => c.id === next.id) : undefined
  const plan = next.kind === 'plan' ? state.appointments.find((a) => a.id === next.id) : undefined
  const inIt = course ? courseMembers(course) : plan ? attendees(plan) : []
  const sharedBy = withIds.filter((id) => inIt.includes(id))
  if (sharedBy.length === 0 || !canGoTo(content, state, next).ok) return undefined
  return { next, sharedBy }
}

// How long before something of his he has to be free of whatever else he is doing.
export const FREE_BEFORE_HOURS = 1

/**
 * What of his own stands in the way of a scene going somewhere: the next thing on his
 * timetable today, when going would have him still on the way, or only just arrived, as
 * it starts. Going to the place it is at, and getting there by the time it starts, is
 * never in the way: that is walking him to it.
 */
export function moveClash(content: ContentPack, state: GameState, arriveAt: number, locationId: string): Upcoming | undefined {
  const next = nextUp(content, state)
  if (!next) return undefined
  if (locationId === next.locationId && arriveAt <= next.time) return undefined
  return arriveAt + FREE_BEFORE_HOURS > next.time ? next : undefined
}

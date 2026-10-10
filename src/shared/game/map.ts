import type { ContentPack, GameState, LoveInterest } from '../model'
import { appointmentsNow, attendees } from './appointments'
import { isGameOver, toDate } from './calendar'
import { courseMembers, coursesInSession } from './courses'
import { eventKeeping } from './events'
import { isOpen, scheduledLocationId } from './schedule'
import type { PerformCheck } from './activities'

/**
 * The place someone is at work right now, if she is the boss of a job and one of its shifts
 * is on. As a teacher is in the hall for the hours her courses meet, a boss is at her place
 * for the hours of the job she gives, and those hours are the job's own: nothing else says
 * when she is there.
 */
export function workplaceNow(content: ContentPack, state: GameState, id: string): string | undefined {
  const { weekday, hour } = toDate(content.calendar, state.time)
  return content.jobs?.jobs.find((job) => job.bossId === id && job.shifts.some((s) => s.weekday === weekday && hour >= s.startHour && hour < s.startHour + s.hours))?.locationId
}

/**
 * Where someone is right now: in class if a course they take or teach is meeting, at work
 * if a job they give has a shift on, otherwise wherever their schedule puts them, if anywhere.
 */
export function locationOf(
  content: ContentPack,
  state: GameState,
  li: LoveInterest
): string | undefined {
  // A plan with the player comes before everything: they are there waiting.
  const waiting = appointmentsNow(state).find((a) => attendees(a).includes(li.id))
  if (waiting) return waiting.locationId
  const inClass = coursesInSession(content, state).find((c) => courseMembers(c).includes(li.id))
  // Somewhere she said she would be comes before her ordinary day, though not before a class or her work.
  // With nothing on her schedule she is nowhere he can walk up to her: she is in her own room, and shown so on the map. She can still be asked out.
  return inClass?.locationId ?? workplaceNow(content, state, li.id) ?? eventKeeping(content, state, li.id)?.locationId ?? scheduledLocationId(li, toDate(content.calendar, state.time))
}

/** Love interests who are at the given location right now. */
export function loveInterestsAt(
  content: ContentPack,
  state: GameState,
  locationId: string
): LoveInterest[] {
  return content.loveInterests.filter((li) => locationOf(content, state, li) === locationId)
}

/**
 * Whether someone is sitting in a class the player is not taking: she is at the place, but
 * in a room he has no business in, and not to be walked up to. Someone waiting for him by
 * arrangement is not in class.
 */
export function inClassApart(content: ContentPack, state: GameState, li: Pick<LoveInterest, 'id'>): boolean {
  if (appointmentsNow(state).some((a) => attendees(a).includes(li.id))) return false
  const course = coursesInSession(content, state).find((c) => courseMembers(c).includes(li.id))
  return course !== undefined && !state.enrolment?.includes(course.id)
}

/**
 * The love interests at a place whom the player can go up to: everyone there but those
 * in a class he does not take with them.
 */
export function approachableAt(content: ContentPack, state: GameState, locationId: string): LoveInterest[] {
  return loveInterestsAt(content, state, locationId).filter((li) => !inClassApart(content, state, li))
}

/** Love interests with nothing on their schedule right now: each is in her own room, not somewhere he can go to. */
export function whereaboutsUnknown(content: ContentPack, state: GameState): LoveInterest[] {
  return content.loveInterests.filter((li) => locationOf(content, state, li) === undefined)
}

export function canTravel(content: ContentPack, state: GameState, locationId: string): PerformCheck {
  const reasons: string[] = []
  const location = content.locations.find((l) => l.id === locationId)
  if (!content.map || !location) return { ok: false, reasons: ['There is no way to get there'] }

  if (isGameOver(content.calendar, state.time)) reasons.push('The game is over')
  if (locationId === state.locationId) reasons.push('You are already here')
  if (!isOpen(location, toDate(content.calendar, state.time).hour)) reasons.push(`${location.name} is closed`)
  return { ok: reasons.length === 0, reasons }
}

/** Moves the player to another location. Going there takes no time. */
export function travel(content: ContentPack, state: GameState, locationId: string): GameState {
  const check = canTravel(content, state, locationId)
  if (!check.ok) throw new Error(`Cannot travel to "${locationId}": ${check.reasons.join('; ')}`)
  return { ...state, locationId, inOwnRoom: false }
}

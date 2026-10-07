import type { ContentPack, GameState, LoveInterest } from '../model'
import { appointmentsNow, attendees } from './appointments'
import { isGameOver, toDate } from './calendar'
import { courseMembers, coursesInSession } from './courses'
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
  return inClass?.locationId ?? workplaceNow(content, state, li.id) ?? scheduledLocationId(li, toDate(content.calendar, state.time))
}

/** Love interests who are at the given location right now. */
export function loveInterestsAt(
  content: ContentPack,
  state: GameState,
  locationId: string
): LoveInterest[] {
  return content.loveInterests.filter((li) => locationOf(content, state, li) === locationId)
}

/** Love interests who aren't anywhere the player can find them right now. */
export function whereaboutsUnknown(content: ContentPack, state: GameState): LoveInterest[] {
  return content.loveInterests.filter((li) => locationOf(content, state, li) === undefined)
}

export function canTravel(content: ContentPack, state: GameState, locationId: string): PerformCheck {
  const reasons: string[] = []
  const location = content.locations.find((l) => l.id === locationId)
  if (!content.map || !location) return { ok: false, reasons: ['There is no way to get there'] }

  if (isGameOver(content.calendar, state.time)) reasons.push('The game is over')
  if (locationId === state.locationId) reasons.push('You are already here')
  // Judged on the hour of arrival, not departure.
  const arrival = toDate(content.calendar, state.time + content.map.travelHours)
  if (!isOpen(location, arrival.hour)) reasons.push(`${location.name} will be closed`)
  return { ok: reasons.length === 0, reasons }
}

/** Moves the player to another location, which takes the map's travel time. */
export function travel(content: ContentPack, state: GameState, locationId: string): GameState {
  const check = canTravel(content, state, locationId)
  if (!check.ok) throw new Error(`Cannot travel to "${locationId}": ${check.reasons.join('; ')}`)
  return { ...state, locationId, time: state.time + content.map!.travelHours }
}

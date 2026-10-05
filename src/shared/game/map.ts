import type { ContentPack, GameState, LoveInterest } from '../model'
import { appointmentsNow, attendees } from './appointments'
import { isGameOver, toDate } from './calendar'
import { coursesInSession } from './courses'
import { isOpen, scheduledLocationId } from './schedule'
import type { PerformCheck } from './activities'

/**
 * Where a love interest is right now: in class if a course they take is meeting,
 * otherwise wherever their schedule puts them, if anywhere.
 */
export function locationOf(
  content: ContentPack,
  state: GameState,
  li: LoveInterest
): string | undefined {
  // A plan with the player comes before everything: they are there waiting.
  const waiting = appointmentsNow(state).find((a) => attendees(a).includes(li.id))
  if (waiting) return waiting.locationId
  const inClass = coursesInSession(content, state).find((c) => c.studentIds.includes(li.id))
  return inClass?.locationId ?? scheduledLocationId(li, toDate(content.calendar, state.time))
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

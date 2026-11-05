import { CalendarEventSchema, type CalendarEvent, type ContentPack, type GameState, type Getaway } from '../model'
import type { PerformCheck } from './activities'
import { dayIndexOf, isGameOver, toDate } from './calendar'
import { addNote, giveContact } from './courier'
import { allEvents, eventsOn } from './events'
import { bookTrip, canBookTrip } from './trips'
import { t } from '../i18n'

/**
 * Weekends away he books himself, from the Trips app on his phone. A getaway is a template: booked for a weekend, it
 * becomes an event of his own in the save on those days, whose parts are all his and theirs, and from then on it is a
 * trip like any other (`trips.ts`): he is away, sleeps there, and is driven home once it is over.
 */

// What a booked getaway's event is called: the getaway's id and the day it begins, so that the same one can be had again.
const AT = '@'
export const getawayEventId = (getaway: Pick<Getaway, 'id'>, dayIndex: number): string => `${getaway.id}${AT}${dayIndex}`

/** The getaway an event of the save was booked from, if it was one. */
export function getawayOf(content: ContentPack, eventId: string): Getaway | undefined {
  const id = eventId.slice(0, eventId.lastIndexOf(AT))
  return eventId.includes(AT) ? content.getaways.trips.find((one) => one.id === id) : undefined
}

/** The first hour of a day, as the game counts time. */
export const dayStart = (content: ContentPack, dayIndex: number): number => dayIndex * content.calendar.hoursPerDay - content.calendar.start.hour

// The mark the save keeps once he has been told of the getaways.
export const GETAWAYS_TOLD = 'getaways-told'

/**
 * Tells him of the getaways, once: the notice's DM from whoever sends it, from its hour on its day of term on. The same
 * state before then, after it is sent, and when there is none.
 */
export function tellOfGetaways(content: ContentPack, state: GameState): GameState {
  const notice = content.getaways.notice
  if (!notice || state.flags[GETAWAYS_TOLD] || isGameOver(content.calendar, state.time)) return state
  const { dayIndex, hour } = toDate(content.calendar, state.time)
  if (dayIndex + 1 < notice.day || (dayIndex + 1 === notice.day && hour < notice.hour)) return state
  const told = { ...state, flags: { ...state.flags, [GETAWAYS_TOLD]: true } }
  return addNote(giveContact(told, notice.fromId), notice.fromId, { from: 'them', text: notice.text, read: false })
}

/**
 * The days he can book a getaway to begin on: its weekday, after today, inside the weeks of the year it is had in, with
 * all of it before the year is over, and nothing else on any day of it (an event, or another trip).
 */
export function getawayDays(content: ContentPack, state: GameState, getaway: Getaway): number[] {
  const { calendar } = content
  const today = toDate(calendar, state.time).dayIndex
  const days: number[] = []
  for (let day = today + 1; day + getaway.days <= calendar.lengthDays; day++) {
    const date = toDate(calendar, dayStart(content, day))
    if (date.weekday !== getaway.startsOn) continue
    const opens = dayIndexOf(calendar, date.year, getaway.from.month, getaway.from.day)
    const closes = dayIndexOf(calendar, date.year, getaway.until.month, getaway.until.day)
    if (day < opens || day > closes) continue
    const busy = Array.from({ length: getaway.days }, (_, i) => day + i).some((one) => eventsOn(content, state, dayStart(content, one)).length > 0)
    if (!busy) days.push(day)
  }
  return days
}

/** The event a getaway is, booked for the weekend beginning on a day: its parts all his and theirs. */
export function getawayEvent(content: ContentPack, getaway: Getaway, dayIndex: number): CalendarEvent {
  const date = toDate(content.calendar, dayStart(content, dayIndex))
  return CalendarEventSchema.parse({
    id: getawayEventId(getaway, dayIndex),
    name: getaway.name,
    description: getaway.description,
    summary: getaway.summary,
    month: date.month.id,
    day: date.day,
    year: date.year,
    durationDays: getaway.days,
    locationId: getaway.locationId,
    homeAt: getaway.homeAt,
    road: getaway.road,
    travel: getaway.travel,
    gain: getaway.gain,
    program: getaway.program.map((part) => ({ ...part, onTrip: true }))
  })
}

/** Whether he can book a getaway for a weekend with these: a weekend it can be had, and the trip's own terms. */
export function canBookGetaway(content: ContentPack, state: GameState, getaway: Getaway, dayIndex: number, ids: string[]): PerformCheck {
  const check = canBookTrip(content, state, getaway, ids)
  if (getawayDays(content, state, getaway).includes(dayIndex)) return check
  return { ok: false, reasons: [t('game.getaways.notThatWeekend'), ...check.reasons] }
}

/** Books a getaway for the weekend beginning on a day: its event put in the save, then booked as a trip is. */
export function bookGetaway(content: ContentPack, state: GameState, getaway: Getaway, dayIndex: number, ids: string[]): GameState {
  if (!canBookGetaway(content, state, getaway, dayIndex, ids).ok) return state
  const event = getawayEvent(content, getaway, dayIndex)
  const terms = { eventId: event.id, most: getaway.most, price: getaway.price, minStage: getaway.minStage }
  const place = content.locations.find((location) => location.id === getaway.locationId)
  const told = t('game.getaways.booked', { place: place?.name ?? getaway.name, days: getaway.days })
  return bookTrip(content, { ...state, events: [...state.events, event] }, terms, ids, told)
}

/**
 * The trips he has booked that are still to come or under way, soonest first: each with its event, the day it begins,
 * and who is going. The calendar's (the Mistmoon Break) are among them.
 */
export function upcomingTrips(content: ContentPack, state: GameState): { event: CalendarEvent; dayIndex: number; ids: string[] }[] {
  const { calendar } = content
  const { year, dayIndex: today } = toDate(calendar, state.time)
  return allEvents(content, state)
    .flatMap((event) => {
      const ids = state.trips[event.id]
      if (!ids) return []
      const dayIndex = dayIndexOf(calendar, event.year ?? year, event.month, event.day)
      return dayIndex + event.durationDays > today ? [{ event, dayIndex, ids }] : []
    })
    .sort((a, b) => a.dayIndex - b.dayIndex)
}

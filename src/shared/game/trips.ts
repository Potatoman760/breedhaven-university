import type { CalendarEvent, ContentPack, EventPart, GameState, LoveInterest } from '../model'
import type { PerformCheck } from './activities'
import { toDate } from './calendar'
import { eventDay, eventsOn } from './events'
import { partKey } from './eventParts'
import { addGroupNote, startGroupChat } from './courier'
import { stageFor, stageRank } from './relationships'

/**
 * A trip away over a break: booked at a part of an event before it (who comes, and what it costs), then the trip's
 * own event, whose parts are his and theirs alone. While it lasts he is away: he sleeps where he is, his shifts are
 * not his to work, and once its last part is done he comes home.
 */

type Booking = NonNullable<EventPart['booking']>

/** Who he could take: the women he has met who are at the stage it asks or closer with him. */
export function tripChoices(content: ContentPack, state: GameState, booking: Pick<Booking, 'minStage'>): LoveInterest[] {
  const rel = content.relationships
  const least = stageRank(rel, booking.minStage)
  return content.loveInterests.filter((li) => state.met.includes(li.id) && state.relationships[li.id] !== undefined && stageRank(rel, stageFor(rel, state.relationships[li.id].affection).id) >= least)
}

/** What the trip costs with these along: a head for each, and his own. */
export const tripCost = (booking: Pick<Booking, 'price'>, ids: string[]): number => booking.price * (ids.length + 1)

/** Whether he can book the trip with these: one at least, no more than it takes, each willing, and the money for it. */
export function canBookTrip(content: ContentPack, state: GameState, booking: Booking, ids: string[]): PerformCheck {
  const willing = tripChoices(content, state, booking).map((li) => li.id)
  const reasons = [
    ids.length === 0 && 'Take someone',
    ids.length > booking.most && `No more than ${booking.most}`,
    ids.some((id) => !willing.includes(id)) && 'Not everyone would come',
    state.player.money < tripCost(booking, ids) && `It costs $${tripCost(booking, ids)}`
  ].filter((one): one is string => typeof one === 'string')
  return { ok: reasons.length === 0, reasons }
}

/** The group chat a trip has, by its id. */
export const tripChatId = (eventId: string): string => `trip:${eventId}`

/**
 * Books the trip: paid for, and who is going kept in the save. A group chat is started for it, named for the break,
 * with those going in it, and he tells them.
 */
export function bookTrip(content: ContentPack, state: GameState, booking: Booking, ids: string[]): GameState {
  if (!canBookTrip(content, state, booking, ids).ok) return state
  const trip = content.calendar.events.find((event) => event.id === booking.eventId)
  const place = content.locations.find((location) => location.id === trip?.locationId)
  const name = (trip?.name ?? 'The trip').replace(/^the /i, '')
  const paid: GameState = { ...state, player: { ...state.player, money: state.player.money - tripCost(booking, ids) }, trips: { ...state.trips, [booking.eventId]: ids } }
  const chat = startGroupChat(paid, tripChatId(booking.eventId), name, ids)
  const told = `I booked us${place ? ` at ${place.name}` : ''} for the ${name}! ${trip?.durationDays ?? 4} days away together.`
  return addGroupNote(chat, tripChatId(booking.eventId), { from: 'player', text: told, read: true })
}

const tripEvents = (content: ContentPack, state: GameState): CalendarEvent[] =>
  [...content.calendar.events, ...state.events].filter((event) => state.trips[event.id] !== undefined && event.program.some((part) => part.onTrip))

const unfinished = (state: GameState, event: CalendarEvent): boolean => event.program.some((part) => part.onTrip && !state.partsAttended.includes(partKey(event, part)))

/** The trip he is away on now, if he is: one he booked, on today, with some of it still to come. */
export function tripUnderway(content: ContentPack, state: GameState): CalendarEvent | undefined {
  const today = eventsOn(content, state).map((event) => event.id)
  return tripEvents(content, state).find((event) => today.includes(event.id) && unfinished(state, event))
}

/**
 * What comes next on the trip he is away on: the first of its parts he has not been to, and whether it is today, to be
 * gone to now, or on a later day, for which he sleeps first. Nothing when he is not away.
 */
export function nextTripPart(content: ContentPack, state: GameState): { event: CalendarEvent; part: EventPart; today: boolean } | undefined {
  const trip = tripUnderway(content, state)
  if (!trip) return undefined
  const part = trip.program.find((one) => one.onTrip && !state.partsAttended.includes(partKey(trip, one)))
  if (!part) return undefined
  return { event: trip, part, today: part.day <= (eventDay(content, trip, state.time) ?? 0) }
}

/** Whether he is away on a trip on a day: one he booked is on that day. */
export function awayOnDay(content: ContentPack, state: GameState, dayIndex: number): boolean {
  const booked = tripEvents(content, state).map((event) => event.id)
  // An hour of that day, counted from now: nothing of the agenda's is needed, which would import this back.
  const that = state.time + (dayIndex - toDate(content.calendar, state.time).dayIndex) * content.calendar.hoursPerDay
  return booked.length > 0 && eventsOn(content, state, that).some((event) => booked.includes(event.id))
}

/**
 * Home from a trip: once he is still at its place and nothing of it is left, he is taken home. The same state when he
 * is not; otherwise who went with him, for the drive home.
 */
export function comeHome(content: ContentPack, state: GameState): { state: GameState; companions: string[] } {
  const trip = tripEvents(content, state).find((event) => event.locationId === state.locationId && !unfinished(state, event))
  if (!trip) return { state, companions: [] }
  const home = content.newGame.room?.locationId ?? content.newGame.locationId
  // The drive back takes him to the hour the trip has him home, if that is later.
  const { hour } = toDate(content.calendar, state.time)
  const time = trip.homeAt !== undefined && hour < trip.homeAt ? state.time + trip.homeAt - hour : state.time
  return { state: { ...state, time, locationId: home, inOwnRoom: false }, companions: state.trips[trip.id] ?? [] }
}

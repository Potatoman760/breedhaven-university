import { z } from 'zod'
import type { CalendarEvent, ContentPack, GameState } from '../model'
import { dayIndexOf, formatDate, toDate } from './calendar'

const clock = (hour: number): string => `${String(hour).padStart(2, '0')}:00`

// Generated events may not run longer than this.
const MAX_GENERATED_DURATION_DAYS = 7

/** Authored events from the content pack plus the ones generated in this playthrough. */
export function allEvents(content: ContentPack, state: GameState): CalendarEvent[] {
  return [...content.calendar.events, ...state.events]
}

/** Day indexes on which the event starts, for each of the given years it occurs in. */
function startDays(content: ContentPack, event: CalendarEvent, years: number[]): number[] {
  return (event.year !== undefined ? [event.year] : years).map((year) =>
    dayIndexOf(content.calendar, year, event.month, event.day)
  )
}

/** Events under way at the given time (defaults to now). */
export function eventsOn(content: ContentPack, state: GameState, time = state.time): CalendarEvent[] {
  const { year, dayIndex } = toDate(content.calendar, time)
  // A yearly event that began late last year may still be running.
  return allEvents(content, state).filter((event) =>
    startDays(content, event, [year - 1, year]).some(
      (start) => start <= dayIndex && dayIndex < start + event.durationDays
    )
  )
}

/** Which day of an event it is, counting from 1, or nothing when it is not on. */
export function eventDay(content: ContentPack, event: CalendarEvent, time: number): number | undefined {
  const { year, dayIndex } = toDate(content.calendar, time)
  const start = startDays(content, event, [year - 1, year]).find((day) => day <= dayIndex && dayIndex < day + event.durationDays)
  return start === undefined ? undefined : dayIndex - start + 1
}

/** The hours an event keeps, when it keeps any: "10:00 to 16:00". */
export function eventHours(event: Pick<CalendarEvent, 'startHour' | 'hours'>): string | undefined {
  return event.startHour === undefined ? undefined : `${clock(event.startHour)} to ${clock(event.startHour + (event.hours ?? 1))}`
}

/** Where an event is and when it is on, as a sentence for a prompt: "It is at the Great Court, from 10:00 to 16:00 each day." Nothing for a holiday. */
export function describeEventPlace(content: ContentPack, event: CalendarEvent): string {
  const where = content.locations.find((l) => l.id === event.locationId)?.name
  const when = eventHours(event)
  if (!where && !when) return ''
  return `It is${where ? ` at ${where}` : ' on'}${when ? `, from ${when}${event.durationDays > 1 ? ' each day' : ''}` : ''}.`
}

/** An event as it is told to a character: what it is, then where and when. */
export function describeEvent(content: ContentPack, event: CalendarEvent): string {
  return [event.description, describeEventPlace(content, event)].filter(Boolean).join(' ')
}

// How far ahead someone can say she will be at something.
const ATTEND_WITHIN_DAYS = 14

/** Those who have said they will be at an event. */
export function eventGoers(state: GameState, eventId: string): string[] {
  return state.eventGoers[eventId] ?? []
}

/** Records that these people have said they will be at an event. */
export function addEventGoers(state: GameState, eventId: string, ids: string[]): GameState {
  const going = [...new Set([...eventGoers(state, eventId), ...ids])]
  return going.length === eventGoers(state, eventId).length ? state : { ...state, eventGoers: { ...state.eventGoers, [eventId]: going } }
}

/**
 * The events someone could say she will be at: those somewhere, keeping hours of their own or with something in their
 * program, that are on today or begin within a fortnight.
 */
export function attendableEvents(content: ContentPack, state: GameState): CalendarEvent[] {
  const goable = (event: CalendarEvent) => (event.startHour !== undefined || event.program.length > 0) && content.locations.some((l) => l.id === event.locationId)
  const all = [...eventsOn(content, state).filter((event) => !event.secret), ...upcomingEvents(content, state, ATTEND_WITHIN_DAYS).map(({ event }) => event)]
  // One that is on today and comes round again soon is still one event.
  return all.filter((event, i) => goable(event) && all.findIndex((other) => other.id === event.id) === i)
}

/**
 * The event someone has said she will be at that has something on at this hour, and where: its own hours at its place,
 * or a part of its program today at the part's. An event can be the whole day for how places and people are dressed,
 * and only some hours of it for where she goes. It is where she is, unless something of her own keeps her.
 */
export function eventKeeping(content: ContentPack, state: GameState, loveInterestId: string): { event: CalendarEvent; locationId: string } | undefined {
  const { hour } = toDate(content.calendar, state.time)
  const during = (from: number, hours: number) => hour >= from && hour < from + hours
  for (const event of eventsOn(content, state)) {
    if (!eventGoers(state, event.id).includes(loveInterestId)) continue
    const part = event.program.find((one) => one.day === eventDay(content, event, state.time) && during(one.startHour, one.hours))
    const locationId = part ? (part.locationId ?? event.locationId) : event.startHour !== undefined && during(event.startHour, event.hours ?? 1) ? event.locationId : undefined
    if (locationId !== undefined) return { event, locationId }
  }
  return undefined
}

export interface UpcomingEvent {
  event: CalendarEvent
  /** Days until it starts; at least 1. */
  inDays: number
}

/** Events starting within the next `withinDays` days, soonest first. */
export function upcomingEvents(
  content: ContentPack,
  state: GameState,
  withinDays: number
): UpcomingEvent[] {
  const { year, dayIndex } = toDate(content.calendar, state.time)
  // A story beat is not seen coming.
  return allEvents(content, state)
    .filter((event) => !event.secret)
    .flatMap((event) => {
      const waits = startDays(content, event, [year, year + 1])
        .map((start) => start - dayIndex)
        .filter((inDays) => inDays > 0 && inDays <= withinDays)
      return waits.length > 0 ? [{ event, inDays: Math.min(...waits) }] : []
    })
    .sort((a, b) => a.inDays - b.inDays)
}

export function addEvents(state: GameState, events: CalendarEvent[]): GameState {
  return { ...state, events: [...state.events, ...events] }
}

export function removeEvent(state: GameState, eventId: string): GameState {
  return { ...state, events: state.events.filter((e) => e.id !== eventId) }
}

export interface EventGenerationInput {
  content: ContentPack
  state: GameState
  /** How many events to ask for. */
  count?: number
  /** How far ahead, in days, the new events may start. */
  windowDays?: number
}

/** The prompt asking the LLM to invent upcoming events as a JSON array. */
export function buildEventPrompt(input: EventGenerationInput): { system: string; user: string } {
  const { content, state, count = 3, windowDays = 30 } = input
  const { calendar } = content
  const today = toDate(calendar, state.time)
  const lastDay = Math.min(today.dayIndex + windowDays, calendar.lengthDays - 1)
  const latest = toDate(calendar, (lastDay - today.dayIndex) * calendar.hoursPerDay + state.time)
  const describe = (e: CalendarEvent) =>
    `- ${e.name}: ${e.day} ${calendar.months.find((m) => m.id === e.month)?.name ?? e.month}`

  const system = [
    'You invent calendar events for a dating sim set at a modern university in a magitech fantasy ' +
      'city: festivals, markets, matches, gigs, society nights, visitors, campus and city happenings. ' +
      'Keep them grounded and fit the setting.',
    'Reply with only a JSON array and nothing else. Each element is an object with:',
    '- "name": short event name',
    '- "description": one or two sentences on what happens and why people care',
    '- "month": one of the month ids given',
    '- "day": day of that month, as a number',
    `- "durationDays": how many days it lasts, 1 to ${MAX_GENERATED_DURATION_DAYS}`,
    '- "locationId": one of the location ids given, or null if it is not tied to a place',
    '- "startHour": the hour of the day it opens, 0 to 23, or null for a holiday or anything that is the whole day',
    '- "hours": how many hours it runs from then each day, or null'
  ].join('\n')

  const lore = content.codex.filter((entry) => entry.alwaysInclude && entry.startsUnlocked)
  const user = [
    ...(lore.length > 0 ? ['Setting:', ...lore.map((e) => `- ${e.title}: ${e.content}`), ''] : []),
    'Months, in order:',
    ...calendar.months.map((m) => `- ${m.id} (${m.name}, ${m.days} days)`),
    '',
    'Locations:',
    ...content.locations.map((l) => `- ${l.id} (${l.name})`),
    '',
    'Events that already exist; do not repeat them or share their dates:',
    ...allEvents(content, state).filter((event) => !event.secret).map(describe),
    '',
    `Today is ${formatDate(today)}.`,
    `Invent ${count} new events that start after today and no later than ${formatDate(latest)}.`
  ].join('\n')

  return { system, user }
}

const GeneratedEventSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().default(''),
  month: z.string(),
  day: z.coerce.number().int().min(1),
  durationDays: z.coerce.number().int().min(1).catch(1),
  locationId: z.string().nullish(),
  startHour: z.coerce.number().int().min(0).nullish().catch(undefined),
  hours: z.coerce.number().int().min(1).nullish().catch(undefined)
})

/**
 * Turns the LLM's reply into events. Entries that are malformed, duplicate an existing
 * event's name, or fall on a date that doesn't exist or isn't in the game's future are
 * dropped. Throws only when the reply contains no JSON array at all.
 */
export function parseGeneratedEvents(
  reply: string,
  input: Pick<EventGenerationInput, 'content' | 'state'>
): CalendarEvent[] {
  const { content, state } = input
  const { calendar } = content

  const start = reply.indexOf('[')
  const end = reply.lastIndexOf(']')
  let raw: unknown
  try {
    raw = JSON.parse(reply.slice(start, end + 1))
  } catch {
    raw = undefined
  }
  if (start < 0 || !Array.isArray(raw)) {
    throw new Error('The LLM did not return a list of events. Try again, or raise max reply tokens.')
  }

  const today = toDate(calendar, state.time)
  const takenNames = new Set(allEvents(content, state).map((e) => e.name.toLowerCase()))
  const takenIds = new Set(allEvents(content, state).map((e) => e.id))
  const events: CalendarEvent[] = []

  for (const item of raw) {
    const parsed = GeneratedEventSchema.safeParse(item)
    if (!parsed.success) continue
    const { name, description, day, durationDays, locationId, startHour, hours } = parsed.data
    // Hours that fit in a day, or none.
    const opens = typeof startHour === 'number' && startHour < calendar.hoursPerDay ? startHour : undefined

    const wanted = parsed.data.month.trim().toLowerCase()
    const month = calendar.months.find(
      (m) => m.id.toLowerCase() === wanted || m.name.toLowerCase() === wanted
    )
    if (!month || day > month.days) continue
    if (takenNames.has(name.toLowerCase())) continue

    // The next time that date comes round, which must be before the game ends.
    const year = [today.year, today.year + 1].find(
      (y) => dayIndexOf(calendar, y, month.id, day) > today.dayIndex
    )
    if (year === undefined || dayIndexOf(calendar, year, month.id, day) >= calendar.lengthDays) {
      continue
    }

    let n = 1
    while (takenIds.has(`generated-${n}`)) n++
    const id = `generated-${n}`
    takenIds.add(id)
    takenNames.add(name.toLowerCase())

    events.push({
      id,
      name,
      description,
      month: month.id,
      day,
      year,
      // Something the LLM made up never cancels classes.
      noClasses: false,
      durationDays: Math.min(durationDays, MAX_GENERATED_DURATION_DAYS),
      locationId: content.locations.some((l) => l.id === locationId) ? locationId! : undefined,
      startHour: opens,
      hours: opens === undefined ? undefined : Math.min(hours ?? 2, calendar.hoursPerDay - opens),
      generated: true,
      program: [],
      secret: false
    })
  }
  return events
}

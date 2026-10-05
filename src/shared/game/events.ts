import { z } from 'zod'
import type { CalendarEvent, ContentPack, GameState } from '../model'
import { dayIndexOf, formatDate, toDate } from './calendar'

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
  return allEvents(content, state)
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
    'You invent calendar events for a low-fantasy dating sim: local festivals, markets, ' +
      'weather, visitors, small-town happenings. Keep them grounded and fit the setting.',
    'Reply with only a JSON array and nothing else. Each element is an object with:',
    '- "name": short event name',
    '- "description": one or two sentences on what happens and why people care',
    '- "month": one of the month ids given',
    '- "day": day of that month, as a number',
    `- "durationDays": how many days it lasts, 1 to ${MAX_GENERATED_DURATION_DAYS}`,
    '- "locationId": one of the location ids given, or null if it is not tied to a place'
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
    ...allEvents(content, state).map(describe),
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
  locationId: z.string().nullish()
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
    const { name, description, day, durationDays, locationId } = parsed.data

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
      durationDays: Math.min(durationDays, MAX_GENERATED_DURATION_DAYS),
      locationId: content.locations.some((l) => l.id === locationId) ? locationId! : undefined,
      generated: true
    })
  }
  return events
}

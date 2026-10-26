import { z } from 'zod'
import type { CalendarEvent, ContentPack, GameState, Location } from '../model'
import { dayIndexOf, formatDate, toDate } from './calendar'
import { t } from '../i18n'

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

/**
 * What a place wears on the map today: the dressing of an event that is on and that the place has a view for, as it is
 * dressed for it. Nothing on an ordinary day.
 */
export function mapDressingAt(content: ContentPack, state: GameState, location: Location): string | undefined {
  return eventsOn(content, state).find((event) => event.mapDressing !== undefined && dressedFor(location, event))?.mapDressing
}

/**
 * The outfits events put a woman in, for an outfit of hers to be made for: those a part starts its scene in (a
 * bathrobe at the springs), and one named for an event, worn all that day. Each with where it is worn.
 */
export function eventOutfits(content: ContentPack): { id: string; worn: string[] }[] {
  const found = new Map<string, string[]>()
  const add = (id: string, where: string) => found.set(id, [...(found.get(id) ?? []), where])
  for (const event of content.calendar.events) {
    for (const part of event.program) if (part.outfitId) add(part.outfitId, t('llm.events.outfitPart', { event: event.name, part: part.name }))
    add(event.id, t('llm.events.outfitAll', { event: event.name }))
  }
  return [...found].map(([id, worn]) => ({ id, worn }))
}

/** Whether a place is dressed for an event: it has a view named for it, as the one it shows while the event is on. */
const dressedFor = (location: Location, event: CalendarEvent) =>
  location.backgrounds.some((view) => view.id === event.id || view.name.trim().toLowerCase() === event.name.trim().toLowerCase())

/** The song a place plays as he comes to it today: that of an event that is on and that it is dressed for. */
export function songAt(content: ContentPack, state: GameState, location: Location | undefined): string | undefined {
  return location && eventsOn(content, state).find((event) => event.song !== undefined && dressedFor(location, event))?.song
}

/** Which day of an event it is, counting from 1, or nothing when it is not on. */
export function eventDay(content: ContentPack, event: CalendarEvent, time: number): number | undefined {
  const { year, dayIndex } = toDate(content.calendar, time)
  const start = startDays(content, event, [year - 1, year]).find((day) => day <= dayIndex && dayIndex < day + event.durationDays)
  return start === undefined ? undefined : dayIndex - start + 1
}

/** The hours an event keeps, when it keeps any: "10:00 to 16:00". */
export function eventHours(event: Pick<CalendarEvent, 'startHour' | 'hours'>): string | undefined {
  return event.startHour === undefined ? undefined : t('llm.events.hours', { from: clock(event.startHour), until: clock(event.startHour + (event.hours ?? 1)) })
}

/** Where an event is and when it is on, as a sentence for a prompt: "It is at the Great Court, from 10:00 to 16:00 each day." Nothing for a holiday. */
export function describeEventPlace(content: ContentPack, event: CalendarEvent): string {
  const where = content.locations.find((l) => l.id === event.locationId)?.name
  const when = eventHours(event)
  if (!where && !when) return ''
  const each = event.durationDays > 1
  if (!when) return t('llm.events.at', { where })
  return where ? t('llm.events.atFrom', { where, when, each }) : t('llm.events.onFrom', { when, each })
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
    t('llm.events.systemRole'),
    t('llm.events.systemReply'),
    t('llm.events.fieldName', { field: '"name"' }),
    t('llm.events.fieldDescription', { field: '"description"' }),
    t('llm.events.fieldMonth', { field: '"month"' }),
    t('llm.events.fieldDay', { field: '"day"' }),
    t('llm.events.fieldDuration', { field: '"durationDays"', max: MAX_GENERATED_DURATION_DAYS }),
    t('llm.events.fieldLocation', { field: '"locationId"', null: 'null' }),
    t('llm.events.fieldStartHour', { field: '"startHour"', null: 'null' }),
    t('llm.events.fieldHours', { field: '"hours"', null: 'null' })
  ].join('\n')

  const lore = content.codex.filter((entry) => entry.alwaysInclude && entry.startsUnlocked)
  const user = [
    ...(lore.length > 0 ? [t('llm.events.setting'), ...lore.map((e) => `- ${e.title}: ${e.content}`), ''] : []),
    t('llm.events.months'),
    ...calendar.months.map((m) => t('llm.events.month', { id: m.id, name: m.name, days: m.days })),
    '',
    t('llm.events.locations'),
    ...content.locations.map((l) => `- ${l.id} (${l.name})`),
    '',
    t('llm.events.existing'),
    ...allEvents(content, state).filter((event) => !event.secret).map(describe),
    '',
    t('llm.events.today', { date: formatDate(today) }),
    t('llm.events.invent', { count, latest: formatDate(latest) })
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
    throw new Error(t('llm.events.noList'))
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

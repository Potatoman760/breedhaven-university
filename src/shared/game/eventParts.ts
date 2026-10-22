import type { CalendarEvent, ContentPack, EventPart, GameState, Intro, Scene } from '../model'
import { bondOf } from './bonds'
import { toDate } from './calendar'
import { eventDay, eventGoers, eventsOn } from './events'
import { applyFeelings, timesIntimate } from './memory'
import { sceneBaseline } from './scene'
import { beginMasquerade } from './masquerade'

// The trait of a woman who minds being passed over, whatever there is between them.
const JEALOUS = 'jealous'

/** How a part is known in the save: the event's id and its own. */
export const partKey = (event: Pick<CalendarEvent, 'id'>, part: Pick<EventPart, 'id'>): string => `${event.id}:${part.id}`

export interface EventPartNow {
  event: CalendarEvent
  part: EventPart
}

/** The parts of today's events he has still to go to: those on this day of the event that are not over and he has not been to. */
export function eventPartsToday(content: ContentPack, state: GameState): EventPartNow[] {
  const hour = toDate(content.calendar, state.time).hour
  return eventsOn(content, state).flatMap((event) =>
    event.program
      .filter((part) => part.day === eventDay(content, event, state.time) && hour < part.startHour + part.hours && !state.partsAttended.includes(partKey(event, part)))
      // A trip's parts are only for one who booked it.
      .filter((part) => !part.onTrip || state.trips[event.id] !== undefined)
      .map((part) => ({ event, part }))
  )
}

/** What is next of today's events: the part that comes soonest, of those still to come or under way. The rest wait their turn. */
export function nextEventPart(content: ContentPack, state: GameState): EventPartNow | undefined {
  return [...eventPartsToday(content, state)].sort((a, b) => a.part.startHour - b.part.startHour)[0]
}

/** A part that has to be gone to before anything else can be done today, as orientation has to be. */
export function requiredEventPart(content: ContentPack, state: GameState): EventPartNow | undefined {
  return eventPartsToday(content, state).find(({ part }) => part.required)
}

/** A repeatable number in [0, 1) for one game, one day and one draw. */
function roll(seed: number, day: number, draw: number): number {
  let x = (seed ^ Math.imul(day + 1, 0x9e3779b1) ^ Math.imul(draw + 1, 0x7f4a7c15)) >>> 0
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0
  return ((x ^ (x >>> 16)) >>> 0) / 0x100000000
}

// A part whose company is drawn from those he knows: not one with its own cast, a trip's, a date or a ball.
const drawn = (part: EventPart) => !part.onTrip && !part.castIds && !part.date && !part.masquerade && !part.booking

/**
 * Who is at a part: those it names; else whoever said she would be at the event; else, from the love interests he has
 * met, the closest to him, as many as it takes. On a day with more than one such part, as a festival's, the company is
 * drawn at random instead and shared out through the day: the women he knows in a shuffled order, the same all day, each
 * part in turn taking the next of them, so that nobody is at two. Too few for them all, and the later ones start again.
 */
export function partCast(content: ContentPack, state: GameState, event: CalendarEvent, part: EventPart): string[] {
  const known = (id: string) => content.loveInterests.some((li) => li.id === id)
  if (part.onTrip) return (state.trips[event.id] ?? []).filter(known)
  if (part.castIds) return part.castIds.filter(known)
  const goers = eventGoers(state, event.id).filter(known)
  if (goers.length > 0) return goers.slice(0, part.castSize)
  const met = state.met.filter(known)
  const sameDay = event.program.filter((one) => one.day === part.day && drawn(one)).sort((a, b) => a.startHour - b.startHour || a.id.localeCompare(b.id))
  if (sameDay.length > 1 && met.length > 0) {
    const day = toDate(content.calendar, state.time).dayIndex
    const pool = [...met].sort().map((id, i) => ({ id, at: roll(state.weatherSeed, day, i) })).sort((a, b) => a.at - b.at).map((one) => one.id)
    let next = 0
    for (const one of sameDay) {
      const size = Math.min(one.castSize, pool.length)
      const taken = Array.from({ length: size }, (_, i) => pool[(next + i) % pool.length])
      if (one.id === part.id) return taken
      next += size
    }
  }
  const closeness = (id: string) => state.relationships[id]?.affection ?? 0
  return met.sort((a, b) => closeness(b) - closeness(a)).slice(0, part.castSize)
}

/**
 * Goes to a part of an event: he is taken there, at its hour if he is early, and it lasts as long as it lasts. What
 * comes back is the game after it, the cutscene to read first if it has one, and the scene with its cast, or none
 * when there is nobody to be with.
 */
export function attendEventPart(
  content: ContentPack,
  state: GameState,
  eventId: string,
  partId: string,
  /** For a date: who he takes. */
  dateIds: string[] = []
): { state: GameState; cutscene?: Intro; scene: Scene | null; hurt: string[]; animations: EventPart['animations']; booking?: EventPart['booking'] } {
  const now = eventPartsToday(content, state).find(({ event, part }) => event.id === eventId && part.id === partId)
  if (!now) throw new Error('That part of the event is not on now')
  const { event, part } = now
  if (part.date) {
    const ok = dateIds.length >= 1 && dateIds.length <= part.date.most && dateIds.every((id) => dateChoices(content, state).some((li) => li.id === id))
    if (!ok) throw new Error(`Take one to ${part.date.most} of the women you know`)
  }
  const begins = state.time + Math.max(0, part.startHour - toDate(content.calendar, state.time).hour)
  const locationId = part.locationId ?? event.locationId ?? state.locationId
  const place = content.locations.find((l) => l.id === locationId)
  // A masked ball is its dances, one after another through its hours: it begins as he arrives.
  if (part.masquerade) {
    const ball = beginMasquerade(content, { ...state, time: begins, locationId, inOwnRoom: false, partsAttended: [...state.partsAttended, partKey(event, part)] }, event, part)
    return { hurt: [], animations: part.animations, state: ball.state, cutscene: part.cutscene, scene: ball.scene }
  }
  const went: GameState = { ...state, time: begins + part.hours, locationId, inOwnRoom: false, partsAttended: [...state.partsAttended, partKey(event, part)] }
  // A date is settled as he sets out: those he takes are glad of it, and those with a claim on him he leaves out are not.
  const hurt = part.date ? passedOver(content, state, dateIds) : []
  const after = part.date ? dateFeelings(content, went, dateIds, hurt, part.date) : went
  const [leadId, ...companionIds] = part.date ? dateIds : partCast(content, state, event, part)
  return {
    hurt,
    animations: part.animations,
    booking: part.booking,
    state: after,
    cutscene: part.cutscene,
    scene: leadId
      ? {
          loveInterestId: leadId,
          companionIds,
          nsfw: false,
          beats: [{ activityName: `${event.name}: ${part.name}`, locationName: place?.name, description: part.description || undefined, direction: part.direction || undefined }],
          viewId: part.viewId,
          // What they start in, where the part says: the lead's own, and each of the others'.
          ...(part.outfitId && { outfitId: part.outfitId, looks: Object.fromEntries(companionIds.map((id) => [id, { outfitId: part.outfitId }])) }),
          messages: [],
          gifts: [],
          conceived: [],
          departed: [],
          npc: false,
          baseline: sceneBaseline(after, leadId, companionIds)
        }
      : null
  }
}

/** Who he can take on a date: any love interest he has met. */
export function dateChoices(content: ContentPack, state: GameState) {
  return content.loveInterests.filter((li) => state.met.includes(li.id) && state.relationships[li.id] !== undefined)
}

/** The women with a claim on him he did not take: those he is with, those he has slept with, and the jealous. */
export function passedOver(content: ContentPack, state: GameState, takenIds: string[]): string[] {
  return dateChoices(content, state)
    .filter((li) => !takenIds.includes(li.id) && (bondOf(state, li.id) !== undefined || timesIntimate(state, li.id) > 0 || li.traitIds.includes(JEALOUS)))
    .map((li) => li.id)
}

function dateFeelings(content: ContentPack, state: GameState, takenIds: string[], hurtIds: string[], date: NonNullable<EventPart['date']>): GameState {
  const taken = takenIds.reduce(
    (next, id) => applyFeelings(content, next, id, { affection: date.gain, trust: date.gain, desire: date.gain, reason: 'He took her on a date.' }, true),
    state
  )
  return hurtIds.reduce(
    (next, id) => applyFeelings(content, next, id, { affection: -date.loss, trust: -date.loss, desire: -date.loss, reason: 'He took someone else on a date.' }, true),
    taken
  )
}

/** Where a date was let go by: its day's end has come without his going. Kept in the save so it is reckoned once. */
const missedKey = (event: Pick<CalendarEvent, 'id'>, part: Pick<EventPart, 'id'>) => `date-missed:${partKey(event, part)}`

/**
 * A date he never went on: once the hour for it is past, every woman with a claim on him is hurt that he took nobody.
 * Looked at today and yesterday, so a night slept through is still reckoned. The same state when there is nothing to do.
 */
export function settleMissedDates(content: ContentPack, state: GameState): { state: GameState; hurt: string[]; eventName?: string } {
  const perDay = content.calendar.hoursPerDay
  for (const back of [0, perDay]) {
    const time = state.time - back
    for (const event of eventsOn(content, state, time)) {
      const day = eventDay(content, event, time)
      for (const part of event.program) {
        if (!part.date || part.day !== day || state.partsAttended.includes(partKey(event, part)) || state.flags[missedKey(event, part)]) continue
        const ends = time - toDate(content.calendar, time).hour + part.startHour + part.hours
        if (state.time < ends) continue
        const hurt = passedOver(content, state, [])
        const marked: GameState = { ...state, flags: { ...state.flags, [missedKey(event, part)]: true } }
        return { state: dateFeelings(content, marked, [], hurt, part.date), hurt, eventName: event.name }
      }
    }
  }
  return { state, hurt: [] }
}

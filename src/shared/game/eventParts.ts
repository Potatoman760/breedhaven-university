import type { CalendarEvent, ContentPack, EventPart, GameState, Intro, Scene } from '../model'
import { toDate } from './calendar'
import { eventDay, eventGoers, eventsOn } from './events'
import { sceneBaseline } from './scene'

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
      .map((part) => ({ event, part }))
  )
}

/** A part that has to be gone to before anything else can be done today, as orientation has to be. */
export function requiredEventPart(content: ContentPack, state: GameState): EventPartNow | undefined {
  return eventPartsToday(content, state).find(({ part }) => part.required)
}

/**
 * Who is at a part: those it names; else whoever said she would be at the event; else the love interests he has met and is
 * closest to, as many as it takes.
 */
export function partCast(content: ContentPack, state: GameState, event: CalendarEvent, part: EventPart): string[] {
  const known = (id: string) => content.loveInterests.some((li) => li.id === id)
  if (part.castIds) return part.castIds.filter(known)
  const goers = eventGoers(state, event.id).filter(known)
  if (goers.length > 0) return goers.slice(0, part.castSize)
  const closeness = (id: string) => state.relationships[id]?.affection ?? 0
  return state.met
    .filter(known)
    .sort((a, b) => closeness(b) - closeness(a))
    .slice(0, part.castSize)
}

/**
 * Goes to a part of an event: he is taken there, at its hour if he is early, and it lasts as long as it lasts. What
 * comes back is the game after it, the cutscene to read first if it has one, and the scene with its cast, or none
 * when there is nobody to be with.
 */
export function attendEventPart(content: ContentPack, state: GameState, eventId: string, partId: string): { state: GameState; cutscene?: Intro; scene: Scene | null } {
  const now = eventPartsToday(content, state).find(({ event, part }) => event.id === eventId && part.id === partId)
  if (!now) throw new Error('That part of the event is not on now')
  const { event, part } = now
  const begins = state.time + Math.max(0, part.startHour - toDate(content.calendar, state.time).hour)
  const locationId = part.locationId ?? event.locationId ?? state.locationId
  const place = content.locations.find((l) => l.id === locationId)
  const after: GameState = { ...state, time: begins + part.hours, locationId, inOwnRoom: false, partsAttended: [...state.partsAttended, partKey(event, part)] }
  const [leadId, ...companionIds] = partCast(content, state, event, part)
  return {
    state: after,
    cutscene: part.cutscene,
    scene: leadId
      ? {
          loveInterestId: leadId,
          companionIds,
          nsfw: false,
          beats: [{ activityName: `${event.name}: ${part.name}`, locationName: place?.name, description: part.description || undefined, direction: part.direction || undefined }],
          viewId: part.viewId,
          messages: [],
          gifts: [],
          conceived: [],
          departed: [],
          npc: false,
          baseline: sceneBaseline(state, leadId, companionIds)
        }
      : null
  }
}

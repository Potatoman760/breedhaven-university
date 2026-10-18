import type { Appointment, ContentPack, GameState, Intro } from '../model'
import { describeWhen, keepAppointment } from './appointments'
import { slotOn } from './births'
import { isGameOver, toDate } from './calendar'
import { addNote, giveContact } from './courier'
import { belowOpen } from './expedition'
import { meet } from './scene'

/**
 * Being shown the way down. The Undercroft is not his to enter the day it opens: whoever knows of it sets an hour to
 * meet him where the stair is, he has to be there, and it is in that scene that he learns what is below and why it
 * has to be him. It is put where his day is free, and put down again, as often as it takes, when he does not come.
 */

const DESCENT_ID = 'undercroft-descent'
// She does not ask him there at dawn, or so late that the place is shutting.
const EARLIEST_HOUR = 9
const LATEST_END = 21
// How far ahead a free hour is looked for before a day he would have to give something up for is taken.
const LOOK_AHEAD_DAYS = 10

/** The hour set for him to be shown the way down, while there is one. */
export function descentAppointment(state: Pick<GameState, 'appointments'>): Appointment | undefined {
  return state.appointments.find((plan) => plan.kind === 'below')
}

/**
 * Sets the hour he is shown the way down, once it is open and he has not been: the first stretch from tomorrow on
 * that is free of everything else of his, and failing that the one that costs him least. One that went by without
 * him is taken off and another set in its place. Whoever is showing him writes to say when. With nobody to show him,
 * the way down is simply his. Returns the same state when there is nothing to do.
 */
export function scheduleDescent(content: ContentPack, state: GameState): GameState {
  const config = content.expedition
  if (!config || state.expedition.invited || !belowOpen(content, state)) return state
  if (!config.guideId || !config.intro) return { ...state, expedition: { ...state.expedition, invited: true } }
  const set = descentAppointment(state)
  const missed = set !== undefined && set.time + set.hours <= state.time
  if (set && !missed) return state
  const { hours } = config.intro
  const today = toDate(content.calendar, state.time).dayIndex
  const cleared: GameState = missed ? { ...state, appointments: state.appointments.filter((plan) => plan !== set) } : state
  let best: { time: number; cost: number } | undefined
  for (let day = today + 1; day <= today + LOOK_AHEAD_DAYS; day++) {
    const slot = slotOn(content, cleared, day, hours, config.entryLocationId, EARLIEST_HOUR, LATEST_END)
    if (slot && (!best || slot.cost < best.cost)) best = slot
    if (best?.cost === 0) break
  }
  if (!best || isGameOver(content.calendar, best.time)) return cleared
  const place = content.locations.find((l) => l.id === config.entryLocationId)?.name ?? config.entryLocationId
  const plan: Appointment = { id: DESCENT_ID, kind: 'below', loveInterestId: config.guideId, companionIds: [], title: `Something under ${place}`, time: best.time, hours, locationId: config.entryLocationId }
  const text = (missed ? config.intro.missedText : config.intro.text).replaceAll('{date}', describeWhen(content, best.time)).replaceAll('{place}', place)
  return addNote(giveContact({ ...cleared, appointments: [...cleared.appointments, plan].sort((a, b) => a.time - b.time) }, config.guideId), config.guideId, { from: 'them', text, read: false })
}

/**
 * He is there for it. The scene is the two of them at the head of the stair: she tells him what is below, why it
 * will only answer to him, and what he will need. The way down is his from this hour.
 */
export function attendDescent(content: ContentPack, state: GameState, appointmentId: string): { state: GameState; cutscene: Intro } {
  const config = content.expedition
  if (!config?.guideId || !config.intro) throw new Error('There is nobody to show him the way down.')
  const { state: kept } = keepAppointment(content, state, appointmentId)
  // Shown it, he knows the way down. The hour she keeps him went by in keeping the appointment.
  const shown: GameState = {
    ...meet(content, kept, [config.guideId]),
    locationId: config.entryLocationId,
    inOwnRoom: false,
    expedition: { ...kept.expedition, invited: true }
  }
  return { state: shown, cutscene: config.intro.cutscene }
}

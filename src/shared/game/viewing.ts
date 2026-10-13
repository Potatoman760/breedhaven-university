import type { Appointment, ContentPack, GameState, Scene } from '../model'
import { describeWhen, keepAppointment } from './appointments'
import { slotOn } from './births'
import { isGameOver, toDate } from './calendar'
import { addNote, giveContact } from './courier'
import { fillHousingText, moveIn } from './housing'
import { sceneBaseline } from './scene'

/**
 * Being shown the house. Saying yes to the Office does not put the keys in his hand: the housing officer sets an hour
 * to walk him round it, he has to be there, and the house is his when she has. It is put where his day is free, and
 * put down again, as often as it takes, when he does not come.
 */

const VIEWING_ID = 'house-viewing'
// Office hours: she does not show a house at dawn or after dark.
const EARLIEST_HOUR = 9
const LATEST_END = 19
// How far ahead a free hour is looked for before a day he would have to give something up for is taken.
const LOOK_AHEAD_DAYS = 10

/** The hour set for him to be shown the house, while there is one. */
export function viewingAppointment(state: Pick<GameState, 'appointments'>): Appointment | undefined {
  return state.appointments.find((plan) => plan.kind === 'viewing')
}

/**
 * Sets the hour of the viewing once he has said yes and none is set: the first stretch from tomorrow on that is free
 * of everything else of his, and failing that the one that costs him least. One that went by without him is taken
 * off and another set in its place. The officer writes to say when. Returns the same state when there is nothing to do.
 */
export function scheduleViewing(content: ContentPack, state: GameState): GameState {
  const config = content.housing
  if (!config?.viewing || state.housing.status !== 'accepted') return state
  const set = viewingAppointment(state)
  const missed = set !== undefined && set.time + set.hours <= state.time
  if (set && !missed) return state
  const { meetLocationId, hours } = config.viewing
  const today = toDate(content.calendar, state.time).dayIndex
  const cleared: GameState = missed ? { ...state, appointments: state.appointments.filter((plan) => plan !== set) } : state
  let best: { time: number; cost: number } | undefined
  for (let day = today + 1; day <= today + LOOK_AHEAD_DAYS; day++) {
    const slot = slotOn(content, cleared, day, hours, meetLocationId, EARLIEST_HOUR, LATEST_END)
    if (slot && (!best || slot.cost < best.cost)) best = slot
    if (best?.cost === 0) break
  }
  if (!best || isGameOver(content.calendar, best.time)) return cleared
  const plan: Appointment = { id: VIEWING_ID, kind: 'viewing', loveInterestId: config.officerId, companionIds: [], title: `Viewing of ${config.name}`, time: best.time, hours, locationId: meetLocationId }
  const place = content.locations.find((l) => l.id === meetLocationId)?.name ?? meetLocationId
  const text = fillHousingText(config, missed ? config.viewing.missedText : config.viewing.text, { date: describeWhen(content, best.time), place })
  return addNote(giveContact({ ...cleared, appointments: [...cleared.appointments, plan].sort((a, b) => a.time - b.time) }, config.officerId), config.officerId, { from: 'them', text, read: false })
}

/**
 * He is there for it. He meets the officer where she said, and the scene is the two of them at the house itself: she
 * has walked him through it and hands him over to the nanny, who lives there. The house is his from this hour.
 */
export function attendViewing(content: ContentPack, state: GameState, appointmentId: string): { state: GameState; scene: Scene } {
  const config = content.housing
  if (!config) throw new Error('There is no house to be shown.')
  const { state: kept } = keepAppointment(content, state, appointmentId)
  const officer = content.npcs.find((npc) => npc.id === config.officerId)?.name ?? 'The housing officer'
  const player = state.player.name
  // He is at the house when the scene opens, and it is his: what the pack makes of that is the caller's to read afresh.
  const moved = { ...moveIn(content, kept), locationId: config.locationId, inOwnRoom: false }
  return {
    state: moved,
    scene: {
      loveInterestId: config.nannyId,
      companionIds: [],
      npc: false,
      nsfw: false,
      guideId: config.officerId,
      beats: [
        {
          activityName: `Being shown ${config.name}`,
          locationName: config.name,
          description: `${officer} has walked you through ${config.name} room by room, keys in hand, and brings you back to the hearth room, where the nanny is waiting to meet you.`,
          direction:
            `This is the hour ${player} is given ${config.name}. ${officer}, the housing officer of the Sire Relations Office, has just shown him round it: which rooms are furnished, which stand bare for him to build, ` +
            `where the wards are, and the terms of the rent. She now introduces you, the nanny who lives in the house, and hands him the keys. You are meeting ${player} for the first time, in what is now his home and yours. ` +
            `${officer} is here and speaks for herself, exact and brief, and leaves once the introduction is made and his questions are answered. Stay in the house: do not move the scene anywhere.`
        }
      ],
      messages: [],
      gifts: [],
      conceived: [],
      departed: [],
      baseline: sceneBaseline(moved, config.nannyId, [])
    }
  }
}

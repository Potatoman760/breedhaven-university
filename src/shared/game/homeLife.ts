import type { ContentPack, GameState, HouseRoom, LoveInterest, Scene } from '../model'
import { toDate } from './calendar'
import { babiesAtHome, builtTier, goToRoom, householdIds, isResident, roomOf } from './housing'
import { inClass, locationOf } from './map'
import { sceneBaseline } from './scene'
import { seedOf } from './seed'
import { t } from '../i18n'

/**
 * Where in the house each of the household is, hour by hour, so that walking through it he finds them in it: asleep
 * in their own rooms at night, and by day about the house, the nanny and a mother where the children are. It is
 * worked out from the hour and the game's seed, so the same hour finds the same people in the same rooms.
 */

// From this hour of the evening, and until this hour of the morning, everyone is in her own room.
const TO_BED_HOUR = 22
const UP_HOUR = 7

/** A number from 0 up to 1 that is the same for the same woman in the same part of the same day. */
function chance(seed: number, index: number, dayIndex: number, part: number): number {
  let x = (seed ^ Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(dayIndex + 1, 0x85ebca6b) ^ Math.imul(part + 1, 0xc2b2ae35)) >>> 0
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) >>> 0
  x = Math.imul(x ^ (x >>> 12), 0x297a2d39) >>> 0
  return ((x ^ (x >>> 15)) >>> 0) / 4294967296
}

/** The room he is looking at while he is at home: the one he has gone to, or the one the house opens on. */
export function roomHeIsIn(content: ContentPack, state: Pick<GameState, 'housing' | 'locationId'>): HouseRoom | undefined {
  const config = content.housing
  if (!config || !isResident(content, state) || state.locationId !== config.locationId) return undefined
  return roomOf(config, state.housing.room) ?? config.rooms.find((room) => room.viewId === 'default') ?? config.rooms.find((room) => room.role === 'common' && room.startsBuilt)
}

/**
 * The room of the house one of the household is in now. Nothing for someone who does not live there, or is out, or
 * is in class.
 */
export function whereAtHome(content: ContentPack, state: GameState, loveInterestId: string): string | undefined {
  const config = content.housing
  const li = content.loveInterests.find((one) => one.id === loveInterestId)
  if (!config || !li || !householdIds(config, state).includes(li.id)) return undefined
  if (locationOf(content, state, li) !== config.locationId || inClass(content, state, li)) return undefined

  const own = li.id === config.nannyId ? config.rooms.find((room) => room.role === 'nanny')?.key : state.housing.residents[li.id]
  const date = toDate(content.calendar, state.time)
  if (date.hour >= TO_BED_HOUR || date.hour < UP_HOUR) return own

  // By day she is somewhere about the house: one of the rooms everyone uses that have been built, and out of doors only in daylight.
  const about = config.rooms.filter((room) => room.role === 'common' && builtTier(state, room.key) > 0 && (date.period.light === 'day' || !room.plan.outdoors))
  const nursery = about.find((room) => room.cots > 0)
  const index = seedOf(li.id)
  const part = content.calendar.periods.findIndex((period) => period.id === date.period.id)
  const roll = chance(state.weatherSeed, index, date.dayIndex, part)
  // Whoever minds a child that lives here is with it more often than not: the nanny whenever there is one, a mother of one about half her day.
  const children = babiesAtHome(state)
  if (nursery && children.length > 0 && (li.id === config.nannyId ? roll < 0.7 : children.some((child) => child.motherId === li.id) && roll < 0.5)) return nursery.key
  // A part of the day in her own room now and then, and otherwise wherever the day has taken her.
  if (own && roll > 0.85) return own
  return about.length > 0 ? about[Math.floor(roll * about.length) % about.length].key : own
}

/** Who of the household is in a room of the house now, in the order the content lists them. */
export function inRoom(content: ContentPack, state: GameState, roomKey: string): LoveInterest[] {
  return content.loveInterests.filter((li) => whereAtHome(content, state, li.id) === roomKey)
}

/**
 * The hour after she has said yes to living with him: he is with her in the room she has just moved into, and she is
 * told what has happened, and that she is glad of it. Nothing else moves the scene: it is any other at home.
 */
export function movingInScene(content: ContentPack, state: GameState, loveInterestId: string, roomKey: string): { state: GameState; scene: Scene } | undefined {
  const config = content.housing
  const room = config && roomOf(config, roomKey)
  const li = content.loveInterests.find((one) => one.id === loveInterestId)
  if (!config || !room || !li || state.housing.residents[loveInterestId] !== roomKey) return undefined
  const there = goToRoom(content, state, roomKey)
  const first = li.name.split(' ')[0]
  const player = state.player.name
  return {
    state: there,
    scene: {
      loveInterestId,
      companionIds: [],
      npc: false,
      nsfw: false,
      viewId: room.viewId,
      beats: [
        {
          activityName: t('game.homeLife.movingIn', { house: config.name }),
          locationName: t('game.homeLife.place', { house: config.name, room: room.name.toLowerCase() }),
          description: t('game.homeLife.movedIn', { first, room: room.name.toLowerCase() }),
          direction: t('game.homeLife.direction', { first, player, house: config.name, room: room.name.toLowerCase() })
        }
      ],
      messages: [],
      gifts: [],
      conceived: [],
      departed: [],
      baseline: sceneBaseline(there, loveInterestId, [])
    }
  }
}


import { type Background, type ContentPack, type GameState, type Location, type LoveInterest, type Room, type Scene, type WeatherType } from '../model'
import { isGameOver, toDate } from './calendar'
import { sceneCast } from './scene'
import { eventsOn } from './events'
import { backgroundFor, isIndoors, isOpen } from './schedule'

// The most a single reply can carry the story forward. More than this is a new day's business.
const MAX_HOURS_PER_REPLY = 12
// How a love interest's own room is named among the places a scene can go.
const ROOM_PREFIX = 'room-of-'
// And a room of his house.
const HOUSE_PREFIX = 'home-'
/** Whose room a scene is in when it is in the player's own: no love interest has this id. */
export const PLAYER_ROOM = 'player'

/** Somewhere a scene can move to: a location, or the room of one of the love interests in it. */
export interface Destination {
  /** What the LLM names it by: a location's id, or `room-of-<love interest id>`. */
  id: string
  name: string
  locationId: string
  indoors: boolean
  /** Set when it is someone's own room: whose. */
  roomOf?: string
  /** Set when it is a room of his house: which, by its key. */
  houseRoom?: string
}

/** The love interest whose room the scene is in, if it is in one. */
export function roomOwner(content: ContentPack, scene: Pick<Scene, 'roomOf'>): LoveInterest | undefined {
  return scene.roomOf === undefined ? undefined : content.loveInterests.find((li) => li.id === scene.roomOf && li.room)
}

/** The player's own room, if the scene is in it. */
export function playerRoom(content: ContentPack, scene: Pick<Scene, 'roomOf'>): Room | undefined {
  return scene.roomOf === PLAYER_ROOM ? content.newGame.room : undefined
}

/**
 * Where a scene can go from here, right now: the rooms of the love interests in it, then
 * every other place, leaving out wherever it already is and anywhere that will be shut on
 * arrival. These are all the LLM is offered and all the game will act on.
 */
export function sceneDestinations(
  content: ContentPack,
  state: GameState,
  scene: Pick<Scene, 'loveInterestId' | 'companionIds' | 'roomOf' | 'npc'>
): Destination[] {
  if (scene.npc) return []
  const open = (location: Location) => isOpen(location, toDate(content.calendar, state.time).hour)
  // Without a map there is no walking anywhere, though a room in this building can still be gone up to.
  const reachable = (locationId: string) => locationId === state.locationId || content.map !== undefined

  const rooms = sceneCast(scene).flatMap((id): Destination[] => {
    const li = content.loveInterests.find((c) => c.id === id)
    const location = li?.room && content.locations.find((l) => l.id === li.room?.locationId)
    if (!li?.room || !location || scene.roomOf === id || !reachable(location.id) || !open(location)) return []
    return [
      {
        id: `${ROOM_PREFIX}${id}`,
        name: `${li.name.split(' ')[0]}'s own room: ${li.room.name}, at ${location.name}`,
        locationId: location.id,
        indoors: true,
        roomOf: id
      }
    ]
  })
  // His own room, when he has one, is somewhere he can take anyone.
  const own = content.newGame.room
  const ownPlace = own && content.locations.find((l) => l.id === own.locationId)
  if (own && ownPlace && scene.roomOf !== PLAYER_ROOM && reachable(ownPlace.id) && open(ownPlace)) {
    rooms.push({
      id: `${ROOM_PREFIX}${PLAYER_ROOM}`,
      name: `${state.player.name}'s own room: ${own.name}, at ${ownPlace.name}`,
      locationId: ownPlace.id,
      indoors: true,
      roomOf: PLAYER_ROOM
    })
  }
  // At home, the rooms of the house that are built and are anyone's to sit in can be gone through to.
  const config = content.housing
  if (config && state.housing.status === 'resident' && state.locationId === config.locationId) {
    for (const room of config.rooms) {
      if (room.role !== 'common' || (state.housing.rooms[room.key] ?? 0) < 1) continue
      // The room he is in already, or the one a scene at the house's door is in, is not somewhere to go.
      if (scene.roomOf === undefined && (state.housing.room ?? config.rooms.find((r) => r.viewId === 'default')?.key) === room.key) continue
      rooms.push({ id: `${HOUSE_PREFIX}${room.key}`, name: `${room.name.toLowerCase()} of ${config.name}`, locationId: config.locationId, indoors: !room.plan.outdoors, houseRoom: room.key })
    }
  }
  const places = content.locations
    // The place a room is in can be gone back down to from the room.
    .filter((l) => (l.id !== state.locationId || scene.roomOf !== undefined) && reachable(l.id) && open(l))
    .map(
      (l): Destination => ({
        id: l.id,
        name: l.name,
        locationId: l.id,
        indoors: isIndoors(l, backgroundFor(l))
      })
    )
  return [...rooms, ...places]
}

/** The destination the LLM named, if it is one the scene can go to: by id, however it was cased. */
export function findDestination(destinations: Destination[], asked: string): Destination | undefined {
  const wanted = asked.trim().toLowerCase()
  return destinations.find((d) => d.id.toLowerCase() === wanted)
}

/** The state after a scene has moved: the player is there with everyone in it. Going there takes no time. */
export function moveState(state: GameState, destination: Destination): GameState {
  // In his house, he is in the room he went to; anywhere else, or at its door, in none.
  return { ...state, locationId: destination.locationId, inOwnRoom: destination.roomOf === PLAYER_ROOM, housing: { ...state.housing, room: destination.houseRoom } }
}

/**
 * The scene after it has moved. What was being done where it was is over and marked so;
 * arriving is the new beat; and it is, or is no longer, in someone's room.
 */
export function movedScene<S extends Pick<Scene, 'beats' | 'roomOf' | 'backgroundId' | 'viewId' | 'picture'>>(scene: S, destination: Destination): S {
  return {
    ...scene,
    beats: [
      ...scene.beats.map((beat) => ({ ...beat, finished: true })),
      {
        activityName: 'arrived',
        locationName: destination.roomOf ? destination.name.replace(/^(.*?'s) own room: /, '$1 room, ') : destination.name
      }
    ],
    roomOf: destination.roomOf,
    // A view picked for the old place means nothing in the new one, and neither does one it insisted on or a picture it was set in.
    backgroundId: undefined,
    viewId: undefined,
    picture: undefined
  }
}

/**
 * How many hours a scene has taken so far: the time its opening activity set aside, plus
 * every walk and every hour added since.
 */
export function sceneHours(state: GameState, scene: Pick<Scene, 'baseline'>): number {
  return Math.max(0, state.time - scene.baseline.time)
}

/**
 * The time to show while a scene is under way. The clock itself is kept in whole hours and already stands at the hour
 * the scene's time runs out, so what is shown is the middle of the scene: half-way between when it began and that
 * hour, the same for as long as the scene lasts. A class from 14:00 to 15:00 is shown as 14:30. It is for showing
 * only: nothing is reckoned by it. A scene that has taken no time is shown at the hour it is.
 */
export function sceneClock(state: GameState, scene: Pick<Scene, 'baseline'>): { time: number; minute: number } {
  const middle = (Math.min(scene.baseline.time, state.time) + state.time) / 2
  return { time: Math.floor(middle), minute: Number.isInteger(middle) ? 0 : 30 }
}

/** The most hours one call can add. */
export const MAX_SCENE_HOURS = MAX_HOURS_PER_REPLY

/** Lets time pass within a scene: a whole number of hours, within reason, and not past the end of the game. */
export function passSceneTime(content: ContentPack, state: GameState, hours: number): GameState {
  const whole = Math.min(MAX_HOURS_PER_REPLY, Math.floor(hours))
  if (!Number.isFinite(whole) || whole < 1 || isGameOver(content.calendar, state.time)) return state
  return { ...state, time: state.time + whole }
}

/** The view of the place a scene is in: the one the player picked, else the one that suits the hour. */
export function sceneView(content: ContentPack, state: GameState, backgroundId?: string): Background | undefined {
  const location = content.locations.find((l) => l.id === state.locationId)
  return viewFor(content, state, location, backgroundId)
}

/**
 * The view of a place as the day has it: the one asked for, else one named for an event or
 * holiday going on today, else its default. This is how a place is dressed for an occasion:
 * give it a view with the occasion's name.
 */
export function viewFor(content: ContentPack, state: GameState, location: Location | undefined, chosenId?: string): Background | undefined {
  return location && backgroundFor(location, chosenId, eventsOn(content, state).map((event) => event.name))
}

/** Told to a character: exactly where they are, and whether there is a roof over them. */
export function describePlace(location: Location, view: Background | undefined): string {
  const spot = view && view.name.toLowerCase() !== location.name.toLowerCase() ? `, ${view.name.toLowerCase()}` : ''
  const shelter = isIndoors(location, view) ? 'You are indoors, under a roof.' : 'You are out of doors, under the open sky.'
  return `${location.name}${spot}. ${shelter} ${location.description} ${view?.description ?? ''}`.trim()
}

/**
 * How a room is put on the stage: by its own picture, or when it is a view of the place it is in, by that view, which
 * has a picture for the day and one for the night. Nothing for no room.
 */
export function roomBackdrop(room: Room | undefined, key: string): { room?: { image: string | undefined; key: string }; viewId?: string } {
  if (!room) return {}
  return room.viewId !== undefined ? { viewId: room.viewId } : { room: { image: room.background, key } }
}

/** Told to the characters in a scene that is in the player's own room. */
export function describePlayerRoom(room: Room, location: Location | undefined, playerName: string): string {
  return `${playerName}'s own room: ${room.name}${location ? `, at ${location.name}` : ''}. You are indoors, in private, with the door shut. ${room.description}`.trim()
}

/** Told to the characters in a scene that is in one of their own rooms. */
export function describeRoom(owner: LoveInterest, location: Location | undefined, speakerId: string): string {
  const room = owner.room
  const whose = owner.id === speakerId ? 'your own room' : `${owner.name.split(' ')[0]}'s own room`
  return `${whose}: ${room?.name ?? 'her room'}${location ? `, at ${location.name}` : ''}. You are indoors, in private, with the door shut. ${room?.description ?? ''}`.trim()
}

/** Told to a character: the weather, and how it reaches them where they are. */
export function describeWeather(weather: WeatherType, indoors: boolean): string {
  const what = `${weather.name}. ${weather.description}`.trim()
  return indoors
    ? `The weather outside today: ${what} You are indoors and out of it: you may hear it, see it at a window, or have come in from it, but it does not fall on you.`
    : `The weather today: ${what} You are out in it: it is on your skin and clothes, and shapes what you do and say.`
}

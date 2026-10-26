import { z } from 'zod'
import { MAX_SCENE_CAST, STATS, StatSchema, trainsAt, type CalendarEvent, type ContentPack, type Drill, type Location, type GameState, type Effect, type Scene, type Stat } from '../model'
import { formatTime, isGameOver, toDate } from './calendar'
import { applyEffects } from './conditions'
import { eventGoers, eventsOn } from './events'
import { courseMembers, meetingNow } from './courses'
import { locationOf, approachableAt, inClass } from './map'
import { shiftKey } from './jobs'
import { timeOn } from './agenda'
import { addCoursePoints, studyPoints } from './grades'
import { firstNames, hasMet, sceneBaseline } from './scene'
import { PLAYER_ROOM } from './sceneMoves'
import { isOpen, isOpenFor } from './schedule'
import { factor } from './modifiers'
import { seedOf } from './seed'
import { t } from '../i18n'

// The hour he wakes: from midnight until then is for sleep (`SLEEP_HOURS` in sleep.ts).
const SLEEP_UNTIL = 6
// What the player may ask for, when they don't say.
const DEFAULT_HOURS = 2
const MAX_HOURS = 4
// A night's sleep is longer than anything else the player might do.
const MAX_REST_HOURS = 8
// The longest he can make a session of study or a drill: a working day's worth, if he has the energy.
const MAX_SESSION_HOURS = 8
// An event can be stayed at for as long as it runs, which may be most of a day.
const MAX_EVENT_HOURS = 16
// What an hour of working on yourself gives and costs, and what an hour of rest restores.
const STAT_PER_HOUR = 1
const ENERGY_PER_HOUR = 8
const REST_PER_HOUR = 15
// Words that give away what an activity works on, for when no LLM is there to judge.
const STAT_WORDS: Record<Stat | 'rest', RegExp> = {
  rest: /\b(sleep|rest|nap|bed|lie down|doze)\b/,
  strength: /\b(lift|weights?|wrestl\w*|spar\w*|strength|chop\w*|haul\w*)\b/,
  dexterity: /\b(archery|fenc\w*|juggl\w*|climb\w*|danc\w*|lockpick\w*|dexterity|cards)\b/,
  endurance: /\b(run|running|jog\w*|swim\w*|laps|hike|hiking|endurance|train\w*|exercise)\b/,
  intelligence: /\b(study|studying|read|reading|revis\w*|homework|research|intelligence)\b/,
  charisma: /\b(mingl\w*|socialis\w*|socializ\w*|perform\w*|sing\w*|recit\w*|charm\w*|charisma|speech)\b/,
  wisdom: /\b(pray\w*|meditat\w*|reflect\w*|contemplat\w*|garden\w*|wisdom)\b/
}
// Words for going to see someone and no more than that: an hour of it.
const TALK_WORDS = /\b(talk|chat|speak|see|visit|find|catch up|say hi|say hello|check on|drop in)\b/
// Waiting for people to be free only looks this far ahead; beyond it, a plan is the thing.
const MAX_WAIT_DAYS = 1
const TITLE_CHARS = 60
// The most love interests he runs into when he goes somewhere alone to work on himself.
const MAX_RUN_INTO = 2

/** Something the player made up to do: what, where, how long, and with whom. */
export const OutingSchema = z.object({
  /** A few words: "Dinner", "A walk by the river". */
  title: z.string(),
  /** A line of narration that opens the scene. */
  description: z.string().default(''),
  /** The love interests invited, the first of whom leads the scene. Empty when the player goes alone. */
  withIds: z.array(z.string()).max(MAX_SCENE_CAST).default([]),
  locationId: z.string(),
  hours: z.number().int().min(1).max(MAX_EVENT_HOURS).default(DEFAULT_HOURS),
  /** What it does for the player: raises a stat, restores energy, or neither. */
  trains: z.union([StatSchema, z.literal('rest')]).optional(),
  /**
   * Nobody is invited, but whoever is at the place when he gets there is part of it: love
   * interests who happen to be there, or failing them someone who works there. Something he
   * goes to do on his own is then still a scene.
   */
  dropIn: z.boolean().optional(),
  /** The course it is a session of study for, when it is one: it earns marks in the course. */
  studyCourseId: z.string().optional(),
  /** It is in the player's own room, where the work goes further. */
  ownRoom: z.boolean().optional(),
  /** It is in this love interest's own room. */
  roomOf: z.string().optional(),
  /** The event it is going to, when it is one. Whoever said she would be at it is there. */
  eventId: z.string().optional(),
  /** The hours it can be gone to, in game time, when it is an event that keeps hours: not before it opens, nor past its close. */
  window: z.object({ from: z.number().int(), until: z.number().int() }).optional()
})
export type Outing = z.infer<typeof OutingSchema>

/**
 * The fewest and the most hours an outing can be made to take by the player, when its length is his to choose: something he
 * typed to do, or an event he is going to, an hour at the least; or a session of study or a drill, which can be made
 * longer than it is but not shorter. Something else he drops in on is as long as it is, and has none.
 */
export function outingHourRange(state: GameState, outing: Outing): { min: number; max: number } | undefined {
  if (outing.studyCourseId || (outing.dropIn && !outing.eventId && outing.trains !== undefined && outing.trains !== 'rest')) {
    return { min: outing.hours, max: Math.max(outing.hours, MAX_SESSION_HOURS) }
  }
  if (outing.dropIn && !outing.eventId) return undefined
  if (outing.window) return { min: 1, max: Math.max(1, Math.min(MAX_EVENT_HOURS, outing.window.until - Math.max(state.time, outing.window.from))) }
  return { min: 1, max: outing.trains === 'rest' ? MAX_REST_HOURS : MAX_HOURS }
}

/** A room something typed can be set in: his own, or that of a love interest he has met who has one. */
interface OutingRoom {
  /** How it is named to the LLM: `room-of-<id>`. */
  id: string
  name: string
  /** The place it is in. */
  locationId: string
  /** Whose it is: a love interest's id, or the player's. */
  ownerId: string
}

/** The rooms an outing can be in: his own, when the game gives him one, and the room of anyone he has met who has one. */
export function outingRooms(content: ContentPack, state: GameState): OutingRoom[] {
  const own = content.newGame.room
  return [
    ...(own ? [{ id: `room-of-${PLAYER_ROOM}`, name: t('llm.outing.roomOf', { name: state.player.name }), locationId: own.locationId ?? content.newGame.locationId, ownerId: PLAYER_ROOM }] : []),
    ...content.loveInterests
      .filter((li) => li.room && hasMet(state, li.id))
      .map((li) => ({ id: `room-of-${li.id}`, name: t('llm.outing.roomOf', { name: li.name.split(' ')[0] }), locationId: li.room!.locationId, ownerId: li.id }))
  ]
}

/** An outing set in a room: at the place the room is in, in the room, and with whoever's room it is along, since nobody is in her room without her. */
function inRoom(outing: Outing, room: OutingRoom): Outing {
  if (room.ownerId === PLAYER_ROOM) return { ...outing, locationId: room.locationId, roomOf: PLAYER_ROOM, ownRoom: true }
  const withIds = outing.withIds.includes(room.ownerId) ? outing.withIds : [room.ownerId, ...outing.withIds].slice(0, MAX_SCENE_CAST)
  return { ...outing, locationId: room.locationId, roomOf: room.ownerId, withIds }
}

/** Reads the outing off the player's words without an LLM: names and places they mention, nothing cleverer. */
export function fallbackOuting(content: ContentPack, state: GameState, text: string): Outing {
  const said = text.toLowerCase()
  const mentions = (name: string) => new RegExp(`\\b${name.toLowerCase().replace(/[^a-z0-9 ]/g, '.')}\\b`).test(said)
  const named = content.locations.find((l) => mentions(l.name.replace(/^the /i, '')))
  const trains = (['rest', ...STATS] as const).find((kind) => STAT_WORDS[kind].test(said))
  // Somewhere suited to it, when the player didn't say where.
  const suited = trains && trains !== 'rest' ? content.locations.find((l) => trainsAt(l).includes(trains)) : undefined
  const place = named ?? suited
  const withIds = content.loveInterests
    .filter((li) => mentions(li.name.split(' ')[0]))
    .map((li) => li.id)
    .slice(0, MAX_SCENE_CAST)
  // "my room" is his own; "her room", or a room with her name on it, is the room of the one he named.
  const rooms = outingRooms(content, state)
  const room = /\bmy (own )?room\b/.test(said)
    ? rooms.find((r) => r.ownerId === PLAYER_ROOM)
    : /(\b(her|his|their)|'s) (own )?room\b|\broom of\b/.test(said)
      ? rooms.find((r) => withIds.includes(r.ownerId))
      : undefined
  const outing: Outing = {
    trains,
    title: text.trim().slice(0, TITLE_CHARS) || t('llm.outing.somethingElse'),
    description: '',
    withIds,
    locationId: place?.id ?? state.locationId,
    // Going to see someone, with nothing else said of it, is an hour of talk.
    hours: trains === 'rest' && /\b(sleep|bed)\b/.test(said) ? MAX_REST_HOURS : trains === undefined && TALK_WORDS.test(said) && content.loveInterests.some((li) => mentions(li.name.split(' ')[0])) ? 1 : DEFAULT_HOURS
  }
  return room ? inRoom(outing, room) : outing
}

/** The prompt asking the LLM to turn what the player typed into an outing. */
export function buildOutingPrompt(content: ContentPack, state: GameState, text: string): { system: string; user: string } {
  const here = content.locations.find((l) => l.id === state.locationId)
  const player = state.player.name
  const system = [
    t('llm.outing.systemRole', { player }),
    t('llm.outing.systemReply'),
    '{"title": string, "description": string, "with": string[], "place": string, "hours": number, "trains": string}',
    t('llm.outing.systemTitle', { field: '"title"' }),
    t('llm.outing.systemDescription', { field: '"description"' }),
    t('llm.outing.systemWith', { field: '"with"', player, max: MAX_SCENE_CAST }),
    t('llm.outing.systemPlace', { field: '"place"', player }),
    t('llm.outing.systemHours', { field: '"hours"', max: MAX_HOURS, maxRest: MAX_REST_HOURS }),
    t('llm.outing.systemTrains', { field: '"trains"', player, stats: STATS.join(', '), rest: '"rest"', none: '"none"' }),
    t('llm.outing.systemIds')
  ].join('\n')
  const user = [
    t('llm.outing.at', { player, place: here?.name ?? state.locationId, id: state.locationId }),
    '',
    t('llm.outing.people'),
    ...content.loveInterests.map(
      (li) => `- ${li.id}: ${li.name}${inClass(content, state, li) ? t('llm.outing.inClass') : locationOf(content, state, li) === state.locationId ? t('llm.outing.hereNow') : ''}`
    ),
    '',
    t('llm.outing.places'),
    ...content.locations.map(
      (l) => `- ${l.id}: ${l.name}${trainsAt(l).length > 0 ? t('llm.outing.trainsAt', { stats: trainsAt(l).join(', ') }) : ''}`
    ),
    ...(outingRooms(content, state).length > 0
      ? ['', t('llm.outing.rooms'), ...outingRooms(content, state).map((r) => t('llm.outing.room', { id: r.id, name: r.name, place: content.locations.find((l) => l.id === r.locationId)?.name ?? r.locationId }))]
      : []),
    '',
    t('llm.outing.typed', { player, text })
  ].join('\n')
  return { system, user }
}

/**
 * Reads the LLM's answer. Anything it left out or got wrong is filled in from the
 * player's own words, so a usable outing always comes back.
 */
export function parseOuting(reply: string, content: ContentPack, state: GameState, text: string): Outing {
  const guess = fallbackOuting(content, state, text)
  const json = /\{[\s\S]*\}/.exec(reply)
  if (!json) throw new Error(t('llm.outing.noPlan'))
  const raw = JSON.parse(json[0]) as Record<string, unknown>

  const idOf = (list: { id: string }[], value: unknown) =>
    list.find((entry) => typeof value === 'string' && entry.id.toLowerCase() === value.trim().toLowerCase())?.id
  const asked = Array.isArray(raw['with']) ? raw['with'] : undefined
  const withIds = asked?.map((id) => idOf(content.loveInterests, id)).filter((id): id is string => id !== undefined)
  const hours = Math.round(Number(raw['hours']))
  const kind = typeof raw['trains'] === 'string' ? raw['trains'].trim().toLowerCase() : undefined
  const trains = kind === 'none' ? undefined : (['rest', ...STATS] as const).find((k) => k === kind) ?? (kind ? undefined : guess.trains)
  const title = typeof raw['title'] === 'string' ? raw['title'].trim() : ''
  // A room named as the place: the LLM's, or failing any place of its own, the one his words named.
  const room = idOf(outingRooms(content, state), raw['place'])
  const chosen = outingRooms(content, state).find((r) => r.id === room)
  const guessed = idOf(content.locations, raw['place']) === undefined && guess.roomOf !== undefined ? outingRooms(content, state).find((r) => r.ownerId === guess.roomOf) : undefined

  const outing: Outing = {
    title: title.slice(0, TITLE_CHARS) || guess.title,
    description: typeof raw['description'] === 'string' ? raw['description'].trim() : '',
    withIds: withIds ? [...new Set(withIds)].slice(0, MAX_SCENE_CAST) : guess.withIds,
    locationId: idOf(content.locations, raw['place']) ?? guess.locationId,
    hours: Number.isFinite(hours)
      ? Math.min(trains === 'rest' ? MAX_REST_HOURS : MAX_HOURS, Math.max(1, hours))
      : guess.hours,
    trains
  }
  const within = chosen ?? guessed
  return within ? inRoom(outing, within) : outing
}

/** What an outing does for the player himself: a stat worked on at the cost of energy, or energy restored. */
export function outingEffects(outing: Outing): Effect[] {
  if (outing.trains === 'rest') return [{ type: 'energy', amount: REST_PER_HOUR * outing.hours }]
  if (!outing.trains) return []
  return [
    { type: 'stat', stat: outing.trains, amount: STAT_PER_HOUR * outing.hours },
    { type: 'energy', amount: -ENERGY_PER_HOUR * outing.hours }
  ]
}

/** Why a love interest can't come to something that runs over the given hours, if they can't. */
function busyReason(content: ContentPack, state: GameState, id: string, from: number, hours: number): string | undefined {
  const li = content.loveInterests.find((c) => c.id === id)
  if (!li) return t('llm.outing.nobody')
  const name = li.name.split(' ')[0]
  // In the hours her child is being born she is nowhere else.
  const birth = state.appointments.find((plan) => plan.kind === 'birth' && plan.loveInterestId === id && plan.time < from + hours && from < plan.time + plan.hours)
  if (birth) return t('llm.outing.birth', { name, place: content.locations.find((l) => l.id === birth.locationId)?.name ?? t('llm.outing.healthCenter') })
  for (let time = from; time < from + hours; time++) {
    const then = { ...state, time }
    for (const course of state.courses.filter((c) => courseMembers(c).includes(id))) {
      const meeting = meetingNow(content, then, course)
      if (!meeting) continue
      const ends = String(meeting.startHour + meeting.hours).padStart(2, '0')
      if (course.teacherId === id && time === from) return t('llm.outing.teaching', { name, course: course.number, ends })
      return time === from
        ? t('llm.outing.inCourse', { name, course: course.number, ends })
        : t('llm.outing.hasCourse', { name, course: course.number, starts: String(meeting.startHour).padStart(2, '0') })
    }
  }
  // With nothing on her schedule at that hour she is at home, and can be asked out like anyone.
  return undefined
}

export interface OutingCheck {
  /** What stands in the way of going right now, one line each. Empty when nothing does. */
  blockers: string[]
  /** How long to wait until nothing does. Zero means go now; undefined, that no time soon will do. */
  waitHours: number | undefined
  /** The invited who could come right now, when only some can and the place is open. */
  freeNow: string[]
}

/** Everything in the way of an outing that starts at `time`: people who are busy, closed doors. A plan of his own is not: he may go, and miss it. */
function blockersAt(content: ContentPack, state: GameState, outing: Outing, time: number): { people: Map<string, string>; other: string[] } {
  const place = content.locations.find((l) => l.id === outing.locationId)
  const start = time
  const other: string[] = []
  const arrive = toDate(content.calendar, start)
  const leave = toDate(content.calendar, start + outing.hours - 1)
  if (place && !(isOpen(place, arrive.hour) && isOpen(place, leave.hour))) {
    other.push(isOpen(place, arrive.hour) ? t('llm.outing.closesSoon', { place: place.name }) : t('llm.outing.closed', { place: place.name }))
  }
  // An event is gone to while it is on: he may come late and leave early, but not before it opens or after it shuts.
  if (outing.window && start < outing.window.from) other.push(t('llm.outing.opensAt', { title: outing.title, time: formatTime(toDate(content.calendar, outing.window.from)) }))
  if (outing.window && start + outing.hours > outing.window.until) other.push(t('llm.outing.overAt', { title: outing.title, time: formatTime(toDate(content.calendar, outing.window.until)) }))
  if (isGameOver(content.calendar, start + outing.hours - 1)) other.push(t('llm.outing.seasonOver'))
  // The small hours are for sleep: nothing starts in them or runs into them, but sleep itself.
  const last = toDate(content.calendar, start + outing.hours - 1)
  if (outing.trains !== 'rest' && (arrive.hour < SLEEP_UNTIL || last.hour < SLEEP_UNTIL || last.dayIndex !== arrive.dayIndex)) other.push(t('llm.outing.pastMidnight'))
  if (((outing.trains && outing.trains !== 'rest') || outing.studyCourseId) && state.player.energy < ENERGY_PER_HOUR * outing.hours) {
    other.push(t('llm.outing.tooTired'))
  }

  const people = new Map<string, string>()
  for (const id of outing.withIds) {
    const reason = busyReason(content, state, id, start, outing.hours)
    if (reason) people.set(id, reason)
  }
  return { people, other }
}

/**
 * Whether an outing can happen now, and if not, why not and how long until it can:
 * everyone invited out of class and around, and the place open.
 */
export function checkOuting(content: ContentPack, state: GameState, outing: Outing): OutingCheck {
  const now = blockersAt(content, state, outing, state.time)
  const blockers = [...now.people.values(), ...now.other]
  const freeNow = outing.withIds.filter((id) => !now.people.has(id))
  const partial = now.people.size > 0 && now.other.length === 0 && freeNow.length > 0

  let waitHours: number | undefined
  for (let wait = 0; wait <= MAX_WAIT_DAYS * content.calendar.hoursPerDay; wait++) {
    const then = blockersAt(content, state, outing, state.time + wait)
    if (then.people.size === 0 && then.other.length === 0) {
      waitHours = wait
      break
    }
  }
  return { blockers, waitHours, freeNow: partial ? freeNow : [] }
}

/**
 * Goes on the outing after waiting the given hours: the wait passes, the
 * player ends up at the place, and the time it takes is spent. With company it opens a
 * scene with them, and what they make of it is settled when the scene is over.
 */
export function startOuting(
  content: ContentPack,
  state: GameState,
  outing: Outing,
  waitHours = 0
): { state: GameState; scene: Scene | null } {
  const waited = { ...state, time: state.time + waitHours }
  const { people, other } = blockersAt(content, state, outing, waited.time)
  const problems = [...people.values(), ...other]
  if (problems.length > 0) throw new Error(t('llm.outing.cannot', { title: outing.title, problems: problems.join('; ') }))

  // His own room is where he is from then on, until he goes somewhere else.
  const there = { ...waited, locationId: outing.locationId, inOwnRoom: outing.ownRoom === true }
  const worked = applyEffects(there, outingEffects(outing), { content })
  // Study is work like any other, and what it earns goes on the course.
  const arrived = outing.studyCourseId
    ? addCoursePoints(content, applyEffects(worked, [{ type: 'energy', amount: -ENERGY_PER_HOUR * outing.hours }], { content }), outing.studyCourseId, studyPoints(content, outing) * factor(content, worked, 'marks'))
    : worked
  const after = arrived
  const place = content.locations.find((l) => l.id === outing.locationId)
  // Whoever he asked along; or, for something he drops in on alone, whoever is there when he arrives:
  // Of the love interests there, he runs into one or two, whoever the day throws his way.
  const around = outing.dropIn && outing.withIds.length === 0 ? approachableAt(content, there, outing.locationId).map((li) => li.id) : []
  const met = pick(state.weatherSeed, there.time, 900) < 0.5 ? 1 : MAX_RUN_INTO
  // Whoever said she would be at an event is there, whatever else the day had for her: she comes before anyone he merely runs into.
  const promised = outing.eventId && outing.withIds.length === 0 ? eventGoers(state, outing.eventId).filter((id) => state.relationships[id] !== undefined && content.loveInterests.some((li) => li.id === id)) : []
  const chance = around
    .filter((id) => !promised.includes(id))
    .map((id) => ({ id, luck: pick(state.weatherSeed, there.time, seedOf(id)) }))
    .sort((a, b) => a.luck - b.luck)
    .slice(0, Math.max(0, met - promised.length))
    .map(({ id }) => id)
  const found = [...promised, ...chance].slice(0, MAX_SCENE_CAST)
  // With no love interest about he is alone, whoever works at the place: there is no scene, only what the work did.
  const [leadId, ...companionIds] = outing.withIds.length > 0 ? outing.withIds : found
  const what = outing.studyCourseId ? t('llm.outing.whatStudy') : outing.trains && outing.trains !== 'rest' ? t('llm.outing.whatTrain', { stat: outing.trains }) : t('llm.outing.whatAlone')
  const direction = !outing.dropIn
    ? undefined
    : t('llm.outing.direction', {
        player: state.player.name,
        what,
        title: outing.title.toLowerCase(),
        description: outing.description,
        meeting:
          promised.length > 0
            ? t('llm.outing.promised', { names: firstNames(content, promised), many: promised.length > 1, player: state.player.name })
            : t('llm.outing.chance'),
        hours: outing.hours,
        event: Boolean(outing.eventId)
      })
  return {
    state: { ...after, time: after.time + outing.hours },
    scene: leadId
      ? {
          loveInterestId: leadId,
          companionIds,
          nsfw: false,
          beats: [{ activityName: outing.title, locationName: place?.name, description: outing.description || undefined, direction }],
          messages: [],
          gifts: [], conceived: [], departed: [], npc: false,
          roomOf: outing.roomOf,
          // Asked along, she is out with him; run into, she is not.
          ...(outing.withIds.length > 0 && { outing: true }),
          baseline: sceneBaseline(state, leadId, companionIds)
        }
      : null
  }
}

/** "Dinner with Seraphine and Faye at the Honeyed Bee Inn, 2 hours". */
export function describeOuting(content: ContentPack, outing: Outing): string {
  const place = content.locations.find((l) => l.id === outing.locationId)
  // A title that already says who with is not told it twice.
  const named = outing.withIds.length > 0 && outing.title.toLowerCase().includes(t('llm.outing.titledWith', { names: firstNames(content, outing.withIds) }).toLowerCase())
  const company = named ? '' : outing.withIds.length > 0 ? t('llm.outing.with', { names: firstNames(content, outing.withIds) }) : t('llm.outing.alone')
  // In someone's room, the room is where it is.
  const where =
    outing.roomOf === PLAYER_ROOM
      ? t('llm.outing.inYourRoom')
      : outing.roomOf && !outing.studyCourseId
        ? t('llm.outing.inRoomOf', { name: firstNames(content, [outing.roomOf]) })
        : t('llm.outing.atPlace', { place: place?.name ?? outing.locationId })
  return t('llm.outing.describe', { title: outing.title, company, where, hours: outing.hours })
}

/** An event that can be gone to today: the outing going to it is, and the most hours of it that are left to be had. */
export interface EventOuting {
  event: CalendarEvent
  outing: Outing
  /** The hours left of it today, counted from when he could get there, and not past midnight. At least one. */
  maxHours: number
}

/**
 * The events he could go to today: those under way that are somewhere and keep hours, with
 * some of today's hours still to run. Each as something to go and do, on his own, with whoever
 * is there: for an hour, or for as long as is left of it.
 */
export function eventOutings(content: ContentPack, state: GameState): EventOuting[] {
  const { dayIndex, hour } = toDate(content.calendar, state.time)
  // The societies' fair has a screen of its own, and is not gone to as an outing.
  const fairId = content.societies?.fair ? content.societies.fairId : undefined
  return eventsOn(content, state).filter((event) => !event.secret && event.id !== fairId).flatMap((event) => {
    const place = content.locations.find((l) => l.id === event.locationId)
    if (event.startHour === undefined || !place) return []
    const from = timeOn(content, dayIndex, event.startHour)
    // It shuts when it says, or at midnight if it would run past it.
    const until = Math.min(from + (event.hours ?? 1), timeOn(content, dayIndex, content.calendar.hoursPerDay))
    const maxHours = Math.min(MAX_EVENT_HOURS, until - Math.max(state.time, from))
    if (maxHours < 1 || hour < 0) return []
    const outing: Outing = { title: event.name, description: event.description, withIds: [], locationId: place.id, hours: Math.min(DEFAULT_HOURS, maxHours), dropIn: true, eventId: event.id, window: { from, until } }
    return [{ event, outing, maxHours }]
  })
}

/**
 * An outing he typed that is really going to an event that is on today: it is at the event's place and names it.
 * It is given the event's hours, so that it is not put off until after the event has shut, and no longer than is left of it.
 * Anything else comes back as it was.
 */
export function asEventOuting(content: ContentPack, state: GameState, outing: Outing): Outing {
  if (outing.eventId) return outing
  const plain = (words: string) => words.toLowerCase().replace(/^the /, '')
  const going = eventOutings(content, state).find(({ event, outing: to }) => to.locationId === outing.locationId && plain(outing.title).includes(plain(event.name)))
  if (!going) return outing
  return { ...outing, eventId: going.event.id, window: going.outing.window, hours: Math.min(outing.hours, going.maxHours) }
}

/** How long working on a stat at a place takes: long enough to be worth a scene. */
export const DRILL_HOURS = 2

/** A way of raising a stat that the day view can suggest: what, and where. */
export interface StatSuggestion {
  stat: Stat
  location: Location
  drill: Drill
}

/** A repeatable number in [0, 1) for one stat at one moment of one game. */
function pick(seed: number, time: number, index: number): number {
  let x = (seed ^ Math.imul(time + 1, 0x9e3779b1) ^ Math.imul(index + 1, 0x7f4a7c15)) >>> 0
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296
}

/**
 * One way to raise each stat right now, picked from everything the places of the game have
 * to offer for it: a workout at the gym for strength, a bowl of something enormous at the
 * restaurant for endurance. What is open when he would get there is preferred. The pick
 * changes as time passes, so that the same thing is not always suggested, and is the same
 * each time it is looked at within the hour. A stat nowhere has anything for is left out.
 */
export function suggestDrills(content: ContentPack, state: GameState): StatSuggestion[] {
  return STATS.flatMap((stat, index) => {
    // Only somewhere that is open now, and stays open for as long as it takes: a place that is shut is not offered.
    const all = content.locations
      .filter((location) => isOpenFor(content.calendar, location, state.time, DRILL_HOURS))
      .flatMap((location) => location.drills.filter((drill) => drill.stat === stat).map((drill) => ({ stat, location, drill })))
    const doable = all.filter((option) => checkOuting(content, state, drillOuting(option)).blockers.length === 0)
    const from = doable.length > 0 ? doable : all
    return from.length > 0 ? [from[Math.floor(pick(state.weatherSeed, state.time, index) * from.length)]] : []
  })
}

/** The outing a suggestion is: two hours at the place, on his own, with whoever happens to be there. */
export function drillOuting(suggestion: StatSuggestion): Outing {
  return {
    title: suggestion.drill.title,
    description: suggestion.drill.description,
    withIds: [],
    locationId: suggestion.location.id,
    hours: DRILL_HOURS,
    trains: suggestion.stat,
    dropIn: true
  }
}

/**
 * What the player would miss by going on an outing now, after the given wait: a class he
 * is taking, a shift at his job, or a plan he has made, that falls in the hours it takes.
 * Each as a line. He may still go; it is for him to be told first.
 */
export function outingMisses(content: ContentPack, state: GameState, outing: Outing, waitHours = 0): string[] {
  const from = state.time + waitHours
  const until = from + outing.hours
  const clock = (hour: number) => `${String(hour).padStart(2, '0')}:00`
  const missed: string[] = []
  for (const plan of state.appointments) {
    if (plan.time < until && from < plan.time + plan.hours) missed.push(t('llm.outing.missPlan', { time: formatTime(toDate(content.calendar, plan.time)), title: plan.title }))
  }
  for (let time = from; time < until; time++) {
    const then = { ...state, time }
    const { dayIndex, hour, weekday } = toDate(content.calendar, time)
    for (const course of state.courses.filter((c) => state.enrolment?.includes(c.id))) {
      const meeting = meetingNow(content, then, course)
      // Counted at the hour it begins, or at the first hour if it is already under way; not one he has sat.
      if (!meeting || (meeting.startHour !== hour && time !== from)) continue
      if (state.attendance[course.id]?.sat.includes(`${dayIndex}:${meeting.startHour}`)) continue
      missed.push(t('llm.outing.missClass', { course: course.number, title: course.title, kind: meeting.kind, time: clock(meeting.startHour) }))
    }
    const job = content.jobs?.jobs.find((j) => j.id === state.job?.jobId)
    for (const shift of job?.shifts ?? []) {
      if (shift.weekday !== weekday || hour < shift.startHour || hour >= shift.startHour + shift.hours) continue
      if (shift.startHour !== hour && time !== from) continue
      if (timeOn(content, dayIndex, shift.startHour) < (state.job?.hiredAt ?? 0) || state.job?.worked.includes(shiftKey(dayIndex, shift))) continue
      missed.push(t('llm.outing.missShift', { job: job!.title.toLowerCase(), time: clock(shift.startHour) }))
    }
  }
  return [...new Set(missed)]
}

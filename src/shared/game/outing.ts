import { z } from 'zod'
import { MAX_SCENE_CAST, STATS, StatSchema, type ContentPack, type GameState, type Effect, type Scene, type Stat } from '../model'
import { formatTime, isGameOver, toDate } from './calendar'
import { applyEffects } from './conditions'
import { meetingNow } from './courses'
import { locationOf } from './map'
import { firstNames, sceneBaseline } from './scene'
import { isOpen } from './schedule'

// What the player may ask for, when they don't say.
const DEFAULT_HOURS = 2
const MAX_HOURS = 4
// A night's sleep is longer than anything else the player might do.
const MAX_REST_HOURS = 8
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
// Waiting for people to be free only looks this far ahead; beyond it, a plan is the thing.
const MAX_WAIT_DAYS = 1
// What time spent together at the player's own suggestion is worth to each person who came.
const OUTING_AFFECTION = 1
const TITLE_CHARS = 60

/** Something the player made up to do: what, where, how long, and with whom. */
export const OutingSchema = z.object({
  /** A few words: "Dinner", "A walk by the river". */
  title: z.string(),
  /** A line of narration that opens the scene. */
  description: z.string().default(''),
  /** The love interests invited, the first of whom leads the scene. Empty when the player goes alone. */
  withIds: z.array(z.string()).max(MAX_SCENE_CAST).default([]),
  locationId: z.string(),
  hours: z.number().int().min(1).max(MAX_REST_HOURS).default(DEFAULT_HOURS),
  /** What it does for the player: raises a stat, restores energy, or neither. */
  trains: z.union([StatSchema, z.literal('rest')]).optional()
})
export type Outing = z.infer<typeof OutingSchema>

/** Reads the outing off the player's words without an LLM: names and places they mention, nothing cleverer. */
export function fallbackOuting(content: ContentPack, state: GameState, text: string): Outing {
  const said = text.toLowerCase()
  const mentions = (name: string) => new RegExp(`\\b${name.toLowerCase().replace(/[^a-z0-9 ]/g, '.')}\\b`).test(said)
  const named = content.locations.find((l) => mentions(l.name.replace(/^the /i, '')))
  const trains = (['rest', ...STATS] as const).find((kind) => STAT_WORDS[kind].test(said))
  // Somewhere suited to it, when the player didn't say where.
  const suited = trains && trains !== 'rest' ? content.locations.find((l) => l.trains.includes(trains)) : undefined
  const place = named ?? suited
  return {
    trains,
    title: text.trim().slice(0, TITLE_CHARS) || 'Something else',
    description: '',
    withIds: content.loveInterests
      .filter((li) => mentions(li.name.split(' ')[0]))
      .map((li) => li.id)
      .slice(0, MAX_SCENE_CAST),
    locationId: place?.id ?? state.locationId,
    hours: trains === 'rest' && /\b(sleep|bed)\b/.test(said) ? MAX_REST_HOURS : DEFAULT_HOURS
  }
}

/** The prompt asking the LLM to turn what the player typed into an outing. */
export function buildOutingPrompt(content: ContentPack, state: GameState, text: string): { system: string; user: string } {
  const here = content.locations.find((l) => l.id === state.locationId)
  const system = [
    `You turn what a player types into a plan in a dating sim. ${state.player.name} is the player.`,
    'Reply with one JSON object and nothing else:',
    '{"title": string, "description": string, "with": string[], "place": string, "hours": number, "trains": string}',
    '- "title": what they will do, in a few words, like "Dinner" or "A walk by the river".',
    `- "description": one sentence of narration that opens the scene, in the second person and present tense.`,
    `- "with": the ids of the people ${state.player.name} names or plainly means, at most ${MAX_SCENE_CAST}. ` +
      `Use [] when ${state.player.name} means to go alone. Never add someone who was not asked.`,
    '- "place": the id of the place it would happen. Choose the place that suits it best when none is named.',
    `- "hours": how long it takes, a whole number from 1 to ${MAX_HOURS}, or up to ${MAX_REST_HOURS} for sleep.`,
    `- "trains": what it does for ${state.player.name}. One of ${STATS.join(', ')} when it works on that ` +
      `(sparring is strength, archery dexterity, running endurance, study intelligence, company and ` +
      `performance charisma, prayer and reflection wisdom); "rest" for sleeping or resting; "none" otherwise.`,
    'Use only the ids listed.'
  ].join('\n')
  const user = [
    `${state.player.name} is at ${here?.name ?? state.locationId} (${state.locationId}).`,
    '',
    'People:',
    ...content.loveInterests.map(
      (li) => `- ${li.id}: ${li.name}${locationOf(content, state, li) === state.locationId ? ' (here now)' : ''}`
    ),
    '',
    'Places:',
    ...content.locations.map(
      (l) => `- ${l.id}: ${l.name}${l.trains.length > 0 ? ` (a good place to work on ${l.trains.join(', ')})` : ''}`
    ),
    '',
    `${state.player.name} typed: ${text}`
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
  if (!json) throw new Error('The LLM did not reply with a plan')
  const raw = JSON.parse(json[0]) as Record<string, unknown>

  const idOf = (list: { id: string }[], value: unknown) =>
    list.find((entry) => typeof value === 'string' && entry.id.toLowerCase() === value.trim().toLowerCase())?.id
  const asked = Array.isArray(raw['with']) ? raw['with'] : undefined
  const withIds = asked?.map((id) => idOf(content.loveInterests, id)).filter((id): id is string => id !== undefined)
  const hours = Math.round(Number(raw['hours']))
  const kind = typeof raw['trains'] === 'string' ? raw['trains'].trim().toLowerCase() : undefined
  const trains = kind === 'none' ? undefined : (['rest', ...STATS] as const).find((k) => k === kind) ?? (kind ? undefined : guess.trains)
  const title = typeof raw['title'] === 'string' ? raw['title'].trim() : ''

  return {
    title: title.slice(0, TITLE_CHARS) || guess.title,
    description: typeof raw['description'] === 'string' ? raw['description'].trim() : '',
    withIds: withIds ? [...new Set(withIds)].slice(0, MAX_SCENE_CAST) : guess.withIds,
    locationId: idOf(content.locations, raw['place']) ?? guess.locationId,
    hours: Number.isFinite(hours)
      ? Math.min(trains === 'rest' ? MAX_REST_HOURS : MAX_HOURS, Math.max(1, hours))
      : guess.hours,
    trains
  }
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

/** How long the walk to the outing takes: nothing when it is where the player already is. */
function walkHours(content: ContentPack, state: GameState, outing: Outing): number {
  return outing.locationId === state.locationId ? 0 : (content.map?.travelHours ?? 0)
}

/** Why a love interest can't come to something that runs over the given hours, if they can't. */
function busyReason(content: ContentPack, state: GameState, id: string, from: number, hours: number): string | undefined {
  const li = content.loveInterests.find((c) => c.id === id)
  if (!li) return 'nobody by that name'
  const name = li.name.split(' ')[0]
  const length = content.coursework?.hours ?? 0
  for (let time = from; time < from + hours; time++) {
    const then = { ...state, time }
    for (const course of state.courses.filter((c) => c.studentIds.includes(id))) {
      const meeting = meetingNow(content, then, course)
      if (!meeting) continue
      const ends = String(meeting.startHour + length).padStart(2, '0')
      return time === from
        ? `${name} is in ${course.number} until ${ends}:00`
        : `${name} has ${course.number} at ${String(meeting.startHour).padStart(2, '0')}:00`
    }
  }
  // Nowhere on their schedule at that hour: asleep, or off on business of their own.
  if (locationOf(content, { ...state, time: from }, li) === undefined) return `${name} is not around`
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

/** Everything in the way of an outing that starts at `time`: people who are busy, plans, closed doors. */
function blockersAt(content: ContentPack, state: GameState, outing: Outing, time: number): { people: Map<string, string>; other: string[] } {
  const place = content.locations.find((l) => l.id === outing.locationId)
  const start = time + walkHours(content, state, outing)
  const other: string[] = []
  const arrive = toDate(content.calendar, start)
  const leave = toDate(content.calendar, start + outing.hours - 1)
  if (place && !(isOpen(place, arrive.hour) && isOpen(place, leave.hour))) {
    other.push(isOpen(place, arrive.hour) ? `${place.name} closes too soon` : `${place.name} is closed`)
  }
  const plan = state.appointments.find((a) => a.time < start + outing.hours && time < a.time + a.hours)
  if (plan) other.push(`You have a plan at ${formatTime(toDate(content.calendar, plan.time))}: ${plan.title}`)
  if (isGameOver(content.calendar, start + outing.hours - 1)) other.push('There is not enough of the season left')
  if (outing.trains && outing.trains !== 'rest' && state.player.energy < ENERGY_PER_HOUR * outing.hours) {
    other.push('You are too tired for that. Rest first')
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
 * everyone invited out of class and around, the place open, and no plan in the way.
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
 * Goes on the outing after waiting the given hours: the wait and the walk pass, the
 * player ends up at the place, and the time it takes is spent. With company it opens a
 * scene with them, and each thinks a little better of the player for the invitation.
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
  if (problems.length > 0) throw new Error(`Cannot do "${outing.title}": ${problems.join('; ')}`)

  const there = { ...waited, time: waited.time + walkHours(content, state, outing), locationId: outing.locationId }
  const arrived = applyEffects(there, outingEffects(outing), { content })
  const after = outing.withIds.reduce(
    (current, loveInterestId) =>
      applyEffects(current, [{ type: 'meter', meter: 'affection', amount: OUTING_AFFECTION }], { content, loveInterestId }),
    arrived
  )
  const [leadId, ...companionIds] = outing.withIds
  const place = content.locations.find((l) => l.id === outing.locationId)
  return {
    state: { ...after, time: after.time + outing.hours },
    scene: leadId
      ? {
          loveInterestId: leadId,
          companionIds,
          nsfw: false,
          beats: [{ activityName: outing.title, locationName: place?.name, description: outing.description || undefined }],
          messages: [],
          gifts: [],
          baseline: sceneBaseline(state, leadId, companionIds)
        }
      : null
  }
}

/** "Dinner with Seraphine and Faye at the Honeyed Bee Inn, 2 hours". */
export function describeOuting(content: ContentPack, outing: Outing): string {
  const place = content.locations.find((l) => l.id === outing.locationId)
  const company = outing.withIds.length > 0 ? ` with ${firstNames(content, outing.withIds)}` : ', alone'
  return `${outing.title}${company} at ${place?.name ?? outing.locationId}, ${outing.hours} hour${outing.hours === 1 ? '' : 's'}`
}

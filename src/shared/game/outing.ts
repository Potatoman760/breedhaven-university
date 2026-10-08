import { z } from 'zod'
import { MAX_SCENE_CAST, STATS, StatSchema, trainsAt, type ContentPack, type Drill, type Location, type GameState, type Effect, type Scene, type Stat } from '../model'
import { formatTime, isGameOver, toDate } from './calendar'
import { applyEffects } from './conditions'
import { courseMembers, meetingNow } from './courses'
import { locationOf, approachableAt } from './map'
import { shiftKey } from './jobs'
import { timeOn } from './agenda'
import { addCoursePoints, studyPoints } from './grades'
import { firstNames, sceneBaseline } from './scene'
import { isOpen } from './schedule'

// The hour he wakes: from midnight until then is for sleep (`SLEEP_HOURS` in sleep.ts).
const SLEEP_UNTIL = 6
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
  hours: z.number().int().min(1).max(MAX_REST_HOURS).default(DEFAULT_HOURS),
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
  roomOf: z.string().optional()
})
export type Outing = z.infer<typeof OutingSchema>

/** Reads the outing off the player's words without an LLM: names and places they mention, nothing cleverer. */
export function fallbackOuting(content: ContentPack, state: GameState, text: string): Outing {
  const said = text.toLowerCase()
  const mentions = (name: string) => new RegExp(`\\b${name.toLowerCase().replace(/[^a-z0-9 ]/g, '.')}\\b`).test(said)
  const named = content.locations.find((l) => mentions(l.name.replace(/^the /i, '')))
  const trains = (['rest', ...STATS] as const).find((kind) => STAT_WORDS[kind].test(said))
  // Somewhere suited to it, when the player didn't say where.
  const suited = trains && trains !== 'rest' ? content.locations.find((l) => trainsAt(l).includes(trains)) : undefined
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
      (l) => `- ${l.id}: ${l.name}${trainsAt(l).length > 0 ? ` (a good place to work on ${trainsAt(l).join(', ')})` : ''}`
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

/** Why a love interest can't come to something that runs over the given hours, if they can't. */
function busyReason(content: ContentPack, state: GameState, id: string, from: number, hours: number): string | undefined {
  const li = content.loveInterests.find((c) => c.id === id)
  if (!li) return 'nobody by that name'
  const name = li.name.split(' ')[0]
  for (let time = from; time < from + hours; time++) {
    const then = { ...state, time }
    for (const course of state.courses.filter((c) => courseMembers(c).includes(id))) {
      const meeting = meetingNow(content, then, course)
      if (!meeting) continue
      const ends = String(meeting.startHour + meeting.hours).padStart(2, '0')
      if (course.teacherId === id && time === from) return `${name} is teaching ${course.number} until ${ends}:00`
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
  const start = time
  const other: string[] = []
  const arrive = toDate(content.calendar, start)
  const leave = toDate(content.calendar, start + outing.hours - 1)
  if (place && !(isOpen(place, arrive.hour) && isOpen(place, leave.hour))) {
    other.push(isOpen(place, arrive.hour) ? `${place.name} closes too soon` : `${place.name} is closed`)
  }
  const plan = state.appointments.find((a) => a.time < start + outing.hours && time < a.time + a.hours)
  if (plan) other.push(`You have a plan at ${formatTime(toDate(content.calendar, plan.time))}: ${plan.title}`)
  if (isGameOver(content.calendar, start + outing.hours - 1)) other.push('There is not enough of the season left')
  // The small hours are for sleep: nothing starts in them or runs into them, but sleep itself.
  const last = toDate(content.calendar, start + outing.hours - 1)
  if (outing.trains !== 'rest' && (arrive.hour < SLEEP_UNTIL || last.hour < SLEEP_UNTIL || last.dayIndex !== arrive.dayIndex)) other.push('It would run past midnight, and the night is for sleeping')
  if (((outing.trains && outing.trains !== 'rest') || outing.studyCourseId) && state.player.energy < ENERGY_PER_HOUR * outing.hours) {
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
  if (problems.length > 0) throw new Error(`Cannot do "${outing.title}": ${problems.join('; ')}`)

  const there = { ...waited, locationId: outing.locationId }
  const worked = applyEffects(there, outingEffects(outing), { content })
  // Study is work like any other, and what it earns goes on the course.
  const arrived = outing.studyCourseId
    ? addCoursePoints(content, applyEffects(worked, [{ type: 'energy', amount: -ENERGY_PER_HOUR * outing.hours }], { content }), outing.studyCourseId, studyPoints(content, outing))
    : worked
  const after = arrived
  const place = content.locations.find((l) => l.id === outing.locationId)
  // Whoever he asked along; or, for something he drops in on alone, whoever is there when he arrives:
  // Of the love interests there, he runs into one or two, whoever the day throws his way.
  const around = outing.dropIn && outing.withIds.length === 0 ? approachableAt(content, there, outing.locationId).map((li) => li.id) : []
  const met = pick(state.weatherSeed, there.time, 900) < 0.5 ? 1 : MAX_RUN_INTO
  const found = around
    .map((id, index) => ({ id, luck: pick(state.weatherSeed, there.time, 901 + index) }))
    .sort((a, b) => a.luck - b.luck)
    .slice(0, met)
    .map(({ id }) => id)
  // With no love interest about he is alone, whoever works at the place: there is no scene, only what the work did.
  const [leadId, ...companionIds] = outing.withIds.length > 0 ? outing.withIds : found
  const what = outing.studyCourseId ? 'to study' : outing.trains && outing.trains !== 'rest' ? `to work on his ${outing.trains}` : 'on his own'
  const direction = !outing.dropIn
    ? undefined
    : `${state.player.name} has come here ${what}: ${outing.title.toLowerCase()}. ${outing.description} ` +
      `Nobody arranged this: you happen to be here, and run into him while he is at it. Open with him at his work, and then the running into each other. You may watch, join in, tease him, help or get in his way, as you would.` +
      ` By the end of the scene the two hours are up and he is the better for it.`
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
    const all = content.locations.flatMap((location) => location.drills.filter((drill) => drill.stat === stat).map((drill) => ({ stat, location, drill })))
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
 * is taking, or a shift at his job, that falls in the hours it takes.
 * Each as a line. He may still go; it is for him to be told first.
 */
export function outingMisses(content: ContentPack, state: GameState, outing: Outing, waitHours = 0): string[] {
  const from = state.time + waitHours
  const until = from + outing.hours
  const clock = (hour: number) => `${String(hour).padStart(2, '0')}:00`
  const missed: string[] = []
  for (let time = from; time < until; time++) {
    const then = { ...state, time }
    const { dayIndex, hour, weekday } = toDate(content.calendar, time)
    for (const course of state.courses.filter((c) => state.enrolment?.includes(c.id))) {
      const meeting = meetingNow(content, then, course)
      // Counted at the hour it begins, or at the first hour if it is already under way; not one he has sat.
      if (!meeting || (meeting.startHour !== hour && time !== from)) continue
      if (state.attendance[course.id]?.last === `${dayIndex}:${meeting.startHour}`) continue
      missed.push(`${course.number} ${course.title}, ${meeting.kind === 'lab' ? 'a lab' : 'a lecture'} at ${clock(meeting.startHour)}`)
    }
    const job = content.jobs?.jobs.find((j) => j.id === state.job?.jobId)
    for (const shift of job?.shifts ?? []) {
      if (shift.weekday !== weekday || hour < shift.startHour || hour >= shift.startHour + shift.hours) continue
      if (shift.startHour !== hour && time !== from) continue
      if (timeOn(content, dayIndex, shift.startHour) < (state.job?.hiredAt ?? 0) || state.job?.worked.includes(shiftKey(dayIndex, shift))) continue
      missed.push(`your shift as ${job!.title.toLowerCase()} at ${clock(shift.startHour)}, which would be a strike`)
    }
  }
  return [...new Set(missed)]
}

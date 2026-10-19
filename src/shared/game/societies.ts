import type { AdultEvent, ContentPack, GameState, Intro, Society } from '../model'
import type { PerformCheck } from './activities'
import { dayIndexOf, toDate } from './calendar'
import { applyEffects } from './conditions'
import { factor } from './modifiers'
import { timesIntimate } from './memory'

/** The game time at which the societies open: the hour their fair begins, in the year the game starts. */
export function societiesOpenAt(content: ContentPack): number | undefined {
  const config = content.societies
  const fair = content.calendar.events.find((event) => event.id === config?.fairId)
  if (!config || !fair) return undefined
  const { calendar } = content
  const dayIndex = dayIndexOf(calendar, fair.year ?? toDate(calendar, 0).year, fair.month, fair.day)
  return dayIndex * calendar.hoursPerDay + ((fair.startHour ?? calendar.start.hour) - calendar.start.hour)
}

/** Whether the societies have opened: from their fair on, they can be joined and they meet. */
export function societiesOpen(content: ContentPack, state: Pick<GameState, 'time'>): boolean {
  const at = societiesOpenAt(content)
  return at !== undefined && state.time >= at
}

export function societyOf(content: ContentPack, id: string): Society | undefined {
  return content.societies?.societies.find((society) => society.id === id)
}

/** The societies he belongs to. */
export function joinedSocieties(content: ContentPack, state: Pick<GameState, 'societies'>): Society[] {
  return state.societies.flatMap((id) => societyOf(content, id) ?? [])
}

/** Whether two societies' meetings fall in the same hours. */
export function societiesClash(content: ContentPack, a: Society, b: Society): boolean {
  const hours = content.societies?.hours ?? 1
  return a.id !== b.id && a.weekday === b.weekday && a.startHour < b.startHour + hours && b.startHour < a.startHour + hours
}

/** Whether he can join a society now: once they have opened, while he has room for another, and not one that meets when another of his does. */
export function canJoinSociety(content: ContentPack, state: GameState, id: string): PerformCheck {
  const config = content.societies
  const society = societyOf(content, id)
  if (!config || !society) return { ok: false, reasons: ['There is no such society'] }
  const reasons: string[] = []
  if (!societiesOpen(content, state)) reasons.push('The societies sign up new members at their fair')
  if (state.societies.includes(id)) reasons.push('You already belong to it')
  else if (state.societies.length >= config.maxJoined) reasons.push(`You can belong to ${config.maxJoined} societies at most`)
  const clash = joinedSocieties(content, state).find((other) => societiesClash(content, society, other))
  if (clash) reasons.push(`It meets when ${clash.name} does`)
  return { ok: reasons.length === 0, reasons }
}

export function joinSociety(content: ContentPack, state: GameState, id: string): GameState {
  return canJoinSociety(content, state, id).ok ? { ...state, societies: [...state.societies, id] } : state
}

export function leaveSociety(state: GameState, id: string): GameState {
  return { ...state, societies: state.societies.filter((one) => one !== id) }
}

/** The meeting's key: the society and the day, so that each meeting is been to once. */
export const societyMeetingKey = (societyId: string, dayIndex: number) => `${societyId}:${dayIndex}`

/** Whether a society is meeting right now: on its day, in its hour, once the societies have opened, and not on orientation day. */
export function societyMeetingNow(content: ContentPack, state: GameState, society: Society): boolean {
  const { weekday, hour, dayIndex } = toDate(content.calendar, state.time)
  // Orientation day is the induction's alone, as it is for classes.
  if (!societiesOpen(content, state) || dayIndex === (content.orientation?.day ?? 0) - 1) return false
  const hours = content.societies?.hours ?? 1
  return society.weekday === weekday && hour >= society.startHour && hour < society.startHour + hours
}

/** Who is at a society's meetings: its members, and its sponsor. */
export function societyPeople(society: Society): string[] {
  return society.sponsorId ? [...society.memberIds, society.sponsorId] : society.memberIds
}

/** Every society meeting right now, his or not: those in them are at its place. */
export function societiesInSession(content: ContentPack, state: GameState): Society[] {
  return (content.societies?.societies ?? []).filter((society) => societyMeetingNow(content, state, society))
}

/** Whether he can go to a meeting of a society now: his, meeting, him there, not been to already, and the energy for it. */
export function canAttendSociety(content: ContentPack, state: GameState, id: string): PerformCheck {
  const config = content.societies
  const society = societyOf(content, id)
  if (!config || !society) return { ok: false, reasons: ['There is no such society'] }
  const reasons: string[] = []
  if (!state.societies.includes(id)) reasons.push(`You do not belong to ${society.name}`)
  if (!societyMeetingNow(content, state, society)) reasons.push(`${society.name} is not meeting now`)
  if (state.locationId !== society.locationId) reasons.push(`${society.name} meets at ${content.locations.find((l) => l.id === society.locationId)?.name ?? society.locationId}`)
  if (state.societyMeetings.includes(societyMeetingKey(id, toDate(content.calendar, state.time).dayIndex))) reasons.push('You have been to this meeting')
  const cost = Math.round(config.energy * config.hours * factor(content, state, 'effort'))
  if (state.player.energy < cost) reasons.push(`Needs ${cost} energy`)
  return { ok: reasons.length === 0, reasons }
}

/** Goes to a meeting: what it trains, its energy, the rest of its hour gone by, and the meeting counted as been to. */
export function attendSociety(content: ContentPack, state: GameState, id: string): GameState {
  const check = canAttendSociety(content, state, id)
  if (!check.ok) throw new Error(`Cannot attend "${id}": ${check.reasons.join('; ')}`)
  const config = content.societies!
  const society = societyOf(content, id)!
  const date = toDate(content.calendar, state.time)
  const after = applyEffects(
    state,
    [
      ...society.stats.map((stat) => ({ type: 'stat' as const, stat, amount: (config.statGain * config.hours) / society.stats.length })),
      { type: 'energy', amount: -Math.round(config.energy * config.hours * factor(content, state, 'effort')) }
    ],
    { content }
  )
  return {
    ...after,
    // Arriving late still keeps him until the meeting is over.
    time: after.time + (society.startHour + config.hours - date.hour),
    societyMeetings: [...after.societyMeetings, societyMeetingKey(id, date.dayIndex)]
  }
}

/** How many of a society's meetings he has been to. */
export function meetingsAttended(state: Pick<GameState, 'societyMeetings'>, societyId: string): number {
  return state.societyMeetings.filter((key) => key.startsWith(`${societyId}:`)).length
}

/**
 * What the next meeting of a society he goes to will be: which of his it is, what it is about, and the adult event it
 * is, if it is one. Counted by his own meetings, so that he misses nothing by missing a week.
 */
export function nextMeeting(content: ContentPack, state: Pick<GameState, 'societyMeetings'>, societyId: string): { number: number; topic?: string; event?: AdultEvent } {
  const society = societyOf(content, societyId)
  const number = meetingsAttended(state, societyId) + 1
  return { number, topic: society?.syllabus[number - 1], event: society?.adultEvents.find((event) => event.meeting === number) }
}

/**
 * How a society's night goes for those at it: the setup and the direction it is told with, and who of them nothing
 * holds back, who are the scene after it. Everyone is free but whoever the night holds to her own wishes, who leaves
 * once it is set up; one of those he has been to bed with before is free too, and the night is told the way written
 * for her.
 */
export function eventGate(state: GameState, event: AdultEvent, presentIds: string[]): { intro: Intro; direction: string; free: string[] } {
  let { intro, direction } = event
  const held: string[] = []
  for (const reserved of event.reserved) {
    if (!presentIds.includes(reserved.loveInterestId)) continue
    if (timesIntimate(state, reserved.loveInterestId) > 0) {
      if (reserved.ifIntimate) ({ intro, direction } = reserved.ifIntimate)
    } else held.push(reserved.loveInterestId)
  }
  return { intro, direction, free: presentIds.filter((id) => !held.includes(id)) }
}


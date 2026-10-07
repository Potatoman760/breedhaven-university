import type { ContentPack, CourierNote, GameState, Proposal } from '../model'
import { acceptProposal, allFree, attendees, describeWhen, proposeMeeting, upcomingAppointments } from './appointments'
import { toDate } from './calendar'
import { appealLevel } from './stats'

// About 600 tokens of the exchange are shown to a character, at four characters a token.
export const COURIER_HISTORY_CHARS = 2400
// Nobody writes unprompted to someone they barely know, unless something about him has caught their eye.
const WRITES_AT_AFFECTION = 15
// The daily chance someone writes: a little always, more for appeal and for closeness.
const BASE_CHANCE = 0.04
const CHANCE_PER_APPEAL = 0.1
const CHANCE_AT_FULL_AFFECTION = 0.35
const MAX_CHANCE = 0.5
// Not before anyone is up.
const FIRST_ROUND_HOUR = 9

// How strongly she has to feel before she offers her Chats without being asked.
const OFFERS_AT_AFFECTION = 60
const OFFERS_AT_DESIRE = 50

/** Whether the player can message her: she has given him her Chats. */
export function hasContact(state: GameState, loveInterestId: string): boolean {
  return state.contacts.includes(loveInterestId)
}

/** Records that she has given the player her Chats. */
export function giveContact(state: GameState, loveInterestId: string): GameState {
  return state.contacts.includes(loveInterestId) ? state : { ...state, contacts: [...state.contacts, loveInterestId] }
}

/**
 * Whether she is taken enough with the player to give him her Chats unasked: he is just
 * what she admires, or she already wants him or is fond of him.
 */
export function offersContact(content: ContentPack, state: GameState, loveInterestId: string): boolean {
  const li = content.loveInterests.find((c) => c.id === loveInterestId)
  const rel = state.relationships[loveInterestId]
  if (!li || !rel || hasContact(state, loveInterestId)) return false
  const scale = content.relationships.meterMax / 100
  return appealLevel(state, li) === 2 || rel.affection >= OFFERS_AT_AFFECTION * scale || rel.desire >= OFFERS_AT_DESIRE * scale
}

export function courierThread(state: GameState, loveInterestId: string): CourierNote[] {
  return state.courier[loveInterestId] ?? []
}

export function addNote(state: GameState, loveInterestId: string, note: Omit<CourierNote, 'time'>): GameState {
  return {
    ...state,
    courier: {
      ...state.courier,
      [loveInterestId]: [...courierThread(state, loveInterestId), { ...note, time: state.time }]
    }
  }
}

/** Notes from love interests the player hasn't opened: from one of them, or from all. */
export function unreadNotes(state: GameState, loveInterestId?: string): number {
  const threads = loveInterestId ? [courierThread(state, loveInterestId)] : Object.values(state.courier)
  return threads.flat().filter((note) => !note.read).length
}

export function markRead(state: GameState, loveInterestId: string): GameState {
  if (unreadNotes(state, loveInterestId) === 0) return state
  return {
    ...state,
    courier: { ...state.courier, [loveInterestId]: courierThread(state, loveInterestId).map((n) => ({ ...n, read: true })) }
  }
}

/** Whether an invitation sent earlier can still be taken up: its time ahead, and everyone still free. */
export function inviteStands(content: ContentPack, state: GameState, proposal: Proposal): boolean {
  return proposal.time > state.time && allFree(content, state, attendees(proposal), proposal.time, proposal.hours)
}

/**
 * Answers the invitation in the given note of a thread. Accepting puts it on the calendar,
 * unless its time has passed or been taken since, in which case it lapses.
 */
export function answerInvite(
  content: ContentPack,
  state: GameState,
  loveInterestId: string,
  index: number,
  accept: boolean
): GameState {
  const thread = courierThread(state, loveInterestId)
  const note = thread[index]
  if (!note?.proposal || note.answer) return state
  const stands = inviteStands(content, state, note.proposal)
  const answer = !accept ? 'declined' : stands ? 'accepted' : 'lapsed'
  const booked = answer === 'accepted' ? acceptProposal(state, note.proposal) : state
  return {
    ...booked,
    courier: { ...booked.courier, [loveInterestId]: thread.map((n, i) => (i === index ? { ...n, answer } : n)) }
  }
}

/**
 * The recent exchange with a love interest, oldest first, as lines for a prompt. Takes the
 * newest notes that fit the budget; an invitation is shown with what became of it.
 */
export function courierExcerpt(
  content: ContentPack,
  state: GameState,
  loveInterestId: string,
  budgetChars = COURIER_HISTORY_CHARS
): string[] {
  const them = content.loveInterests.find((li) => li.id === loveInterestId)?.name.split(' ')[0] ?? loveInterestId
  const lines: string[] = []
  let used = 0
  const thread = courierThread(state, loveInterestId)
  for (let i = thread.length - 1; i >= 0; i--) {
    const note = thread[i]
    const plan = note.proposal
      ? ` [invitation: ${note.proposal.title}, ${describeWhen(content, note.proposal.time)}; ${note.answer ?? 'not yet answered'}]`
      : ''
    const line = `${note.from === 'player' ? state.player.name : them}: ${note.text}${plan}`
    used += line.length
    if (lines.length > 0 && used > budgetChars) break
    lines.unshift(line)
  }
  return lines
}

/** A repeatable number in [0, 1) for one love interest on one day of one game. */
function roll(seed: number, dayIndex: number, index: number): number {
  let x = (seed ^ Math.imul(dayIndex + 1, 0x9e3779b1) ^ Math.imul(index + 1, 0x7f4a7c15)) >>> 0
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0
  return ((x ^ (x >>> 16)) >>> 0) / 0x100000000
}

/** The chance a love interest writes to the player unprompted on a given day. Zero for someone with no reason to. */
export function chanceOfWriting(content: ContentPack, state: GameState, loveInterestId: string): number {
  const li = content.loveInterests.find((c) => c.id === loveInterestId)
  const rel = state.relationships[loveInterestId]
  // She can't write to someone she hasn't given her Chats to.
  if (!li || !rel || !hasContact(state, loveInterestId)) return 0
  const level = appealLevel(state, li)
  if (level === 0 && rel.affection < WRITES_AT_AFFECTION) return 0
  // Someone waiting on an answer, or with a plan already, doesn't write again.
  const waiting = courierThread(state, loveInterestId).some((n) => n.proposal && !n.answer)
  const planned = upcomingAppointments(state).some((a) => attendees(a).includes(loveInterestId))
  if (waiting || planned) return 0
  const closeness = rel.affection / content.relationships.meterMax
  return Math.min(MAX_CHANCE, BASE_CHANCE + CHANCE_PER_APPEAL * level + CHANCE_AT_FULL_AFFECTION * closeness)
}

/** Whether today's round of unprompted notes is still to be made. */
export function courierRoundDue(content: ContentPack, state: GameState): boolean {
  const date = toDate(content.calendar, state.time)
  return date.dayIndex > state.courierDay && date.hour >= FIRST_ROUND_HOUR
}

/**
 * Today's round: marks it made, and names the love interest who writes to the player
 * unprompted, if any does. At most one a day, so a message stays a pleasure.
 */
export function courierRound(content: ContentPack, state: GameState): { state: GameState; writerId: string | undefined } {
  const { dayIndex } = toDate(content.calendar, state.time)
  const writer = content.loveInterests
    .map((li, index) => ({ id: li.id, luck: roll(state.weatherSeed, dayIndex, index) }))
    .filter(({ id, luck }) => luck < chanceOfWriting(content, state, id))
    .sort((a, b) => a.luck - b.luck)[0]
  return { state: { ...state, courierDay: dayIndex }, writerId: writer?.id }
}

/**
 * An invitation made without the LLM: a time both are free at somewhere the love interest
 * spends their days, and a plain message saying so. Undefined when no time can be found.
 */
export function fallbackInvite(
  content: ContentPack,
  state: GameState,
  loveInterestId: string
): { text: string; proposal: Proposal } | undefined {
  const li = content.loveInterests.find((c) => c.id === loveInterestId)
  const place = li?.schedule.map((s) => s.locationId).find((id) => id !== content.coursework?.locationId)
  const { proposal } = proposeMeeting(content, state, loveInterestId, {
    activity: 'Meet up',
    place: place ?? state.locationId
  })
  if (!li || !proposal) return undefined
  const where = content.locations.find((l) => l.id === proposal.locationId)?.name ?? proposal.locationId
  return {
    proposal,
    text: `${state.player.name}, come and find me at ${where}: ${describeWhen(content, proposal.time)}. Let me know?`
  }
}

import type { Appointment, ContentPack, CourierNote, GameState, Proposal } from '../model'
import { acceptProposal, allFree, attendees, describeWhen, proposeMeeting, upcomingAppointments } from './appointments'
import { toDate } from './calendar'
import { handleOf } from './feed'
import { bondOf, statusOf } from './bonds'
import { addMemory } from './memory'
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

// How strongly she has to feel before she offers her Bloomr without being asked.
const OFFERS_AT_AFFECTION = 60
const OFFERS_AT_DESIRE = 50

/** Whether the player can message her: she has given him her Bloomr. */
export function hasContact(state: GameState, loveInterestId: string): boolean {
  return state.contacts.includes(loveInterestId)
}

/** Records that she has given the player her Bloomr. */
export function giveContact(state: GameState, loveInterestId: string): GameState {
  return state.contacts.includes(loveInterestId) ? state : { ...state, contacts: [...state.contacts, loveInterestId] }
}

/**
 * Those of the given love interests whose Bloomr the player does not have and whose handle
 * is written out in what was said. A handle is only ever said in giving it, so one that
 * turns up in a reply counts as given even if nothing else recorded it.
 */
export function contactsSaid(content: ContentPack, state: GameState, loveInterestIds: string[], text: string): string[] {
  const said = text.toLowerCase()
  return content.loveInterests
    .filter((li) => loveInterestIds.includes(li.id) && !hasContact(state, li.id) && said.includes(handleOf(li).toLowerCase()))
    .map((li) => li.id)
}

/**
 * Whether she is taken enough with the player to give him her Bloomr unasked: he is just
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
 * Whether an invitation can be gone to straight away: it is for today, it has not been
 * turned down or lapsed, and it is not over. One still to be answered must also still stand.
 */
export function canGoToInvite(content: ContentPack, state: GameState, note: Pick<CourierNote, 'proposal' | 'answer'>): boolean {
  const plan = note.proposal
  if (!plan || (note.answer !== undefined && note.answer !== 'accepted')) return false
  if (plan.time + plan.hours <= state.time || toDate(content.calendar, plan.time).dayIndex !== toDate(content.calendar, state.time).dayIndex) return false
  return note.answer === 'accepted' ? planFor(state, plan) !== undefined : inviteStands(content, state, plan)
}

/** The plan on the calendar that an accepted invitation became. */
export function planFor(state: GameState, proposal: Proposal): Appointment | undefined {
  return state.appointments.find((a) => a.loveInterestId === proposal.loveInterestId && a.time === proposal.time && a.locationId === proposal.locationId)
}

// What not turning up for a plan, with no word sent, costs him with each of those who were waiting.
export const STOOD_UP = { affection: -8, trust: -10 } as const

/**
 * Counts up the plans whose time has gone by without his keeping them. Each comes off the
 * calendar, and everyone who was waiting thinks the less of him for it and remembers it.
 * A plan he kept was taken off the calendar when he turned up, and one he cancelled when
 * he said so, so neither is here to be counted.
 */
export function settleAppointments(content: ContentPack, state: GameState): { state: GameState; missed: Appointment[] } {
  const missed = state.appointments.filter((plan) => plan.time + plan.hours <= state.time)
  if (missed.length === 0) return { state, missed }
  const within = (value: number) => Math.max(0, Math.min(content.relationships.meterMax, value))
  let next: GameState = { ...state, appointments: state.appointments.filter((plan) => !missed.includes(plan)) }
  for (const plan of missed) {
    const where = content.locations.find((l) => l.id === plan.locationId)?.name ?? plan.locationId
    for (const id of attendees(plan)) {
      const rel = next.relationships[id]
      if (!rel) continue
      next = { ...next, relationships: { ...next.relationships, [id]: { ...rel, affection: within(rel.affection + STOOD_UP.affection), trust: within(rel.trust + STOOD_UP.trust) } } }
      next = addMemory(next, id, `${state.player.name} never turned up for "${plan.title}" at ${where}, ${describeWhen(content, plan.time)}, and sent no word. You waited for him.`)
    }
  }
  return { state: next, missed }
}

/** The plans still to come that a love interest is part of, soonest first: what he could call off by writing to her. */
export function plansWith(state: GameState, loveInterestId: string): Appointment[] {
  return upcomingAppointments(state).filter((plan) => plan.time > state.time && attendees(plan).includes(loveInterestId))
}

/** What he writes to call a plan off. */
export function cancelText(content: ContentPack, plan: Appointment): string {
  return `I'm sorry, I can't make ${plan.title} on ${describeWhen(content, plan.time)}. Something has come up.`
}

/**
 * Calls a plan off by DM, before it starts. It comes off the calendar, so there is nothing to
 * miss and nothing held against him for missing it; what is left of it is the message saying so,
 * in the thread of everyone in it whose Bloomr he has. The invitation it came from is marked cancelled.
 */
export function cancelAppointment(content: ContentPack, state: GameState, appointmentId: string): GameState {
  const plan = state.appointments.find((a) => a.id === appointmentId)
  if (!plan || plan.time <= state.time) return state
  let next: GameState = { ...state, appointments: state.appointments.filter((a) => a.id !== appointmentId) }
  for (const id of attendees(plan).filter((who) => hasContact(state, who))) {
    const thread = courierThread(next, id).map((note) =>
      note.answer === 'accepted' && note.proposal && note.proposal.loveInterestId === plan.loveInterestId && note.proposal.time === plan.time && note.proposal.locationId === plan.locationId
        ? { ...note, answer: 'cancelled' as const }
        : note
    )
    next = addNote({ ...next, courier: { ...next.courier, [id]: thread } }, id, { from: 'player', text: cancelText(content, plan), read: true })
  }
  return next
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
      ? ` [invitation: ${note.proposal.title}, ${describeWhen(content, note.proposal.time)}; ${note.answer === 'cancelled' ? `accepted, then called off by ${state.player.name}` : (note.answer ?? 'not yet answered')}]`
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
  // She can't write to someone she hasn't given her Bloomr to.
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

// The chance someone whose Bloomr he has writes to him when a scene ends: a little always, more for how she feels and what they are to each other.
const DM_BASE_CHANCE = 0.03
const DM_AT_FULL_AFFECTION = 0.25
const DM_AT_FULL_DESIRE = 0.1
const DM_PER_APPEAL = 0.03
// Lovers who owe each other nothing write more; a girlfriend and up, more again.
const DM_IN_BOND = 0.08
const DM_COMMITTED = 0.15
// Someone who has just been with him has it fresh in mind.
const DM_JUST_SEEN = 0.1
const DM_MAX_CHANCE = 0.6
// Someone whose last message he never answered is slower to write another.
const DM_UNANSWERED = 0.5

/**
 * The chance someone writes to the player as a scene ends, whether or not she was in it.
 * It grows with her affection and her desire, with what he has that she admires, with the
 * arrangement the two of them have, and with having just been with him. Zero for someone
 * whose Bloomr he does not have, and for someone with a message of hers still unread or an
 * invitation still unanswered; halved for someone he left without a reply.
 */
export function chanceOfDm(content: ContentPack, state: GameState, loveInterestId: string, justSeen: string[] = []): number {
  const li = content.loveInterests.find((c) => c.id === loveInterestId)
  const rel = state.relationships[loveInterestId]
  if (!li || !rel || !hasContact(state, loveInterestId)) return 0
  const thread = courierThread(state, loveInterestId)
  if (thread.some((n) => n.from === 'them' && (!n.read || (n.proposal && !n.answer)))) return 0
  const max = content.relationships.meterMax
  const status = statusOf(content, bondOf(state, loveInterestId))
  const chance =
    DM_BASE_CHANCE +
    DM_AT_FULL_AFFECTION * Math.max(0, rel.affection / max) +
    DM_AT_FULL_DESIRE * Math.max(0, rel.desire / max) +
    DM_PER_APPEAL * appealLevel(state, li) +
    (status ? (status.committed ? DM_COMMITTED : DM_IN_BOND) : 0) +
    (justSeen.includes(loveInterestId) ? DM_JUST_SEEN : 0)
  const unanswered = thread.length > 0 && thread[thread.length - 1].from === 'them'
  return Math.min(DM_MAX_CHANCE, chance) * (unanswered ? DM_UNANSWERED : 1)
}

/**
 * Who writes to the player as a scene ends, if anyone does. Everyone whose Bloomr he has
 * takes her own chance; of those it comes up for, the one it came up for most surely
 * writes. One message at most, and the same answer every time for the same moment of the same game.
 */
export function sceneEndWriter(content: ContentPack, state: GameState, justSeen: string[] = []): string | undefined {
  return content.loveInterests
    .map((li, index) => ({ id: li.id, luck: roll(state.weatherSeed, 100000 + state.time, index), chance: chanceOfDm(content, state, li.id, justSeen) }))
    .filter(({ luck, chance }) => luck < chance)
    .sort((a, b) => a.luck / a.chance - b.luck / b.chance)[0]?.id
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

// A DM is written between these, so that anything the LLM says to itself around it can be told from the message and dropped.
export const DM_OPEN = '<dm>'
export const DM_CLOSE = '</dm>'
// How a paragraph of working-out reads, as against something she would send.
const PLANNING = /\b(last message|the conversation|the exchange|would (?:respond|reply|say|answer)|should (?:respond|reply|say|answer)|i (?:should|need to|will|'ll) (?:respond|reply|write|keep|call)|let me|in character)\b/i

/**
 * The message itself out of what the LLM wrote for a DM. What is between the tags is the
 * message. Where the tags were left off, a reply in several paragraphs whose earlier ones
 * are the LLM working out what to say (they talk about her by name, or about the
 * conversation) is cut down to its last paragraph, which is what she sends.
 */
export function messageText(reply: string, ownName: string): string {
  const open = reply.toLowerCase().lastIndexOf(DM_OPEN)
  if (open >= 0) {
    const rest = reply.slice(open + DM_OPEN.length)
    const close = rest.toLowerCase().indexOf(DM_CLOSE)
    const inside = (close >= 0 ? rest.slice(0, close) : rest).trim()
    if (inside !== '') return inside
  }
  const untagged = reply.replace(/<\/?dm>/gi, '').trim()
  const paragraphs = untagged.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p !== '')
  if (paragraphs.length < 2) return untagged
  const first = ownName.trim().split(/\s+/)[0]
  const named = first ? new RegExp(`\\b${first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i') : undefined
  const planning = paragraphs.slice(0, -1).some((p) => PLANNING.test(p) || named?.test(p))
  return planning ? paragraphs[paragraphs.length - 1] : untagged
}

import type { CalendarEvent, ContentPack, GameState, Intro, Society } from '../model'
import { toDate } from './calendar'
import { eventDay, eventsOn } from './events'
import { addMemory } from './memory'
import { meet } from './scene'
import { t } from '../i18n'

/**
 * The societies' fair: a day or two on which every society has a table, staffed by its students, for him to walk round.
 * Saying hello to someone there costs nothing and is meeting her; stopping to talk is an hour's scene at the table. Its
 * first day holds his day, as orientation does, until he has been.
 */

// Kept in the save: that he has been to the fair, each table he has stopped at (and been given its freebie), and the
// rival tables' scene once it has been seen.
export const FAIR_VISITED = 'fair-visited'
export const fairTableFlag = (societyId: string) => `fair-table:${societyId}`
export const FAIR_RIVALRY = 'fair-rivalry'
// A hello is a society's pitch, so it is kept per booth: one who stands at two tables says each of theirs. Someone who
// wanders the fair is a booth of her own.
const helloFlag = (id: string, booth: string) => `fair-hello:${booth}:${id}`

/** Whether she has said hello to him at this booth already (a society's table, or her own if she wanders the fair). */
export function saidHello(state: Pick<GameState, 'flags'>, id: string, booth = id): boolean {
  return state.flags[helloFlag(id, booth)] === true
}

/** The fair's event, while it is on and its tables are out: from its hour on each of its days, for as long as it keeps. */
export function fairNow(content: ContentPack, state: Pick<GameState, 'time'> & Partial<GameState>): CalendarEvent | undefined {
  const fairId = content.societies?.fairId
  const event = fairId ? eventsOn(content, state as GameState).find((one) => one.id === fairId) : undefined
  if (!event || event.startHour === undefined) return event
  const { hour } = toDate(content.calendar, state.time)
  return hour >= event.startHour && hour < event.startHour + (event.hours ?? 1) ? event : undefined
}

/** The fair's event, when it is on today and has yet to open: the time it does. */
export function fairOpensLater(content: ContentPack, state: GameState): { event: CalendarEvent; at: number } | undefined {
  const fairId = content.societies?.fairId
  const event = fairId ? eventsOn(content, state).find((one) => one.id === fairId) : undefined
  if (!event || event.startHour === undefined) return undefined
  const { hour } = toDate(content.calendar, state.time)
  return hour < event.startHour ? { event, at: state.time + (event.startHour - hour) } : undefined
}

/** The hour the fair packs up today. */
export function fairCloses(event: CalendarEvent): number {
  return (event.startHour ?? 0) + (event.hours ?? 1)
}

/**
 * Who is at a society's table now. Each student stands at a table of hers all the while the fair is on; one who belongs
 * to two takes turns at them, half a day at each, so that coming back finds someone else there.
 */
export function atTable(content: ContentPack, state: GameState, societyId: string): string[] {
  const event = fairNow(content, state)
  if (!event) return []
  const societies = content.societies!.societies
  const day = (eventDay(content, event, state.time) ?? 1) - 1
  const { hour } = toDate(content.calendar, state.time)
  const half = hour < (event.startHour ?? 0) + (event.hours ?? 1) / 2 ? 0 : 1
  const turn = day * 2 + half
  const society = societies.find((one) => one.id === societyId)
  const students = (society?.memberIds ?? []).filter((id) => {
    const hers = societies.filter((one) => one.memberIds.includes(id))
    return hers[turn % hers.length]?.id === societyId
  })
  // Its sponsor stands at its table all the while.
  return society?.sponsorId ? [...students, society.sponsorId] : students
}

/** Whether someone is at the fair now: at a table, or one of those who wander it. */
export function atFair(content: ContentPack, state: GameState, id: string): boolean {
  if (!fairNow(content, state)) return false
  const fair = content.societies?.fair
  if (fair?.visitors.some((visitor) => visitor.id === id)) return true
  return (content.societies?.societies ?? []).some((society) => (society.memberIds.includes(id) || society.sponsorId === id) && atTable(content, state, society.id).includes(id))
}

/** Whether the fair is holding his day: it is on, it is its first day, and he has not been yet. */
export function fairDue(content: ContentPack, state: GameState): boolean {
  const event = fairNow(content, state)
  return event !== undefined && eventDay(content, event, state.time) === 1 && !state.flags[FAIR_VISITED]
}

export function visitFair(state: GameState): GameState {
  return { ...state, flags: { ...state.flags, [FAIR_VISITED]: true } }
}

/** Stopping at a table: the first time, he is given whatever it gives away. */
export function stopAtTable(content: ContentPack, state: GameState, societyId: string): { state: GameState; gift?: string } {
  if (state.flags[fairTableFlag(societyId)]) return { state }
  const gift = content.societies?.fair?.tables.find((table) => table.societyId === societyId)?.gift
  const flagged = { ...state, flags: { ...state.flags, [fairTableFlag(societyId)]: true } }
  return gift ? { state: { ...flagged, inventory: { ...flagged.inventory, [gift]: (flagged.inventory[gift] ?? 0) + 1 } }, gift } : { state: flagged }
}

/** The hello written for a booth and whoever stands at it now: the one for exactly them, or failing that the fullest one they are all in. */
export function boothHello(content: ContentPack, ids: string[], booth: string): { cast: string[]; lines: string[] } | undefined {
  const hellos = content.societies?.fair?.hellos[booth] ?? []
  const here = new Set(ids)
  const exact = hellos.find((hello) => hello.cast.length === here.size && hello.cast.every((id) => here.has(id)))
  return exact ?? [...hellos].filter((hello) => hello.cast.every((id) => here.has(id))).sort((a, b) => b.cast.length - a.cast.length)[0]
}

/** Whether a booth has a hello for him now: one is written for whoever is there, and one of them has yet to say it here. */
export function helloDue(content: ContentPack, state: GameState, ids: string[], booth: string): boolean {
  const hello = boothHello(content, ids, booth)
  return hello !== undefined && hello.cast.some((id) => !saidHello(state, id, booth))
}

/** Hello from a booth (a society's table, or someone wandering the fair): its lines as a cutscene, with them all on the stage. */
export function helloIntro(content: ContentPack, state: GameState, ids: string[], booth: string): Intro | undefined {
  const fairId = content.societies?.fairId
  const place = content.calendar.events.find((event) => event.id === fairId)?.locationId
  const hello = boothHello(content, ids, booth)
  if (!place || !hello || !helloDue(content, state, ids, booth)) return undefined
  return { speakerId: hello.cast[0], scenes: [{ locationId: place, castIds: ids, backgroundId: fairId, lines: hello.lines }] }
}

/**
 * Saying hello: it is meeting her, she keeps a line of it, and stopping at her table is stopping at it. Nothing else
 * changes, and no time goes by.
 */
export function sayHello(content: ContentPack, state: GameState, id: string, societyId?: string): { state: GameState; gift?: string } {
  const society = content.societies?.societies.find((one) => one.id === societyId)
  const met = meet(content, { ...state, flags: { ...state.flags, [helloFlag(id, societyId ?? id)]: true } }, [id])
  const remembered =
    state.met.includes(id) || !content.loveInterests.some((li) => li.id === id)
      ? met
      : addMemory(met, id, t('game.fair.metMemory', { player: state.player.name, atTable: society !== undefined, society: society?.name.replace(/^the /, '') }), 'fleeting')
  return society ? stopAtTable(content, remembered, society.id) : { state: remembered }
}

/** Hello from a whole booth at once: each there who has yet to say it here has, and the table is stopped at once. */
export function sayHelloAll(content: ContentPack, state: GameState, ids: string[], societyId?: string): { state: GameState; gift?: string } {
  let gift: string | undefined
  let after = state
  for (const id of ids.filter((one) => !saidHello(state, one, societyId ?? one))) {
    const said = sayHello(content, after, id, societyId)
    after = said.state
    gift ??= said.gift
  }
  return { state: after, gift }
}

/** Whether he can stop to talk at a table, or with someone wandering the fair: someone is there, and there is an hour left. */
export function canTalkAtFair(content: ContentPack, state: GameState, ids: string[]): { ok: boolean; reasons: string[] } {
  const event = fairNow(content, state)
  const reasons: string[] = []
  if (!event) reasons.push(t('game.fair.notOn'))
  else if (toDate(content.calendar, state.time).hour + 1 > fairCloses(event)) reasons.push(t('game.fair.packingUp'))
  if (ids.filter((id) => content.loveInterests.some((li) => li.id === id)).length === 0) reasons.push(t('game.fair.nobody'))
  return { ok: reasons.length === 0, reasons }
}

/** Whether the rival tables' scene is due: he has stopped at both, and has not seen it. */
export function rivalryDue(content: ContentPack, state: GameState): Intro | undefined {
  const rivalry = content.societies?.fair?.rivalry
  if (!rivalry || state.flags[FAIR_RIVALRY]) return undefined
  return rivalry.societyIds.every((id) => state.flags[fairTableFlag(id)]) ? rivalry.intro : undefined
}

export function sawRivalry(state: GameState): GameState {
  return { ...state, flags: { ...state.flags, [FAIR_RIVALRY]: true } }
}

/** The societies with a table at the fair, each with where its table is. */
export function fairTables(content: ContentPack): { society: Society; x: number; y: number; gift?: string }[] {
  const societies = content.societies?.societies ?? []
  return (content.societies?.fair?.tables ?? []).flatMap((table) => {
    const society = societies.find((one) => one.id === table.societyId)
    return society ? [{ society, x: table.x, y: table.y, gift: table.gift }] : []
  })
}

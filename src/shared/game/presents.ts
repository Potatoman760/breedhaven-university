import type { CalendarEvent, ContentPack, GameState, Item, LoveInterest, ScenePresent } from '../model'
import { toDate } from './calendar'
import { eventsOn } from './events'

/** The event on now at which every woman he meets brings him a present, if one is. */
export function presentEventNow(content: ContentPack, state: GameState): CalendarEvent | undefined {
  return eventsOn(content, state).find((event) => event.presents)
}

// Kept once she has given hers, for that event in that year: one present each, however often they meet that day.
const givenFlag = (event: CalendarEvent, year: number, id: string) => `present:${event.id}:${year}:${id}`

/**
 * What she brings him: one of the things she likes herself, the same all day for the same game. Something made to
 * please anyone is passed over, as is anything of a kind she dislikes. Nothing when nothing she likes is to be had.
 */
export function presentFrom(content: ContentPack, state: GameState, li: LoveInterest): Item | undefined {
  const has = (item: Item, list: string[]) => item.tags.some((tag) => list.some((entry) => entry.toLowerCase() === tag.toLowerCase()))
  const hers = content.items.filter((item) => !item.lovedByAll && has(item, li.likes) && !has(item, li.dislikes)).sort((a, b) => a.id.localeCompare(b.id))
  if (hers.length === 0) return undefined
  const day = toDate(content.calendar, state.time).dayIndex
  let x = (state.weatherSeed ^ Math.imul(day + 1, 0x9e3779b1)) >>> 0
  for (const char of li.id) x = Math.imul(x ^ char.charCodeAt(0), 0x85ebca6b) >>> 0
  return hers[x % hers.length]
}

/**
 * Those of them meeting him for the first time today, at an event where presents are given: each hands him hers. It
 * goes into his bag, and what each gave is said, for the scene to have her give it.
 */
export function bringPresents(content: ContentPack, state: GameState, ids: string[]): { state: GameState; presents: ScenePresent[] } {
  const event = presentEventNow(content, state)
  if (!event) return { state, presents: [] }
  const year = toDate(content.calendar, state.time).year
  let next = state
  const presents: ScenePresent[] = []
  for (const id of ids.filter((one, i) => ids.indexOf(one) === i)) {
    const li = content.loveInterests.find((one) => one.id === id)
    if (!li || next.flags[givenFlag(event, year, id)]) continue
    const item = presentFrom(content, next, li)
    next = { ...next, flags: { ...next.flags, [givenFlag(event, year, id)]: true } }
    if (!item) continue
    next = { ...next, inventory: { ...next.inventory, [item.id]: (next.inventory[item.id] ?? 0) + 1 } }
    presents.push({ fromId: id, itemId: item.id })
  }
  return { state: next, presents }
}

import type { ContentPack, GameState, WeatherType } from '../model'
import { toDate } from './calendar'

/** A repeatable number in [0, 1) for a given day of a given game. */
function roll(seed: number, dayIndex: number): number {
  let x = (seed ^ Math.imul(dayIndex + 1, 0x9e3779b1)) >>> 0
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0
  return ((x ^ (x >>> 16)) >>> 0) / 0x100000000
}

/**
 * The weather on the day of the given time (defaults to now). It holds all day, depends
 * only on the game's seed and the day, and is drawn by weight from the kinds the month
 * allows. Undefined when the content defines no weather.
 */
export function weatherOn(content: ContentPack, state: GameState, time = state.time): WeatherType | undefined {
  const date = toDate(content.calendar, time)
  const kinds = content.calendar.weather.filter((w) => !w.months || w.months.includes(date.month.id))
  const total = kinds.reduce((sum, w) => sum + w.weight, 0)
  let at = roll(state.weatherSeed, date.dayIndex) * total
  for (const kind of kinds) {
    at -= kind.weight
    if (at < 0) return kind
  }
  return kinds[kinds.length - 1]
}

import type { Background, Location, LoveInterest } from '../model'
import type { GameDate } from './calendar'

/** Whether a weekday/period filter matches the given date. Omitted filters match anything. */
export function matchesWhen(
  when: { weekdays?: string[]; periods?: string[] },
  date: GameDate
): boolean {
  return (
    (when.weekdays === undefined || when.weekdays.includes(date.weekday)) &&
    (when.periods === undefined || when.periods.includes(date.period.id))
  )
}

/** Where the character's schedule puts them right now, if anywhere. */
export function scheduledLocationId(li: LoveInterest, date: GameDate): string | undefined {
  return li.schedule.find((entry) => matchesWhen(entry, date))?.locationId
}

/**
 * The view of a location to show: the preferred one if it exists, else the first made
 * for this period, else the first that isn't tied to a period, else the first of any.
 */
export function backgroundFor(
  location: Location,
  periodId: string,
  preferredId?: string
): Background | undefined {
  const { backgrounds } = location
  return (
    backgrounds.find((b) => b.id === preferredId) ??
    backgrounds.find((b) => b.periods?.includes(periodId)) ??
    backgrounds.find((b) => b.periods === undefined) ??
    backgrounds[0]
  )
}

export function isOpen(location: Location, hour: number): boolean {
  if (!location.open) return true
  const { fromHour, toHour } = location.open
  return fromHour <= toHour ? hour >= fromHour && hour < toHour : hour >= fromHour || hour < toHour
}

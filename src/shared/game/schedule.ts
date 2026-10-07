import type { Background, Light, Location, LoveInterest } from '../model'
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
 * The view of a location to show: the preferred one if it exists; else one named for
 * something going on today (a view called "Midwinter" on Midwinter), whatever the case of
 * the letters; else the first, its default.
 */
export function backgroundFor(location: Location, preferredId?: string, occasions: string[] = []): Background | undefined {
  const today = occasions.map((name) => name.trim().toLowerCase())
  return (
    location.backgrounds.find((b) => b.id === preferredId) ??
    location.backgrounds.find((b) => today.includes(b.name.trim().toLowerCase())) ??
    location.backgrounds[0]
  )
}

/**
 * The picture of a view to show by day or by night: the one drawn for it, or failing that
 * the other, so that a view with any picture at all always shows one.
 */
export function viewImage(view: Pick<Background, 'images'> | undefined, light: Light): string | undefined {
  return view && (view.images[light] ?? Object.values(view.images)[0])
}

/** Whether a view of a location is under a roof: as the view says, or failing that the location. */
export function isIndoors(location: Location | undefined, view: Background | undefined): boolean {
  return view?.indoors ?? location?.indoors ?? false
}

export function isOpen(location: Location, hour: number): boolean {
  if (!location.open) return true
  const { fromHour, toHour } = location.open
  return fromHour <= toHour ? hour >= fromHour && hour < toHour : hour >= fromHour || hour < toHour
}

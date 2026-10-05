import type { CalendarConfig, Month, Period } from '../model'

// Game time is a single integer: hours elapsed since the calendar's start moment.
// Everything here derives the in-world date from that number.

export interface GameDate {
  year: number
  monthIndex: number
  month: Month
  /** Day of the month, counting from 1. */
  day: number
  weekdayIndex: number
  weekday: string
  hour: number
  period: Period
  /** Days elapsed since the first day of the game, counting from 0. */
  dayIndex: number
}

export function daysInYear(cfg: CalendarConfig): number {
  return cfg.months.reduce((total, m) => total + m.days, 0)
}

/** Days from the start of the year to the given date, counting from 0. */
function dayOfYear(cfg: CalendarConfig, monthId: string, day: number): number {
  const monthIndex = cfg.months.findIndex((m) => m.id === monthId)
  if (monthIndex < 0) throw new Error(`Unknown month "${monthId}"`)
  let total = day - 1
  for (let i = 0; i < monthIndex; i++) total += cfg.months[i].days
  return total
}

/** The day index (as in GameDate) of a calendar date. Negative for dates before the game starts. */
export function dayIndexOf(cfg: CalendarConfig, year: number, monthId: string, day: number): number {
  return (
    (year - cfg.start.year) * daysInYear(cfg) +
    dayOfYear(cfg, monthId, day) -
    dayOfYear(cfg, cfg.start.month, cfg.start.day)
  )
}

export function periodAt(cfg: CalendarConfig, hour: number): Period {
  const sorted = [...cfg.periods].sort((a, b) => a.startHour - b.startHour)
  // Hours before the first period's start belong to the last one, which wraps past midnight.
  let current = sorted[sorted.length - 1]
  for (const p of sorted) {
    if (p.startHour <= hour) current = p
  }
  return current
}

export function toDate(cfg: CalendarConfig, time: number): GameDate {
  const hoursFromFirstMidnight = cfg.start.hour + time
  const dayIndex = Math.floor(hoursFromFirstMidnight / cfg.hoursPerDay)
  const hour = hoursFromFirstMidnight % cfg.hoursPerDay

  const yearLength = daysInYear(cfg)
  const daysFromStartYear = dayOfYear(cfg, cfg.start.month, cfg.start.day) + dayIndex
  const year = cfg.start.year + Math.floor(daysFromStartYear / yearLength)

  let dayOfMonth = daysFromStartYear % yearLength
  let monthIndex = 0
  while (dayOfMonth >= cfg.months[monthIndex].days) {
    dayOfMonth -= cfg.months[monthIndex].days
    monthIndex++
  }
  const weekdayIndex = (cfg.startWeekday + dayIndex) % cfg.weekdays.length

  return {
    year,
    monthIndex,
    month: cfg.months[monthIndex],
    day: dayOfMonth + 1,
    weekdayIndex,
    weekday: cfg.weekdays[weekdayIndex],
    hour,
    period: periodAt(cfg, hour),
    dayIndex
  }
}

export function isGameOver(cfg: CalendarConfig, time: number): boolean {
  return toDate(cfg, time).dayIndex >= cfg.lengthDays
}

export function daysRemaining(cfg: CalendarConfig, time: number): number {
  return Math.max(0, cfg.lengthDays - toDate(cfg, time).dayIndex)
}

export function formatTime(date: GameDate): string {
  return `${String(date.hour).padStart(2, '0')}:00`
}

export function formatDate(date: GameDate): string {
  return `${date.weekday}, ${date.day} ${date.month.name}, Year ${date.year}`
}

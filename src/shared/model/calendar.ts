import { z } from 'zod'

export const MonthSchema = z.object({
  id: z.string(),
  name: z.string(),
  days: z.number().int().min(1)
})
export type Month = z.infer<typeof MonthSchema>

/** A named part of the day. Runs from `startHour` until the next period starts, wrapping past midnight. */
export const PeriodSchema = z.object({
  id: z.string(),
  name: z.string(),
  startHour: z.number().int().min(0)
})
export type Period = z.infer<typeof PeriodSchema>

/**
 * A holiday, festival or other dated happening. Authored ones live in the calendar
 * config; ones the LLM invents during a playthrough live in the game state.
 */
export const CalendarEventSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(''),
  /** Month id and day of the month on which the event starts. */
  month: z.string(),
  day: z.number().int().min(1),
  /** Omitted for events that recur every year. */
  year: z.number().int().optional(),
  durationDays: z.number().int().min(1).default(1),
  locationId: z.string().optional(),
  /** True for events invented by the LLM. */
  generated: z.boolean().default(false)
})
export type CalendarEvent = z.infer<typeof CalendarEventSchema>

/** A kind of weather a day can have. Each day's weather is drawn from the kinds its month allows. */
export const WeatherTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Told to the AI so characters can remark on it. */
  description: z.string().default(''),
  /** Name of a built-in weather icon: clear, cloudy, rain, storm, fog, snow or wind. */
  icon: z.string().default('cloudy'),
  /** How likely it is relative to the other kinds. */
  weight: z.number().positive().default(1),
  /** Month ids it can occur in. Omitted means any month. */
  months: z.array(z.string()).optional()
})
export type WeatherType = z.infer<typeof WeatherTypeSchema>

export const CalendarConfigSchema = z.object({
  months: z.array(MonthSchema).min(1),
  weekdays: z.array(z.string()).min(1),
  hoursPerDay: z.number().int().min(1).default(24),
  periods: z.array(PeriodSchema).min(1),
  /** The in-world moment the game begins. */
  start: z.object({
    year: z.number().int(),
    month: z.string(),
    day: z.number().int().min(1),
    hour: z.number().int().min(0).default(0)
  }),
  /** Index into `weekdays` of the first day of the game. */
  startWeekday: z.number().int().min(0).default(0),
  /** How many days the game runs for. */
  lengthDays: z.number().int().min(1),
  events: z.array(CalendarEventSchema).default([]),
  weather: z.array(WeatherTypeSchema).default([])
})
export type CalendarConfig = z.infer<typeof CalendarConfigSchema>

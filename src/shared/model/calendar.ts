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
  startHour: z.number().int().min(0),
  /** Whether it is light or dark out: which of a place's two pictures is shown. */
  light: z.enum(['day', 'night']).default('day')
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
  /** No classes meet while it lasts: a holiday, or a break between terms. */
  noClasses: z.boolean().default(false),
  /** True for events invented by the LLM. */
  generated: z.boolean().default(false)
})
export type CalendarEvent = z.infer<typeof CalendarEventSchema>

/** A kind of weather a day can have. Each day's weather is drawn from the kinds its month allows. */
/** What a kind of weather looks like on the stage. */
export const WEATHER_EFFECTS = ['none', 'rain', 'storm', 'snow', 'mist', 'wind', 'motes'] as const
export type WeatherEffect = (typeof WEATHER_EFFECTS)[number]

export const WeatherTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Told to the AI so characters can remark on it. */
  description: z.string().default(''),
  /** Name of a built-in weather icon: clear, cloudy, rain, storm, fog, snow or wind. */
  icon: z.string().default('cloudy'),
  /**
   * What is drawn over outdoor views while it lasts: rain, a storm with lightning, snow,
   * drifting mist, leaves on the wind, or motes hanging in still air.
   */
  effect: z.enum(WEATHER_EFFECTS).default('none'),
  /**
   * How likely it is in each month, by month id, relative to the other kinds: written as
   * the percentage of days, though any numbers in proportion will do. A month left out
   * never has it. When given, it takes the place of `weight` and `months`.
   */
  chance: z.record(z.string(), z.number().min(0)).optional(),
  /** How likely it is relative to the other kinds, the same in every month it occurs in. */
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

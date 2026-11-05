import { z } from 'zod'
import { EventPartSchema, TRAVELS, TripGainSchema } from './calendar'

/** A day of the year a getaway can be booked from or until: a month by id, and a day of it. */
const MonthDaySchema = z.object({ month: z.string(), day: z.number().int().min(1) })

/**
 * A weekend away he books himself, from the Trips app on his phone: a place, what it costs a head (his own included), how
 * many he may take and how close each must be to say yes, the weeks of the year it can be had, and its program, the
 * same parts an event has. Booked for a weekend, it becomes an event of his own on those days, played as a trip is.
 */
export const GetawaySchema = z.object({
  id: z.string(),
  name: z.string(),
  locationId: z.string(),
  /** What it is, for the player, and for the LLM while it is on. */
  description: z.string().default(''),
  /** A few words of what the place is, for the lines asked of the women along: "a seaside resort town on the coast". */
  summary: z.string(),
  /** How many days it lasts, from the weekday it begins on. */
  days: z.number().int().min(1).default(2),
  /** The weekday it begins on, one of the calendar's `weekdays`. */
  startsOn: z.string().default('Saturday'),
  /** The first and last days of the year it can begin on. */
  from: MonthDaySchema,
  until: MonthDaySchema,
  most: z.number().int().min(1).max(3).default(2),
  price: z.number().int().min(0),
  /** What each woman along feels for being taken, given as it begins: the bigger the trip, the more. */
  gain: TripGainSchema,
  minStage: z.string().default('friend'),
  /** The road the drives there and home go along, as an event's `road`: for an airship, the sky it flies through. */
  road: z.string().optional(),
  /** How it is gone to: by car, or by airship. */
  travel: z.enum(TRAVELS).optional(),
  /** The hour he is home on its last day. */
  homeAt: z.number().int().min(0).optional(),
  /** The listing he books from: a line about the place, what is on, and how well it is spoken of, out of five. */
  blurb: z.string().default(''),
  highlights: z.array(z.string()).default([]),
  rating: z.number().min(0).max(5).optional(),
  /** What happens on it, in order: each part is for him and those he took. */
  program: z.array(EventPartSchema).min(1)
})
export type Getaway = z.infer<typeof GetawaySchema>

/**
 * The weekend getaways, and the DM that tells him of them: who sends it, on which day of term (counted from 1) and from
 * which hour, and what it says. `{player}` is filled in. The app is there before it; the DM is only a reminder.
 */
export const GetawaysSchema = z.object({
  notice: z.object({ fromId: z.string(), day: z.number().int().min(1), hour: z.number().int().min(0), text: z.string() }).optional(),
  trips: z.array(GetawaySchema).default([])
})
export type Getaways = z.infer<typeof GetawaysSchema>

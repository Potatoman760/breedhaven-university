import { z } from 'zod'
import { StatSchema } from './stats'

/** One view of a location: a spot within it, or the same spot at a different time of day. */
export const BackgroundSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Image path inside the content pack. */
  image: z.string(),
  /** Period ids this view is meant for. Omitted means any time. */
  periods: z.array(z.string()).optional()
})
export type Background = z.infer<typeof BackgroundSchema>

export const LocationSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(''),
  /**
   * Views of the location. The one shown by default is the first made for the current
   * period, or failing that the first that isn't tied to any period.
   */
  backgrounds: z.array(BackgroundSchema).default([]),
  /** Open from `fromHour` up to but not including `toHour`; may wrap past midnight. Omitted means always open. */
  open: z
    .object({
      fromHour: z.number().int().min(0),
      toHour: z.number().int().min(0)
    })
    .optional(),
  /** Stats this is a good place to work on: what a made-up activity here is likely to raise. */
  trains: z.array(StatSchema).default([])
})
export type Location = z.infer<typeof LocationSchema>

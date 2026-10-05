import { z } from 'zod'
import { ConditionSchema, EffectSchema } from './condition'

export const AvailabilitySchema = z.object({
  /** Weekday names; omitted means any day. */
  weekdays: z.array(z.string()).optional(),
  /** Period ids; omitted means any period. */
  periods: z.array(z.string()).optional(),
  /** Earliest and latest hour of the day the activity may start. */
  earliestHour: z.number().int().min(0).optional(),
  latestHour: z.number().int().min(0).optional()
})
export type Availability = z.infer<typeof AvailabilitySchema>

export const ActivitySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(''),
  durationHours: z.number().int().min(1),
  /** Where it happens; the player moves here on performing it. */
  locationId: z.string().optional(),
  tags: z.array(z.string()).default([]),
  availability: AvailabilitySchema.default({}),
  requirements: z.array(ConditionSchema).default([]),
  effects: z.array(EffectSchema).default([]),
  withLoveInterest: z.enum(['none', 'optional', 'required']).default('none'),
  /** Marks the scene it belongs to as NSFW, routing its AI calls to the NSFW LLM. */
  nsfw: z.boolean().default(false)
})
export type Activity = z.infer<typeof ActivitySchema>

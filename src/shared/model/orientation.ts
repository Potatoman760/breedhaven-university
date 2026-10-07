import { z } from 'zod'

/** One part of orientation day: somewhere to be, for a while, in company. */
export const OrientationStepSchema = z.object({
  id: z.string(),
  name: z.string(),
  locationId: z.string(),
  /** It doesn't begin before this hour; the player is carried forward to it if early. */
  startHour: z.number().int().min(0),
  hours: z.number().int().min(1).default(2),
  /** Narration that opens the scene. */
  description: z.string().default(''),
  /** Told to the LLM: what is going on, and what the scene is for. */
  direction: z.string().default(''),
  /**
   * The love interests the player is thrown together with. Left out, they are dealt out
   * across the steps, those he shares no class with first, so he meets everyone.
   */
  castIds: z.array(z.string()).optional()
})
export type OrientationStep = z.infer<typeof OrientationStepSchema>

/**
 * An induction the player has to go through before anything else: on its day there are
 * no classes, and nothing else can be done until every step has been attended, in order.
 */
export const OrientationSchema = z.object({
  /** The day of the game it falls on, counting from 1. */
  day: z.number().int().min(1).default(1),
  steps: z.array(OrientationStepSchema).min(1)
})
export type Orientation = z.infer<typeof OrientationSchema>

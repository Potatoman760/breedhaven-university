import { z } from 'zod'
import { ModifierSchema } from './modifier'
import { MeterSchema } from './relationship'

// Conditions and effects that omit `loveInterestId` target the love interest in
// context: the activity partner, or the character a secret belongs to.

export const ConditionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('stat'),
    stat: z.string(),
    min: z.number().optional(),
    max: z.number().optional()
  }),
  z.object({ type: z.literal('money'), min: z.number() }),
  z.object({ type: z.literal('energy'), min: z.number() }),
  z.object({
    type: z.literal('meter'),
    loveInterestId: z.string().optional(),
    meter: MeterSchema,
    min: z.number()
  }),
  z.object({
    type: z.literal('stage'),
    loveInterestId: z.string().optional(),
    /** Stage id; passes at this stage or any later one. */
    min: z.string()
  }),
  z.object({ type: z.literal('flag'), flag: z.string(), value: z.boolean().default(true) }),
  /** Passes while the love interest is (or, with `value: false`, is not) carrying the player's child. */
  z.object({ type: z.literal('pregnant'), loveInterestId: z.string().optional(), value: z.boolean().default(true) }),
  /** Passes while the given authored calendar event is under way. */
  z.object({ type: z.literal('event'), eventId: z.string() }),
  z.object({
    type: z.literal('day'),
    /** Day of the game, counting from 1. */
    min: z.number().int().optional(),
    max: z.number().int().optional()
  })
])
export type Condition = z.infer<typeof ConditionSchema>

export const EffectSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('stat'), stat: z.string(), amount: z.number() }),
  z.object({ type: z.literal('money'), amount: z.number() }),
  z.object({ type: z.literal('energy'), amount: z.number() }),
  z.object({
    type: z.literal('meter'),
    loveInterestId: z.string().optional(),
    meter: MeterSchema,
    amount: z.number()
  }),
  z.object({ type: z.literal('flag'), flag: z.string(), value: z.boolean().default(true) }),
  z.object({ type: z.literal('unlockCodex'), entryId: z.string() }),
  /** Puts a modifier in force for so many hours: on him, or with `on: 'her'` on the love interest it is used on, who is told `telling` while it lasts. */
  z.object({ type: z.literal('boon'), modifier: ModifierSchema, hours: z.number().int().min(1), on: z.enum(['self', 'her']).default('self'), telling: z.string().optional() }),
  /** Puts something in his bag: what he has brewed or made. */
  z.object({ type: z.literal('item'), itemId: z.string(), count: z.number().int().min(1).default(1) })
])
export type Effect = z.infer<typeof EffectSchema>

import { z } from 'zod'
import { StatSchema } from './stats'

/**
 * Everything a course he has got on in, or something he has drunk or set off, can change. Each is one number of the
 * game, named here, and the code that works that number out asks for it by name. Those marked x multiply it; those
 * marked + or - are added to it or taken from it; `unguarded` simply is or is not.
 */
export const MODIFIER_KINDS = [
  'affection', // x affection gained
  'trust', // x trust gained
  'desire', // x desire gained
  'losses', // x affection and trust lost
  'firstScene', // x affection gained in the first scene he ever has with a woman
  'training', // x training toward a stat (those named in `stats`, or all)
  'marks', // x marks from study and from his focus
  'focus', // x what an hour given to his focus is worth
  'wages', // x what a shift pays
  'prices', // x what a shop asks
  'rent', // x the month's rent
  'keep', // x a child's weekly keep
  'build', // x what a room or its fitting out costs
  'gifts', // x what a gift she takes well is worth
  'effort', // x the energy a class or a shift takes
  'drama', // x the chance a scene is walked in on
  'fertility', // x the chance of a child while she takes something against it
  'recovery', // x the days after a birth before she can conceive again
  'comfort', // + the comfort of the house
  'care', // + how well a child at home can come to do
  'desireGate', // - the desire she needs (only reluctant women, with `only`)
  'unguarded' // what she takes against the Bloom does not count
] as const
export type ModifierKind = (typeof MODIFIER_KINDS)[number]

// Kinds whose amounts are added together; every other is a multiplier.
export const ADDED_KINDS: readonly ModifierKind[] = ['comfort', 'care', 'desireGate']

export const ModifierSchema = z.object({
  kind: z.enum(MODIFIER_KINDS),
  amount: z.number().default(1),
  /** For `training`: the stats it applies to. Left out, all of them. */
  stats: z.array(StatSchema).optional(),
  /** For `desireGate`: only women whose nature holds them back. */
  only: z.enum(['reluctant']).optional()
})
export type Modifier = z.infer<typeof ModifierSchema>

/** A modifier in force for a while: something he drank, or a charm he set off. */
export const BoonSchema = ModifierSchema.extend({
  /** The game time it lasts until. */
  until: z.number().int(),
  /** What it came from, as he would name it: "Heartsease draught". */
  source: z.string(),
  /** The love interest it is on, when it is on one of them and not on him. */
  targetId: z.string().optional(),
  /** Told to her while it lasts, in her own prompt. */
  telling: z.string().optional()
})
export type Boon = z.infer<typeof BoonSchema>

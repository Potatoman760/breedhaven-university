import { z } from 'zod'
import { EffectSchema } from './condition'
import { ModifierSchema } from './modifier'

/**
 * What a sight lets him tell about a woman. The game knows what each of these means; a skill in the content only says
 * which one it is.
 */
export const SKILL_GRANTS = ['cycle', 'contraception', 'desire', 'comfort', 'tastes', 'schedule'] as const
export type SkillGrant = (typeof SKILL_GRANTS)[number]

/**
 * Something he can make or set off, and then has to wait to do again. He does not cast: he brews, or readies a thing
 * at the bench and triggers it. What comes of it is its effects, a thing put in his bag among them.
 */
export const AbilitySchema = z.object({
  /** What doing it is called, on its button: "Brew", "Charge". */
  label: z.string(),
  effects: z.array(EffectSchema).min(1),
  /** How many days before it can be done again. */
  cooldownDays: z.number().int().min(1),
  /** Whether it is done for himself, or on a woman he is with. */
  on: z.enum(['self', 'her']).default('self')
})
export type Ability = z.infer<typeof AbilitySchema>

/**
 * Something he learns by getting far enough in a course. It is one of three things: a sight (`grants`), something
 * that changes one of the game's numbers for good (`passive`), or something he can make or set off (`ability`).
 */
export const SkillSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    /** Told to the player: what it lets him do. */
    description: z.string(),
    /** The subject that teaches it, by its catalogue code. */
    code: z.string(),
    /** The year of the course that teaches it, where the subject has more than one. Left out, any course of the subject does. */
    level: z.number().int().min(1).max(5).optional(),
    /** The marks he must have in such a course to have it. */
    at: z.number().min(0).default(30),
    grants: z.enum(SKILL_GRANTS).optional(),
    passive: ModifierSchema.optional(),
    ability: AbilitySchema.optional(),
    /** What it is worth to him in the Undercroft, beside what it is above: some courses have a use down there too. */
    below: ModifierSchema.optional()
  })
  .refine((skill) => [skill.grants, skill.passive, skill.ability].filter((one) => one !== undefined).length === 1, 'A skill is a sight, a passive or an ability: one of them, and only one.')
export type Skill = z.infer<typeof SkillSchema>

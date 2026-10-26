import { z } from 'zod'
import { EffectSchema } from './condition'
import { ModifierSchema } from './modifier'
import { t } from '../i18n'

/**
 * What a sight lets him tell about a woman. The game knows what each of these means; a skill in the content only says
 * which one it is.
 */
export const SKILL_GRANTS = ['cycle', 'contraception', 'comfort', 'tastes', 'odds'] as const
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
/**
 * What a skill becomes once he is further into its course: its second level. It says what it does now, and changes
 * what it must: a stronger modifier, an ability ready sooner, or a second sight beside its own.
 */
export const SkillUpgradeSchema = z.object({
  /** The marks it takes. */
  at: z.number().min(0).default(70),
  description: z.string(),
  passive: ModifierSchema.optional(),
  cooldownDays: z.number().int().min(1).optional(),
  alsoGrants: z.enum(SKILL_GRANTS).optional(),
  /** A second modifier, beside the first: something more it does, not the same done better. */
  alsoPassive: ModifierSchema.optional()
})
export type SkillUpgrade = z.infer<typeof SkillUpgradeSchema>

export const SkillSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    /** Told to the player: what it lets him do. */
    description: z.string(),
    /** The subject that teaches it, by its catalogue code. */
    code: z.string(),
    /** The course that teaches it, by id. */
    courseId: z.string(),
    /** The marks he must have in such a course to have it. */
    at: z.number().min(0).default(30),
    grants: z.enum(SKILL_GRANTS).optional(),
    passive: ModifierSchema.optional(),
    ability: AbilitySchema.optional(),
    /** What it is worth to him in the Undercroft, beside what it is above: some courses have a use down there too. */
    below: ModifierSchema.optional(),
    upgrade: SkillUpgradeSchema.optional()
  })
  .refine((skill) => [skill.grants, skill.passive, skill.ability].filter((one) => one !== undefined).length === 1, { error: () => t('game.skill.oneKind') })
export type Skill = z.infer<typeof SkillSchema>

/** A skill as he has it: at its first level, or at its second with what that changes. */
export type LearntSkill = Skill & { level: 1 | 2 }

import { z } from 'zod'

/** A stretch of a pregnancy, by how far along it is. */
export const PregnancyStageSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** It begins once this fraction of the pregnancy has passed, from 0 up to 1. */
  from: z.number().min(0).max(1),
  /** Others can see it. From here she wears her pregnant outfit, if she has one. */
  showing: z.boolean().default(false),
  /** Told to the character: how it feels and what it changes for her. */
  description: z.string().default('')
})
export type PregnancyStage = z.infer<typeof PregnancyStageSchema>

/** The rules of pregnancy. A content pack without this has none. */
export const PregnancyConfigSchema = z.object({
  /** The chance that a day on which the two have sex leaves her with child. */
  chance: z.number().min(0).max(1).default(0.5),
  /** How long it lasts, in days. A love interest can override it. */
  lengthDays: z.number().int().min(1).default(56),
  /** Days after a birth before she can conceive again. */
  recoveryDays: z.number().int().min(0).default(7),
  /** The chance a child is a daughter. */
  daughterChance: z.number().min(0).max(1).default(0.5),
  stages: z.array(PregnancyStageSchema).min(1)
})
export type PregnancyConfig = z.infer<typeof PregnancyConfigSchema>

/** A pregnancy under way. */
export const PregnancySchema = z.object({
  /** Game time (hours since start) of conception and of the birth to come. */
  conceivedAt: z.number().int().min(0),
  dueAt: z.number().int().min(0)
})
export type Pregnancy = z.infer<typeof PregnancySchema>

export const ChildSchema = z.object({
  motherId: z.string(),
  bornAt: z.number().int().min(0),
  daughter: z.boolean()
})
export type Child = z.infer<typeof ChildSchema>

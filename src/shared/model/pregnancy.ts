import { z } from 'zod'

/** Names to give a child, a daughter's and a son's. */
export const ChildNamesSchema = z.object({
  daughters: z.array(z.string()).default([]),
  sons: z.array(z.string()).default([])
})
export type ChildNames = z.infer<typeof ChildNamesSchema>

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
  /** The same chance for a woman who is taking something against it, as most do until they choose to stop. */
  birthControlChance: z.number().min(0).max(1).default(0.2),
  /** Her cycle: how many days it runs, and how many of them at its start she bleeds, when she cannot conceive. No days, and nobody has one. */
  cycleDays: z.number().int().min(1).default(28),
  periodDays: z.number().int().min(0).default(4),
  /** How long it lasts, in days. A love interest can override it. */
  lengthDays: z.number().int().min(1).default(56),
  /** Days after a birth before she can conceive again. */
  recoveryDays: z.number().int().min(0).default(7),
  /** The chance a child is a daughter. */
  daughterChance: z.number().min(0).max(1).default(0.5),
  /** Where children are born, and the view of it the birth is set in. */
  birthLocationId: z.string(),
  birthViewId: z.string().optional(),
  /** How long he is there for. */
  birthHours: z.number().int().min(1).default(2),
  /** How many days before she is due the hour is set and she tells him of it. */
  birthNoticeDays: z.number().int().min(0).default(3),
  /** Names a mother falls back on when she has none of her own left to give. */
  names: ChildNamesSchema.prefault({}),
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
  daughter: z.boolean(),
  /** What it is called: the name its mother gave it, or the one he chose in its place when he was there. */
  name: z.string(),
  /**
   * How the child is doing, as a level of the house's own scale, when it lives in his house. Left out, it is at the
   * University's creche, where it costs him nothing and is nobody's worry.
   */
  health: z.number().int().min(0).optional()
})
export type Child = z.infer<typeof ChildSchema>

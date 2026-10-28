import { z } from 'zod'

export const METERS = ['affection', 'trust', 'desire'] as const
export const MeterSchema = z.enum(METERS)
export type Meter = z.infer<typeof MeterSchema>

export const RelationshipStageSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** The stage applies once affection reaches this value. */
  minAffection: z.number(),
  description: z.string().default('')
})
export type RelationshipStage = z.infer<typeof RelationshipStageSchema>

/** How much affection a gift is worth, by how well it suits the person. */
export const GiftValuesSchema = z.object({
  loved: z.number().default(6),
  liked: z.number().default(2),
  disliked: z.number().default(-3)
})

/** The words a scene's summary judges each feeling's change in, from worst to best. The LLM writes them, and the parser reads them. */
export const SCENE_CHANGES = ['much less', 'less', 'a little less', 'unchanged', 'a little more', 'more', 'much more'] as const
export type SceneChange = (typeof SCENE_CHANGES)[number]

/** What each of those words moves a feeling by, before what he has that bears on it. */
export const SceneChangeValuesSchema = z.object({
  'much less': z.number().default(-8),
  less: z.number().default(-4),
  'a little less': z.number().default(-1),
  unchanged: z.number().default(0),
  'a little more': z.number().default(1),
  more: z.number().default(4),
  'much more': z.number().default(8)
})

/**
 * An arrangement the player can be in with one or more love interests: a couple, an open
 * couple, three together. Stages measure how close two people are; a status is what they
 * have agreed to be.
 */
export const RelationshipStatusSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** What it is, as told to the player and to the characters in it. */
  description: z.string().default(''),
  /** How a character in it should behave because of it. */
  guidance: z.string().default(''),
  /** How many love interests it joins to the player: 1 for a couple, 2 for three together. */
  minMembers: z.number().int().min(1).default(1),
  maxMembers: z.number().int().min(1).default(1),
  /** The love interests in it are also with each other, not only each with the player. */
  mutual: z.boolean().default(false),
  /** Everyone in it has promised to see nobody outside it. */
  exclusive: z.boolean().default(false),
  /** It makes them a couple, or more than one: a girlfriend and up, as against lovers who owe each other nothing. Counted as love found when the year ends. */
  committed: z.boolean().default(false),
  /** The stage each love interest must have reached with the player. */
  minStage: z.string().optional(),
  /** For a mutual arrangement, how close each pair of love interests must be to each other. */
  minTie: z.number().default(0)
})
export type RelationshipStatus = z.infer<typeof RelationshipStatusSchema>

/** A name for how two love interests feel about each other, by how high their tie has grown. */
export const TieLevelSchema = z.object({
  id: z.string(),
  name: z.string(),
  min: z.number(),
  description: z.string().default('')
})
export type TieLevel = z.infer<typeof TieLevelSchema>

/** How two love interests feel about each other when a game begins. */
export const TieSchema = z.object({
  a: z.string(),
  b: z.string(),
  affection: z.number().default(0),
  /** History between them worth telling both: "grew up at the same court", "rivals for the same post". */
  note: z.string().optional()
})

/** When a woman will go to bed with him. */
export const IntimacyRulesSchema = z.object({
  /** Traits that make it easy: a woman with one is held to nothing below. */
  easyTraitIds: z.array(z.string()).default([]),
  /** How much desire for him any other woman must have first. */
  minDesire: z.number().min(0).default(0),
  /** Traits that make her hold back longer, and the desire she must have. */
  reluctantTraitIds: z.array(z.string()).default([]),
  reluctantMinDesire: z.number().min(0).default(0)
})

export const RelationshipConfigSchema = z.object({
  meterMax: z.number().positive().default(100),
  gifts: GiftValuesSchema.prefault({}),
  /** Affection a like on one of her posts is worth, once a post. */
  postLike: z.number().default(1),
  sceneChange: SceneChangeValuesSchema.prefault({}),
  stages: z.array(RelationshipStageSchema).min(1),
  statuses: z.array(RelationshipStatusSchema).default([]),
  tieLevels: z.array(TieLevelSchema).default([]),
  ties: z.array(TieSchema).default([]),
  intimacy: IntimacyRulesSchema.prefault({})
})

/** An arrangement in force between the player and the love interests named. */
export const BondSchema = z.object({
  statusId: z.string(),
  memberIds: z.array(z.string()).min(1),
  /** Game time (hours since start) at which it was agreed. */
  since: z.number().int().min(0)
})
export type Bond = z.infer<typeof BondSchema>

/** An arrangement a love interest has asked for and the player hasn't answered. The status `none` asks to end one. */
export const BondProposalSchema = BondSchema.omit({ since: true })
export type BondProposal = z.infer<typeof BondProposalSchema>
export type RelationshipConfig = z.infer<typeof RelationshipConfigSchema>

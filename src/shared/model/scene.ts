import { z } from 'zod'
import { MAX_SCENE_CAST, ProposalSchema } from './appointment'
import { GiftReactionSchema } from './item'
import { BondProposalSchema } from './relationship'
import { RelationshipStateSchema } from './state'

export const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string()
})
export type ChatMessage = z.infer<typeof ChatMessageSchema>

/** One thing the player and a love interest did together during a scene. */
export const SceneBeatSchema = z.object({
  activityName: z.string(),
  locationName: z.string().optional(),
  /** Shown as narration before anyone speaks, when the beat isn't a content-pack activity. */
  description: z.string().optional()
})
export type SceneBeat = z.infer<typeof SceneBeatSchema>

/** A gift given during a scene, and how well it suited the person. */
export const SceneGiftSchema = z.object({
  name: z.string(),
  description: z.string().default(''),
  reaction: GiftReactionSchema,
  /** Who it was given to. Unset in scenes saved before groups, where it was the scene's love interest. */
  recipientId: z.string().optional()
})
export type SceneGift = z.infer<typeof SceneGiftSchema>

/** How things stood just before the scene began, so its end can show what changed. */
export const SceneBaselineSchema = z.object({
  stats: z.record(z.string(), z.number()),
  energy: z.number(),
  money: z.number(),
  relationship: RelationshipStateSchema,
  /** The same for anyone else in the scene, by love interest id. */
  companions: z.record(z.string(), RelationshipStateSchema).default({})
})
export type SceneBaseline = z.infer<typeof SceneBaselineSchema>

/**
 * An outing with a love interest, or up to three of them: everything from the first
 * shared activity until the player ends it. Lives only while it is happening; when it ends
 * it is condensed into a single Memory and the transcript is thrown away.
 */
export const SceneSchema = z.object({
  /** The love interest the scene is with; in a group, the one who leads it. */
  loveInterestId: z.string(),
  /** Other love interests in the scene. */
  companionIds: z.array(z.string()).max(MAX_SCENE_CAST - 1).default([]),
  /** Routes the scene's AI calls to the NSFW LLM. */
  nsfw: z.boolean().default(false),
  beats: z.array(SceneBeatSchema),
  messages: z.array(ChatMessageSchema),
  /** Gifts handed over during the scene, in order. */
  gifts: z.array(SceneGiftSchema).default([]),
  /** How the love interest currently appears, as last chosen by the LLM. Unset means the defaults. */
  outfitId: z.string().optional(),
  expression: z.string().optional(),
  /** When set, this animation plays in place of the sprite. */
  animationId: z.string().optional(),
  /** A plan to meet that the love interest has suggested and the player hasn't answered yet. */
  proposal: ProposalSchema.optional(),
  /** A change to what they are to each other that a love interest has asked for and the player hasn't answered. */
  bondProposal: BondProposalSchema.optional(),
  /** Missing in scenes saved before baselines existed. */
  baseline: SceneBaselineSchema.optional()
})
export type Scene = z.infer<typeof SceneSchema>

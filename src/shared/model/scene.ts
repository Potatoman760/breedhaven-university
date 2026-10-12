import { SceneShiftSchema } from './job'
import { z } from 'zod'
import { MAX_SCENE_CAST, ProposalSchema } from './appointment'
import { SceneDramaSchema } from './drama'
import { GiftReactionSchema } from './item'
import { BondProposalSchema } from './relationship'
import { RelationshipStateSchema } from './state'

export const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  /**
   * The hidden lines a reply began with (the look on her face, how comfortable she is), as
   * she wrote them. Never shown, but sent back with the reply in later turns, so that what
   * she has written before keeps showing her how a reply begins.
   */
  tags: z.string().optional()
})
export type ChatMessage = z.infer<typeof ChatMessageSchema>

/** A class the scene is set in. */
export const LessonSchema = z.object({
  /** The name the teacher's lines are written under: a love interest's first name when she is in the scene, the professor's name otherwise. */
  speaker: z.string(),
  /** The course, as it is spoken of: "Riddles (RID 101)". */
  course: z.string(),
  /** What the course is about, from its description. */
  about: z.string().default('')
})
export type Lesson = z.infer<typeof LessonSchema>

/** One thing the player and a love interest did together during a scene. */
export const SceneBeatSchema = z.object({
  activityName: z.string(),
  locationName: z.string().optional(),
  /** It is over: the scene has since moved on from where it happened. */
  finished: z.boolean().optional(),
  /** Shown as narration before anyone speaks, when the beat isn't a content-pack activity. */
  description: z.string().optional(),
  /** Told to the LLM: what is going on around the characters and what the scene is for. */
  direction: z.string().optional()
})
export type SceneBeat = z.infer<typeof SceneBeatSchema>

/** A gift given during a scene, and how well it suited the person. */
export const SceneGiftSchema = z.object({
  name: z.string(),
  description: z.string(),
  reaction: GiftReactionSchema,
  /** Who it was given to. */
  recipientId: z.string()
})
export type SceneGift = z.infer<typeof SceneGiftSchema>

/** How things stood just before the scene began, so its end can show what changed. */
export const SceneBaselineSchema = z.object({
  stats: z.record(z.string(), z.number()),
  energy: z.number(),
  money: z.number(),
  /** What he had banked toward the next point of each stat, and his marks in each course, so that work done in the scene can be told. */
  training: z.record(z.string(), z.number()).optional(),
  coursePoints: z.record(z.string(), z.number()).optional(),
  /** The game time just before the scene began, so that how long it has taken can be told. */
  time: z.number().int().min(0),
  relationship: RelationshipStateSchema,
  /** The same for anyone else in the scene, by love interest id. */
  companions: z.record(z.string(), RelationshipStateSchema)
})
export type SceneBaseline = z.infer<typeof SceneBaselineSchema>

/** How someone felt on leaving a scene before it was over. */
export const DEPARTURE_FEELINGS = ['content', 'hurt', 'angry'] as const
export type DepartureFeeling = (typeof DEPARTURE_FEELINGS)[number]

/** A love interest who was in a scene and left before it ended. */
export const DepartureSchema = z.object({
  id: z.string(),
  /** How many of the scene's messages she was there for. Her memory of it stops there. */
  at: z.number().int().min(0),
  feeling: z.enum(DEPARTURE_FEELINGS),
  /** Why she went, in a few words. */
  reason: z.string(),
  /** She did not walk out: the scene went somewhere else and she stayed where it had been. She is not seen in the new place. */
  behind: z.boolean().optional()
})
export type Departure = z.infer<typeof DepartureSchema>

/**
 * An outing with a love interest, or up to three of them: everything from the first
 * shared activity until the player ends it. Lives only while it is happening; when it ends
 * it is condensed into a single Memory and the transcript is thrown away.
 */
/**
 * How much a love interest wants to be in the scene, as she last said it herself: 5 at ease,
 * down to 1 wanting to leave now, with her reason in a few words. Kept for the LLM alone:
 * it is given back to her in the next prompt, and nothing in the game shows it or acts on it.
 */
export const ComfortSchema = z.object({
  level: z.number().int().min(1).max(5),
  reason: z.string()
})
export type Comfort = z.infer<typeof ComfortSchema>

export const SceneSchema = z.object({
  /** The love interest the scene is with; in a group, the one who leads it. */
  loveInterestId: z.string(),
  /** The scene is with an NPC, not a love interest: `loveInterestId` is the NPC's id. */
  npc: z.boolean(),
  /** Other love interests in the scene. */
  companionIds: z.array(z.string()).max(MAX_SCENE_CAST - 1),
  /** Routes the scene's AI calls to the NSFW LLM. */
  nsfw: z.boolean(),
  beats: z.array(SceneBeatSchema),
  messages: z.array(ChatMessageSchema),
  /** Gifts handed over during the scene, in order. */
  gifts: z.array(SceneGiftSchema),
  /** How the love interest currently appears, as last chosen by the LLM. Unset means the defaults. */
  outfitId: z.string().optional(),
  expression: z.string().optional(),
  /** How the other love interests in the scene appear, by id. The lead's look is the two fields above. */
  looks: z.record(z.string(), z.object({ outfitId: z.string().optional(), expression: z.string().optional() })).optional(),
  /** The scene is a shift at the player's job: he is paid for it when it ends. */
  shift: SceneShiftSchema.optional(),
  /** The scene is a class: who teaches it and what, for the lecture it opens with. */
  lesson: LessonSchema.optional(),
  /** How comfortable each love interest in the scene last said she was, by id. For the LLM only. */
  comfort: z.record(z.string(), ComfortSchema).optional(),
  /** The scene is in this love interest's own room. */
  roomOf: z.string().optional(),
  /** The view of the place the player has picked, if any, so the character knows exactly where they are. */
  backgroundId: z.string().optional(),
  /** A view of the place the scene insists on, whatever the day would show: the maternity room, for a birth. Gone when the scene moves. */
  viewId: z.string().optional(),
  /** A picture that is the whole stage for this scene, in place of the background and with nobody standing over it. Gone when the scene moves. */
  picture: z.string().optional(),
  /** When set, this animation plays in place of the sprite. */
  animationId: z.string().optional(),
  /** Whose pose that is, by love interest id: one of those in the scene. Only one is shown at a time. */
  animationOf: z.string().optional(),
  /** A plan to meet that the love interest has suggested and the player hasn't answered yet. */
  proposal: ProposalSchema.optional(),
  /** Love interests who were in the scene and have left it, in the order they went. */
  departed: z.array(DepartureSchema),
  /** Love interests who conceived during this scene. */
  conceived: z.array(z.string()),
  /** A change to what they are to each other that a love interest has asked for and the player hasn't answered. */
  bondProposal: BondProposalSchema.optional(),
  baseline: SceneBaselineSchema,
  /** Someone the drama engine has decided will turn up, or who already has. */
  drama: SceneDramaSchema.optional()
})
export type Scene = z.infer<typeof SceneSchema>

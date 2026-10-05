import { z } from 'zod'
import { ConditionSchema } from './condition'
import { StudiesSchema } from './course'
import { StatSchema } from './stats'

/**
 * One picture of the character. Written in content either as just the image path, or as
 * an object that also describes it so the LLM can tell when it fits.
 */
export const SpriteSchema = z
  .union([z.string(), z.object({ image: z.string(), description: z.string().default('') })])
  .transform((sprite) => (typeof sprite === 'string' ? { image: sprite, description: '' } : sprite))
export type Sprite = z.infer<typeof SpriteSchema>

export const OutfitSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Described to the AI so it can reference what the character is wearing. */
  description: z.string().default(''),
  /** Sprites keyed by their title, usually an expression: `neutral`, `happy`, `blush`. */
  sprites: z.record(z.string(), SpriteSchema).default({})
})
export type Outfit = z.infer<typeof OutfitSchema>

/**
 * A looping video that takes the place of the character's sprite. The LLM decides when
 * to play one from its name and description.
 */
export const AnimationSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Tells the LLM what the animation shows, so it knows when it fits. */
  description: z.string().default(''),
  /** Video path inside the content pack, e.g. an .mp4 file. */
  video: z.string()
})
export type Animation = z.infer<typeof AnimationSchema>

/** Where the character is at a given time. The first matching entry wins. */
export const ScheduleEntrySchema = z.object({
  weekdays: z.array(z.string()).optional(),
  periods: z.array(z.string()).optional(),
  locationId: z.string()
})
export type ScheduleEntry = z.infer<typeof ScheduleEntrySchema>

export const SecretSchema = z.object({
  text: z.string(),
  /** Until these pass, the character keeps the secret to themselves. */
  revealWhen: z.array(ConditionSchema).default([])
})
export type Secret = z.infer<typeof SecretSchema>

/** Fields that exist only to steer the AI when this character speaks. */
export const LoveInterestAiSchema = z.object({
  speechPattern: z.string(),
  tone: z.string().default(''),
  verbalQuirks: z.array(z.string()).default([]),
  exampleDialogue: z.array(z.object({ user: z.string(), reply: z.string() })).default([]),
  backstory: z.string().default(''),
  goals: z.array(z.string()).default([]),
  secrets: z.array(SecretSchema).default([]),
  avoidTopics: z.array(z.string()).default([]),
  /** How the character treats the player at each relationship stage, keyed by stage id. */
  stageNotes: z.record(z.string(), z.string()).default({}),
  extraInstructions: z.string().default('')
})
export type LoveInterestAi = z.infer<typeof LoveInterestAiSchema>

export const LoveInterestSchema = z.object({
  id: z.string(),
  name: z.string(),
  age: z.number().int().min(18),
  pronouns: z.string(),
  bio: z.string().default(''),
  appearance: z.string().default(''),
  personality: z.string(),
  traitIds: z.array(z.string()).default([]),
  likes: z.array(z.string()).default([]),
  dislikes: z.array(z.string()).default([]),
  /**
   * The stats they are drawn to in the player. High ones make them warmer, quicker to
   * grow fond, and more likely to write and invite him unprompted.
   */
  admires: z.array(StatSchema).max(3).default([]),
  birthday: z.object({ month: z.string(), day: z.number().int().min(1) }).optional(),
  outfits: z.array(OutfitSchema).min(1),
  defaultOutfitId: z.string(),
  /**
   * How far down their sprites the face sits, as a percentage of the image height. Used
   * to crop small portraits. Most figures fill the image, with the face near the top.
   */
  faceY: z.number().min(0).max(100).default(4),
  /** Omitted for characters who aren't students and so get no course. */
  studies: StudiesSchema.optional(),
  animations: z.array(AnimationSchema).default([]),
  schedule: z.array(ScheduleEntrySchema).default([]),
  ai: LoveInterestAiSchema
})
export type LoveInterest = z.infer<typeof LoveInterestSchema>

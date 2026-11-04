import { z } from 'zod'
import { EXPRESSIONS, NSFW_POSES, NSFW_PREGNANT_POSES, pregnantPoseId } from './loveInterest'

/**
 * A face the player has added to the standard ones. Every character gets a slot for it beside her standard faces, and
 * the LLM is offered it only for one who has its picture.
 */
export const CustomExpressionSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** What it shows, told to the LLM so that it knows when it fits. */
  description: z.string().default(''),
  /** How it is asked of the image model, after "she has". Left empty, it is asked for by its name. */
  draws: z.string().default('')
})
export type CustomExpression = z.infer<typeof CustomExpressionSchema>

/**
 * A sex-act the player has added to the standard ones: a slot for it in every character's NSFW section, and in the row
 * drawn pregnant, as every standard one has.
 */
export const CustomActSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** What it shows, told to the LLM when the character has nothing of her own written for it. */
  description: z.string().default(''),
  /** What its picture is asked for with. */
  draws: z.string().default(''),
  /** What a group's picture of it is asked for with, all of them in it: two women. Left empty, its own, for one woman. */
  groupDraws: z.string().default(''),
  /** The same for a group of three women. Left empty, the two women's. */
  foursomeDraws: z.string().default(''),
  /** A single moment, as a creampie is: shown for the one reply and never twice running. */
  moment: z.boolean().default(false),
  /** It shows him finishing inside her: choosing it counts as the [SEEDED] tag does. */
  seeding: z.boolean().default(false),
  /** He is in the picture. Off for one that shows only her, or them, as what follows the act does. */
  manShown: z.boolean().default(true)
})
export type CustomAct = z.infer<typeof CustomActSchema>

/** A standard sex-act's image prompts as the pack has rewritten them, over the ones in the code: any left out are the code's. */
export const ActPromptsSchema = z.object({
  draws: z.string().optional(),
  groupDraws: z.string().optional(),
  foursomeDraws: z.string().optional()
})
export type ActPrompts = z.infer<typeof ActPromptsSchema>

/** The faces and sex-acts added in the editor's section for them, over the standard ones in the code. */
export const LooksSchema = z.object({
  expressions: z.array(CustomExpressionSchema).default([]),
  acts: z.array(CustomActSchema).default([]),
  /** The standard sex-acts' image prompts, by id, where the pack words them its own way. Written in the editor while the game is written. */
  prompts: z.record(z.string(), ActPromptsSchema).optional()
})
export type Looks = z.infer<typeof LooksSchema>

/** Every face an outfit has a slot for: the standard ones, then those added. */
export function facesOf(looks: Looks): string[] {
  return [...EXPRESSIONS, ...looks.expressions.map((face) => face.id)]
}

/** A sex-act with a slot of its own in every NSFW section, and what its picture is drawn from. */
export interface StandardPose {
  id: string
  name: string
  description: string
  draws: string
  /** What a group's picture of it is asked for with, in place of `draws`: two women, and three. */
  groupDraws?: string
  foursomeDraws?: string
  /** He is in the picture. Left out, he is. */
  manShown?: boolean
}

/**
 * The slots of the NSFW section: the standard sex-acts and those added (`poses`), and the row of every one of them
 * drawn pregnant (`pregnant`).
 */
export function posesOf(looks: Looks): { poses: StandardPose[]; pregnant: StandardPose[]; all: StandardPose[] } {
  // A standard one as the pack words it, where it does; its pregnant form is drawn from the same words.
  const worded = <P extends StandardPose>(pose: P, id: string): P => {
    const own = looks.prompts?.[id]
    if (!own) return pose
    const kept = Object.fromEntries(Object.entries(own).filter(([, text]) => text !== undefined && text.trim() !== ''))
    return { ...pose, ...kept }
  }
  const poses: StandardPose[] = [...NSFW_POSES.map((pose) => worded(pose, pose.id)), ...looks.acts]
  const pregnant: StandardPose[] = [...NSFW_PREGNANT_POSES.map((pose) => worded(pose, pose.base)), ...looks.acts.map((act) => ({ ...act, id: pregnantPoseId(act.id), name: `${act.name}, pregnant` }))]
  return { poses, pregnant, all: [...poses, ...pregnant] }
}

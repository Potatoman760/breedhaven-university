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
  /** A single moment, as a creampie is: shown for the one reply and never twice running. */
  moment: z.boolean().default(false),
  /** It shows him finishing inside her: choosing it counts as the [SEEDED] tag does. */
  seeding: z.boolean().default(false)
})
export type CustomAct = z.infer<typeof CustomActSchema>

/** The faces and sex-acts added in the editor's section for them, over the standard ones in the code. */
export const LooksSchema = z.object({
  expressions: z.array(CustomExpressionSchema).default([]),
  acts: z.array(CustomActSchema).default([])
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
}

/**
 * The slots of the NSFW section: the standard sex-acts and those added (`poses`), and the row of every one of them
 * drawn pregnant (`pregnant`).
 */
export function posesOf(looks: Looks): { poses: StandardPose[]; pregnant: StandardPose[]; all: StandardPose[] } {
  const poses: StandardPose[] = [...NSFW_POSES, ...looks.acts]
  const pregnant: StandardPose[] = [...NSFW_PREGNANT_POSES, ...looks.acts.map((act) => ({ ...act, id: pregnantPoseId(act.id), name: `${act.name}, pregnant` }))]
  return { poses, pregnant, all: [...poses, ...pregnant] }
}

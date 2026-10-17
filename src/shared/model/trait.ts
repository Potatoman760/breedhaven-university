import { z } from 'zod'

export const TraitSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** What the trait is and how it shows in what the character says and does. Given to the LLM as written. */
  definition: z.string(),
  /**
   * What the trait does to the drama engine's reckoning of someone who has it: `jealousy`
   * is added to how likely she is to walk in on the player with someone else (negative for
   * a trait that makes her take it lightly), `sociable` to how likely she is to drop in on a friend.
   */
  drama: z.object({ jealousy: z.number().default(0), sociable: z.number().default(0) }).prefault({})
})
export type Trait = z.infer<typeof TraitSchema>

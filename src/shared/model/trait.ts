import { z } from 'zod'

export const TraitSchema = z.object({
  id: z.string(),
  name: z.string(),
  definition: z.string(),
  category: z.string().optional(),
  /** How the trait should show up in the character's dialogue and choices. */
  aiGuidance: z.string().optional()
})
export type Trait = z.infer<typeof TraitSchema>

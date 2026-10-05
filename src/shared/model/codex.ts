import { z } from 'zod'
import { ConditionSchema } from './condition'

export const CodexEntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  category: z.string(),
  content: z.string(),
  /** Words that pull this entry into the AI prompt when they come up in conversation. */
  keywords: z.array(z.string()).default([]),
  /** Always sent to the AI (once unlocked), regardless of the conversation. */
  alwaysInclude: z.boolean().default(false),
  /** Higher priority entries win when the prompt budget is tight. */
  priority: z.number().default(0),
  relatedLocationIds: z.array(z.string()).default([]),
  relatedCharacterIds: z.array(z.string()).default([]),
  /** When false the entry stays hidden until `unlockWhen` passes or an effect unlocks it. */
  startsUnlocked: z.boolean().default(true),
  unlockWhen: z.array(ConditionSchema).default([])
})
export type CodexEntry = z.infer<typeof CodexEntrySchema>

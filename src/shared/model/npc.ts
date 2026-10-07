import { z } from 'zod'
import { LoveInterestSchema } from './loveInterest'

/** The words for someone, from their pronouns as written ("she/her", "he/him", "they/them"). */
export function pronounWords(pronouns: string | undefined): { subject: string; object: string; possessive: string; has: string } {
  const first = (pronouns ?? '').trim().toLowerCase().split('/')[0]
  if (first === 'he') return { subject: 'he', object: 'him', possessive: 'his', has: 'has' }
  if (first === 'they') return { subject: 'they', object: 'them', possessive: 'their', has: 'have' }
  return { subject: 'she', object: 'her', possessive: 'her', has: 'has' }
}

/**
 * Someone the player can talk to who is not a love interest: a matron, a smith, a boss.
 * She is a character like any other, of the kind `npc`: there are no meters, gifts or
 * arrangements with her, and she is found only where her work has her.
 */
export const NpcSchema = LoveInterestSchema.extend({ kind: z.literal('npc').default('npc') })
export type Npc = z.infer<typeof NpcSchema>

import { z } from 'zod'
import { AnimationSchema } from './loveInterest'

/** How many love interests a group is of. */
export const GROUP_SIZE = { least: 2, most: 3 } as const

/**
 * Two or three love interests together, with sex-act pictures and clips of all of them at once. In a scene with exactly
 * them in it, a sex-act the LLM asks for is shown from the group when the group has it, in place of the one woman's.
 */
export const GroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  memberIds: z.array(z.string()).min(GROUP_SIZE.least).max(GROUP_SIZE.most),
  /** Its sex-acts, as a character's are written: by the act's id, each a picture and, if it has one, a clip. Drawn with a man of light skin. */
  animations: z.array(AnimationSchema).default([]),
  /** The same, drawn with a man of medium or dark skin, by tone, as a character's are (`withSkinTone`). */
  tonedAnimations: z.partialRecord(z.enum(['medium', 'dark']), z.array(AnimationSchema)).default({}),
  /**
   * Positioning: for a sex-act, the order its picture describes the women in, by id, first to last: who is the first
   * woman, the one on top, the one in the middle. Left out, the order of `memberIds`. The same for every tone.
   */
  positions: z.record(z.string(), z.array(z.string())).default({})
})
export type Group = z.infer<typeof GroupSchema>

/** The group's members in the order a sex-act's picture describes them: its positioning, then any it leaves out. */
export function positioned(group: Pick<Group, 'memberIds' | 'positions'>, actId: string): string[] {
  const members = group.memberIds.filter((id) => id !== '')
  const order = (group.positions[actId] ?? []).filter((id) => members.includes(id))
  return [...new Set([...order, ...members])]
}

/** What a group's pictures and clips are filed under in the content: a folder of its own beside the characters'. */
export function groupFiles(groupId: string): string {
  return `group-${groupId}`
}

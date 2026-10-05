import { z } from 'zod'

/** The player's six abilities. Classes mostly raise the last three; the rest come from how free time is spent. */
export const STATS = ['strength', 'dexterity', 'endurance', 'intelligence', 'charisma', 'wisdom'] as const
export const StatSchema = z.enum(STATS)
export type Stat = z.infer<typeof StatSchema>

/** Three-letter labels for tight spaces. */
export const STAT_LABELS: Record<Stat, string> = {
  strength: 'STR',
  dexterity: 'DEX',
  endurance: 'END',
  intelligence: 'INT',
  charisma: 'CHA',
  wisdom: 'WIS'
}

/** A note sent between the player and a love interest by the intercampus courier. */
export const CourierNoteSchema = z.object({
  from: z.enum(['player', 'them']),
  text: z.string(),
  /** Game time (hours since start) at which it was sent. */
  time: z.number().int().min(0),
  /** A plan the love interest suggests in this note. */
  proposal: z
    .object({
      loveInterestId: z.string(),
      companionIds: z.array(z.string()).default([]),
      title: z.string(),
      time: z.number().int().min(0),
      hours: z.number().int().min(1),
      locationId: z.string()
    })
    .optional(),
  /** What became of the proposal: lapsed means its time passed or filled up before an answer. */
  answer: z.enum(['accepted', 'declined', 'lapsed']).optional(),
  /** False for a note from them the player hasn't opened yet. */
  read: z.boolean().default(true)
})
export type CourierNote = z.infer<typeof CourierNoteSchema>

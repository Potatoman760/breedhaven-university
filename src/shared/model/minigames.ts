import { z } from 'zod'

/** The pictures each drill's game is drawn with, by what they are of. Each is an emblem cut out of its card. */
export const MINIGAME_PIECES = ['barbell', 'iron', 'heart', 'dial', 'tile', 'spark', 'lamp', 'candle', 'flame-red', 'flame-orange', 'flame-gold', 'flame-green', 'flame-blue', 'flame-violet', 'compliment', 'joke', 'comfort', 'space'] as const
export type MiniGamePiece = (typeof MINIGAME_PIECES)[number]

/** The moods a stranger's face shows in the game for charisma, each answered by one tone. */
export const MOODS = ['happy', 'bored', 'sad', 'annoyed'] as const
export type Mood = (typeof MOODS)[number]

const PictureSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Made by `scripts/generate-icons.ts`; until then the game draws a plain shape in its place. */
  iconImage: z.string().optional()
})

/** A stranger whose face he reads: her face in each mood, all drawn as the same woman. */
export const ListenerSchema = z.object({
  id: z.string(),
  name: z.string(),
  faces: z.partialRecord(z.enum(MOODS), z.string()).default({})
})
export type Listener = z.infer<typeof ListenerSchema>

/** What the drills' games are drawn with, and the strangers of the one for charisma. */
export const MiniGamesSchema = z.object({
  pieces: z.array(PictureSchema).default([]),
  listeners: z.array(ListenerSchema).default([])
})
export type MiniGames = z.infer<typeof MiniGamesSchema>

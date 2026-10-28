import { z } from 'zod'

/** The pictures each drill's game is drawn with, by what they are of. Each is an emblem cut out of its card. */
export const MINIGAME_PIECES = ['barbell', 'iron', 'heart', 'dial', 'tile', 'spark', 'lamp', 'lotus', 'card'] as const
export type MiniGamePiece = (typeof MINIGAME_PIECES)[number]

const PictureSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Made by `scripts/generate-icons.ts`; until then the game draws a plain shape in its place. */
  iconImage: z.string().optional()
})

/** Something he can bring up when he is working a room: books, sport, gossip. */
export const TalkTopicSchema = PictureSchema
export type TalkTopic = z.infer<typeof TalkTopicSchema>

/** A stranger in a room he is working: what she warms to, and what bores her. */
export const ListenerSchema = PictureSchema.extend({
  likes: z.array(z.string()).default([]),
  dislikes: z.array(z.string()).default([])
})
export type Listener = z.infer<typeof ListenerSchema>

/** What the drills' games are drawn with, and the people and talk of the one for charisma. */
export const MiniGamesSchema = z.object({
  pieces: z.array(PictureSchema).default([]),
  topics: z.array(TalkTopicSchema).default([]),
  listeners: z.array(ListenerSchema).default([])
})
export type MiniGames = z.infer<typeof MiniGamesSchema>

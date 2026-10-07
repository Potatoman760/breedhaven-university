import { z } from 'zod'

/** One post on Bloomr, the University's feed: a few public words from a love interest about her day. */
export const PostSchema = z.object({
  id: z.string(),
  authorId: z.string(),
  /** Game time (hours since start) at which it was posted. */
  time: z.number().int().min(0),
  text: z.string(),
  /** Image path inside the content pack, for a post that has a picture. */
  image: z.string().optional(),
  /** The player has liked it. */
  liked: z.boolean().default(false)
})
export type Post = z.infer<typeof PostSchema>

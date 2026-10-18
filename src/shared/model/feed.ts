import { z } from 'zod'

/** A post that is going to be made: who by, when, where she will be, and who is in the picture with her. */
export const PostPlanSchema = z.object({
  authorId: z.string(),
  /** Game time (hours since start) at which it goes up. */
  time: z.number().int().min(0),
  locationId: z.string().optional(),
  /** The friend in the selfie with her, when it is not of her alone. */
  withId: z.string().optional()
})
export type PostPlan = z.infer<typeof PostPlanSchema>

/** One post on Bloomr, the University's photo feed: a selfie and a few public words from a love interest about her day. */
export const PostSchema = z.object({
  id: z.string(),
  authorId: z.string(),
  /** Game time (hours since start) at which it goes up. One made ahead of its time is not on the feed until then. */
  time: z.number().int().min(0),
  text: z.string(),
  /** Image path inside the content pack, for a post that has a picture. */
  image: z.string().optional(),
  /** The friend in the picture with her. */
  withId: z.string().optional(),
  /** The player has liked it. */
  liked: z.boolean().default(false),
  /** His like has warmed her to him: the first like of a post does, once, however often it is taken back and given again. */
  likeCounted: z.boolean().default(false)
})
export type Post = z.infer<typeof PostSchema>

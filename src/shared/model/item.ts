import { z } from 'zod'

/** Something the player can buy and give as a gift. */
export const ItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(''),
  price: z.number().int().min(0),
  /** Name of a built-in icon, e.g. `flower`, `book`, `ribbon`. Unknown names show a gift box. */
  icon: z.string().default('gift'),
  /**
   * What kind of thing it is. A love interest loves a gift whose tags appear in their
   * likes, and dislikes one whose tags appear in their dislikes.
   */
  tags: z.array(z.string()).default([])
})
export type Item = z.infer<typeof ItemSchema>

/** A market stall: a named set of items sold at one location. */
export const StallSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(''),
  icon: z.string().default('gift'),
  locationId: z.string(),
  itemIds: z.array(z.string())
})
export type Stall = z.infer<typeof StallSchema>

export const GIFT_REACTIONS = ['loved', 'liked', 'disliked'] as const
export const GiftReactionSchema = z.enum(GIFT_REACTIONS)
export type GiftReaction = z.infer<typeof GiftReactionSchema>

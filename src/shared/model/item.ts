import { z } from 'zod'
import { EffectSchema } from './condition'

/** Something the player can carry: a gift to give, or something to use himself. */
export const ItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(''),
  price: z.number().int().min(0),
  /** Name of a built-in icon, e.g. `flower`, `book`, `ribbon`. Unknown names show a gift box. */
  icon: z.string().default('gift'),
  /** What the thing itself looks like, for whoever draws it. */
  appearance: z.string().default(''),
  /** Its picture, relative to the pack: shown in place of the icon where there is one. */
  image: z.string().optional(),
  /**
   * What kind of thing it is. A love interest loves a gift whose tags appear in their
   * likes, and dislikes one whose tags appear in their dislikes.
   */
  tags: z.array(z.string()).default([]),
  /** What using it does, when it is something he can use and not only give: on himself, or on a woman he is with. */
  use: z.object({ effects: z.array(EffectSchema).min(1), on: z.enum(['self', 'her']).default('self') }).optional(),
  /** What it does used in a fight below: footing given back to one of the party, and whether it settles a pregnant woman's surge. */
  below: z.object({ footing: z.number().min(0).default(0), calms: z.boolean().default(false) }).optional(),
  /** A gift nobody could fail to love: something made for the giving. */
  lovedByAll: z.boolean().default(false)
})
export type Item = z.infer<typeof ItemSchema>

/** A market stall: a named set of items sold at one location. */
export const StallSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(''),
  icon: z.string().default('gift'),
  /** Its emblem: a picture in the pack, shown in place of the drawn icon. */
  iconImage: z.string().optional(),
  locationId: z.string(),
  itemIds: z.array(z.string())
})
export type Stall = z.infer<typeof StallSchema>

export const GIFT_REACTIONS = ['loved', 'liked', 'disliked'] as const
export const GiftReactionSchema = z.enum(GIFT_REACTIONS)
export type GiftReaction = z.infer<typeof GiftReactionSchema>

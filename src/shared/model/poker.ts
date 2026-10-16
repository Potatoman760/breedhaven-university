import { z } from 'zod'

/**
 * How one player at the table plays, each from 0 to 1. Tight folds more of what she is dealt; aggressive bets and
 * raises where another would call; bluff is how often she bets what she does not have.
 */
export const PokerStyleSchema = z.object({
  tight: z.number().min(0).max(1).default(0.5),
  aggressive: z.number().min(0).max(1).default(0.5),
  bluff: z.number().min(0).max(1).default(0.1)
})
export type PokerStyle = z.infer<typeof PokerStyleSchema>

/** One of the regulars who fills a seat nobody he knows has taken. */
export const PokerRegularSchema = z.object({
  id: z.string(),
  name: z.string(),
  style: PokerStyleSchema.prefault({})
})
export type PokerRegular = z.infer<typeof PokerRegularSchema>

/**
 * Fixed-limit Texas hold 'em for small stakes, at one place. Bets come in two sizes, the small one before the turn and
 * the big one from it, a street takes at most `maxBets` bets and raises, and no one puts more than `handCap` into a hand.
 */
export const PokerConfigSchema = z.object({
  /** Where the game is played. */
  locationId: z.string(),
  /** What it is called on the screen of the day. */
  name: z.string(),
  description: z.string().default(''),
  /** The table seen from above, filling the screen: a picture in the pack, with the table round and in its middle. */
  table: z.string().optional(),
  smallBlind: z.number().int().min(1),
  bigBlind: z.number().int().min(1),
  smallBet: z.number().int().min(1),
  bigBet: z.number().int().min(1),
  maxBets: z.number().int().min(1).default(3),
  handCap: z.number().int().min(1),
  /** Everyone at the table, him included. */
  seats: z.number().int().min(2).max(6).default(5),
  /** At most this many of the love interests who are here sit in; regulars fill the seats they leave. */
  maxLoveInterests: z.number().int().min(0).default(5),
  /** How long a sitting takes, taken off the clock when he leaves the table. */
  hours: z.number().int().min(0).default(1),
  regulars: z.array(PokerRegularSchema).min(1)
})
export type PokerConfig = z.infer<typeof PokerConfigSchema>

import { z } from 'zod'

/**
 * Sire housing: a house the Sire Relations Office lets to a registered Sire once someone he is with is carrying his
 * child. He pays rent on it, builds it out room by room, and the mothers of his children can come to live in it. The
 * children who live there cost him money every week, and are well or poorly according to whether he finds it.
 */

const count = z.number().int().min(0).default(0)
// What a room, or a better fitting-out of one, adds to the house. A small vocabulary on purpose.
const effects = {
  /** Places for a love interest to live. */
  beds: count,
  /** Places for a baby. */
  cots: count,
  /** How well the house looks after those in it: it sets how well a baby can come to thrive. */
  comfort: count,
  /** Added to what studying in his own room is worth. */
  study: count
}

/** A change in what a love interest feels for him, made by something that happens to the household. */
const FeelSchema = z.object({ affection: z.number(), trust: z.number() })
export type HouseholdFeeling = z.infer<typeof FeelSchema>

/** A better fitting-out of a room that is already built. */
export const HouseTierSchema = z.object({
  name: z.string(),
  description: z.string().default(''),
  cost: z.number().int().min(0),
  ...effects
})
export type HouseTier = z.infer<typeof HouseTierSchema>

export const HOUSE_ROOM_ROLES = ['common', 'master', 'nanny', 'suite'] as const

/** One room of the house, or of its grounds. */
export const HouseRoomSchema = z.object({
  key: z.string(),
  name: z.string(),
  /** What it is, for him and for anyone told about the house. */
  description: z.string().default(''),
  /** What it is for: his own bedroom, the nanny's, a bedroom someone can be given, or a room of the house at large. */
  role: z.enum(HOUSE_ROOM_ROLES).default('common'),
  /** The view of the house's location that is this room's picture. */
  viewId: z.string(),
  cost: z.number().int().min(0).default(0),
  /** It is there on the day he moves in. */
  startsBuilt: z.boolean().default(false),
  ...effects,
  /** Where it is drawn on the plan of the house: which floor, and its rectangle on that floor's grid. */
  plan: z.object({
    floor: z.number().int().min(0),
    x: z.number().int().min(0),
    y: z.number().int().min(0),
    w: z.number().int().min(1),
    h: z.number().int().min(1),
    outdoors: z.boolean().default(false)
  }),
  /** What it can be made into after it is built, in order. */
  tiers: z.array(HouseTierSchema).default([])
})
export type HouseRoom = z.infer<typeof HouseRoomSchema>

/** How a baby is doing, from worst to best: a name, and what its mother is told of it. */
export const BabyLevelSchema = z.object({ name: z.string(), description: z.string().default('') })

/** The rules of the house. A content pack without this has no housing. */
export const HousingConfigSchema = z.object({
  /** The location that is the house. It is nowhere on the map until he lives there. */
  locationId: z.string(),
  /** What the house is called. Kept here as well as on the location, which is not there to be read before he moves in. */
  name: z.string(),
  /** The officer who writes to him about it, and the nanny who comes with it. */
  officerId: z.string(),
  nannyId: z.string(),
  /** What it costs on the first day of each month. */
  rent: z.number().int().min(0),
  /** Days he has to find rent he could not pay before the house is taken back. */
  graceDays: z.number().int().min(1).default(7),
  /** The periods of the day a love interest who lives there is always at home, whatever her old habits. */
  homePeriods: z.array(z.string()).default([]),
  invite: z.object({ minAffection: z.number().default(30) }).prefault({}),
  babies: z.object({
    /** What one baby in the house costs each week. */
    weeklyCost: z.number().int().min(0),
    /** The level a baby comes into the house at. */
    startLevel: z.number().int().min(0),
    /** The levels, worst first. At the first, its mother takes it away. */
    levels: z.array(BabyLevelSchema).min(2),
    /** The highest level a baby can reach, by how much comfort the house has: the last of these whose comfort it meets. */
    caps: z.array(z.object({ comfort: z.number().int().min(0), level: z.number().int().min(0) })).min(1),
    /** From this level a baby is thriving, and its mother is glad of it each week. */
    thrivingFrom: z.number().int().min(0),
    thriving: FeelSchema,
    /** What a week unpaid for costs him with the baby's mother. */
    neglect: FeelSchema
  }),
  feelings: z.object({ movedIn: FeelSchema, askedToLeave: FeelSchema, leftOverNeglect: FeelSchema, evicted: FeelSchema }),
  /** The messages written to him by the officer and the nanny. `{house}`, `{rent}`, `{amount}` and `{date}` are filled in. */
  texts: z.object({
    offer: z.string(),
    welcome: z.string(),
    nannyHello: z.string(),
    arrears: z.string(),
    paid: z.string(),
    evicted: z.string()
  }),
  /** The floors, from the ground up, by name. */
  floors: z.array(z.string()).min(1),
  /** How many columns and rows each floor's plan is drawn on. */
  grid: z.object({ columns: z.number().int().min(1), rows: z.number().int().min(1) }),
  rooms: z.array(HouseRoomSchema).min(1)
})
export type HousingConfig = z.infer<typeof HousingConfigSchema>

export const HOUSING_STATUSES = ['none', 'offered', 'declined', 'resident', 'evicted'] as const
export type HousingStatus = (typeof HOUSING_STATUSES)[number]

/** One line of the house's accounts. */
export const LedgerLineSchema = z.object({ time: z.number().int().min(0), text: z.string(), amount: z.number() })

/** How things stand with the house in one game. */
export const HousingStateSchema = z.object({
  status: z.enum(HOUSING_STATUSES).default('none'),
  /** When he moved in. Kept after he has left, since the nanny, once met, is not unmet. */
  movedInAt: z.number().int().min(0).optional(),
  /** Where he lived before, and goes back to if the house is taken from him. */
  formerHomeId: z.string().optional(),
  /** The rooms that are built, each with the tier it has reached: 1 as built, 2 after its first fitting-out. */
  rooms: z.record(z.string(), z.number().int().min(1)).default({}),
  /** The love interests who live there, each with her room. The nanny is not listed: she lives there while he does. */
  residents: z.record(z.string(), z.string()).default({}),
  /** Those who lived there and left. None of them will come back. */
  left: z.array(z.string()).default([]),
  /** The room of the house he is in, while he is at it. Unset, the room one comes into. */
  room: z.string().optional(),
  /** The game time up to which rent and the household's week have been reckoned. */
  settledTo: z.number().int().min(0).default(0),
  /** Rent he owes, and the day it fell due. */
  arrears: z.number().int().min(0).default(0),
  arrearsSince: z.number().int().min(0).optional(),
  /** What has been paid and what has not, newest last. */
  ledger: z.array(LedgerLineSchema).default([])
})
export type HousingState = z.infer<typeof HousingStateSchema>

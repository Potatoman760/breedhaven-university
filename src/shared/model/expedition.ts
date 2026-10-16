import { z } from 'zod'
import { ModifierSchema } from './modifier'

/** What a woman does in a party: one of these is written in her file, and with it what she can do in a fight. */
export const ROLES = ['guard', 'striker', 'hexer', 'warder', 'healer'] as const
export const RoleSchema = z.enum(ROLES)
export type Role = z.infer<typeof RoleSchema>

/**
 * What an action in a fight does. `attack` hurts one enemy; `weaken` hurts it a little and has it hit less hard for
 * a few rounds; `shield` puts up a ward that takes the next hits meant for the party; `heal` gives one of the party
 * her footing back; `guard` halves what she takes until her next turn; `taunt` does that and draws the enemy to her.
 */
export const ACTION_KINDS = ['attack', 'weaken', 'shield', 'heal', 'guard', 'taunt'] as const
export type ActionKind = (typeof ACTION_KINDS)[number]

export const PartyActionSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(ACTION_KINDS),
  /** How much it does: footing taken, given back or warded, before anything about her is counted. Nothing for a guard. */
  power: z.number().min(0).default(0),
  /** Rounds before she can do it again. None, and it is always to hand. */
  cooldown: z.number().int().min(0).default(0)
})
export type PartyAction = z.infer<typeof PartyActionSchema>

export const RoleConfigSchema = z.object({
  id: RoleSchema,
  name: z.string(),
  /** How much she can take before she is down. */
  footing: z.number().int().min(1),
  actions: z.array(PartyActionSchema).min(1)
})
export type RoleConfig = z.infer<typeof RoleConfigSchema>

/** Something the Bloom has made of itself below. */
export const EnemySchema = z.object({
  id: z.string(),
  name: z.string(),
  /** What it looks like, for whoever draws it. */
  appearance: z.string().default(''),
  /** Its picture, relative to the pack. Without one it is drawn as a card with its name on. */
  image: z.string().optional(),
  footing: z.number().int().min(1),
  /** What a hit of its takes, before the die. */
  attack: z.number().min(0),
  /** It hits everyone at once, for less each. */
  sweeps: z.boolean().default(false),
  /** Its hit leaves whoever it lands on doing less for a couple of rounds. */
  hexes: z.boolean().default(false),
  /** The role whose work it cannot stand: hers does half as much again to it. */
  weakTo: RoleSchema.optional()
})
export type Enemy = z.infer<typeof EnemySchema>

/** What is carried up from below: money, and things for the bag. */
export const FindsSchema = z.object({
  money: z.number().int().min(0).default(0),
  items: z.record(z.string(), z.number().int().min(1)).default({})
})
export type Finds = z.infer<typeof FindsSchema>

/**
 * One stop on the way down. A `fight` and the `guardian` are fought; a `find` is something lying there; a
 * `checkpoint` is where what has been found so far is made safe and everyone gets their breath back.
 */
export const NODE_KINDS = ['fight', 'find', 'checkpoint', 'guardian'] as const
export const NodeSchema = z.object({
  kind: z.enum(NODE_KINDS),
  name: z.string().default(''),
  enemyIds: z.array(z.string()).default([]),
  finds: FindsSchema.prefault({})
})
export type ExpeditionNode = z.infer<typeof NodeSchema>

/** What re-seating an anchor leaves him with for good: a modifier, like what a course teaches. */
export const RelicSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  /** Name of a built-in icon, as an item has. */
  icon: z.string().default('stone'),
  /** What the thing itself looks like, for whoever draws it. */
  appearance: z.string().default(''),
  /** Its picture, relative to the pack: shown in place of the icon where there is one. */
  image: z.string().optional(),
  modifier: ModifierSchema
})
export type Relic = z.infer<typeof RelicSchema>

export const DepthSchema = z.object({
  name: z.string(),
  /** What the place looks like, for whoever draws it. */
  appearance: z.string().default(''),
  /** The picture it is fought in front of, relative to the pack. Without one, the way down is shown, darkened. */
  image: z.string().optional(),
  nodes: z.array(NodeSchema).min(1),
  relic: RelicSchema
})
export type Depth = z.infer<typeof DepthSchema>

/** The rules of going below. A content pack without this has no Undercroft. */
export const ExpeditionConfigSchema = z.object({
  name: z.string().default('the Undercroft'),
  /** The picture money that is found is shown with: a pouch of coins, say. */
  moneyImage: z.string().optional(),
  /** Where the way down is. */
  entryLocationId: z.string(),
  /** The day it is first open on, counted from 1. */
  opensOnDay: z.number().int().min(1).default(1),
  /** Who shows him the way down when it opens. Without her, it is simply open. */
  guideId: z.string().optional(),
  /** Being shown it: how long she keeps him, and what she writes to set the hour and to set it again when he did not come. `{date}` and `{place}` are filled in. */
  intro: z.object({ hours: z.number().int().min(1).default(1), text: z.string(), missedText: z.string() }).optional(),
  /** How long a run takes out of his day, however it ends. */
  hours: z.number().int().min(1).default(3),
  /** How many women he may take, and the trust one needs in him to come. */
  partySize: z.number().int().min(1).default(2),
  trustNeeded: z.number().min(0).default(30),
  /** His own footing before his endurance is counted, and what each point of that bonus adds. */
  playerFooting: z.number().int().min(1).default(20),
  footingPerEndurance: z.number().min(0).default(3),
  /** What his Sire's actions cost him in energy, and what an anchored woman's next action is multiplied by. */
  anchorEnergy: z.number().min(0).default(8),
  groundEnergy: z.number().min(0).default(6),
  anchorPower: z.number().min(1).default(1.5),
  /** How much of a woman's footing a checkpoint gives back, as a share. */
  checkpointRest: z.number().min(0).max(1).default(0.4),
  /** Affection at which she strikes true as often as she ever will, and how often that is. A true strike does half as much again. */
  critAffection: z.number().min(1).default(100),
  critChance: z.number().min(0).max(1).default(0.25),
  /** What a woman's work is multiplied by at each stage of a pregnancy, by the stage's id. A stage not named here cannot come. */
  pregnancyPower: z.record(z.string(), z.number().min(1)).default({}),
  /** A pregnant woman's surge: what each thing she does adds, where it breaks loose, what breaking loose takes from everyone, and what grounding her clears. */
  surgePerAction: z.number().min(0).default(1),
  surgeLimit: z.number().min(1).default(3),
  misfire: z.number().min(0).default(5),
  grounds: z.number().min(0).default(2),
  /** Trust gained by each who came when an anchor is re-seated, and lost by each who went down when the run is lost. */
  trustWon: z.number().min(0).default(2),
  trustLost: z.number().min(0).default(2),
  roles: z.array(RoleConfigSchema).min(1),
  enemies: z.array(EnemySchema).min(1),
  depths: z.array(DepthSchema).min(1)
})
export type ExpeditionConfig = z.infer<typeof ExpeditionConfigSchema>

/** The id the player fights under. No character may have it. */
export const HIM = 'him'

/** One of the party in a run: what she has left, and what is on her. */
export const FighterSchema = z.object({
  id: z.string(),
  footing: z.number(),
  max: z.number(),
  /** Rounds left before each of her actions is ready again, by its id. */
  cooldowns: z.record(z.string(), z.number().int()).default({}),
  surge: z.number().default(0),
  /** Until her next turn. */
  guarding: z.boolean().default(false),
  taunting: z.boolean().default(false),
  /** He has steadied her: her next action is stronger. */
  anchored: z.boolean().default(false),
  /** He is standing in front of her: the next hit meant for her is his. */
  covered: z.boolean().default(false),
  /** Rounds for which what she does counts for less. */
  hexed: z.number().int().default(0)
})
export type Fighter = z.infer<typeof FighterSchema>

export const FoeSchema = z.object({
  /** Its place in the fight: two of a kind are told apart by it. */
  key: z.string(),
  enemyId: z.string(),
  footing: z.number(),
  max: z.number(),
  /** Rounds for which it hits less hard. */
  weakened: z.number().int().default(0)
})
export type Foe = z.infer<typeof FoeSchema>

/**
 * Something to be seen happening to one of those in a fight: a cut across an enemy, a ward lighting up over one of
 * the party. The view plays it where she or it stands; nothing of the game depends on it.
 */
export const FX_KINDS = ['slash', 'crit', 'hit', 'absorb', 'ward', 'heal', 'guard', 'anchor', 'ground', 'hex', 'weaken', 'misfire', 'fall'] as const
export const FightFxSchema = z.object({
  kind: z.enum(FX_KINDS),
  /** Whom it is on: the id of one of the party, or an enemy's key. */
  on: z.string(),
  /** The number that goes up with it, when it has one. */
  amount: z.number().optional()
})
export type FightFx = z.infer<typeof FightFxSchema>

/** One thing that happened in a fight, for the view to say, to show on a face, and to play. */
export const FightEventSchema = z.object({
  text: z.string(),
  /** Whose face it changes, and to what. */
  faces: z.record(z.string(), z.string()).default({}),
  fx: z.array(FightFxSchema).default([])
})
export type FightEvent = z.infer<typeof FightEventSchema>

export const FightSchema = z.object({
  foes: z.array(FoeSchema),
  round: z.number().int().default(1),
  /** Whose turn it is, as a place in the party. */
  turn: z.number().int().default(0),
  /** What the last thing done came to. */
  events: z.array(FightEventSchema).default([])
})
export type Fight = z.infer<typeof FightSchema>

/** A run in progress, kept in the save so that it is there again after loading. */
export const ExpeditionRunSchema = z.object({
  depth: z.number().int().min(0),
  node: z.number().int().min(0),
  startedAt: z.number().int(),
  party: z.array(FighterSchema).min(1),
  /** What is left of the ward a warder put up. */
  ward: z.number().default(0),
  /** What has been picked up since the last checkpoint, and what is safe. */
  found: FindsSchema.prefault({}),
  banked: FindsSchema.prefault({}),
  /** Who went down at any point, for what they make of it afterwards. */
  downed: z.array(z.string()).default([]),
  /** How many numbers the run has drawn, so that the next is the next of the same run. */
  rolls: z.number().int().default(0),
  fight: FightSchema.optional(),
  /** The stop he is at is dealt with, and he can go on. */
  done: z.boolean().default(false),
  /** What there is to say of the stop he is at. */
  note: z.string().default(''),
  /** What the stop he is at gave up, for the screen that shows it: a fight won, or something lying there. */
  spoils: FindsSchema.optional(),
  /** Set when it is over and only its reckoning is left. */
  over: z.enum(['won', 'lost', 'left']).optional()
})
export type ExpeditionRun = z.infer<typeof ExpeditionRunSchema>

export const ExpeditionStateSchema = z.object({
  /** How many depths' anchors he has re-seated: the next is the deepest he can go. */
  cleared: z.number().int().min(0).default(0),
  /** The relics he holds, by id. */
  relics: z.array(z.string()).default([]),
  /** He has been shown the way down, and may go. */
  invited: z.boolean().default(false),
  run: ExpeditionRunSchema.optional()
})
export type ExpeditionState = z.infer<typeof ExpeditionStateSchema>
